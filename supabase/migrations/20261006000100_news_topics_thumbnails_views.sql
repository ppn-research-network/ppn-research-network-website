-- Phase 6b · News and events, message topics, recording thumbnails, view counts.
-- Additive only: nothing the live site already uses changes behaviour.

-- ---------------------------------------------------------------------------
-- 1. News and events
-- ---------------------------------------------------------------------------
create table public.news_items (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('news', 'event', 'recruitment', 'opportunity')),
  title             text not null check (length(title) between 5 and 200),
  summary           text not null check (length(summary) between 20 and 1000),
  url               text not null check (url ~ '^https?://' and length(url) <= 500),
  organisation      text check (length(organisation) <= 200),
  scope             text not null default 'national' check (scope in ('national', 'international')),
  location          text check (length(location) <= 200),
  is_online         boolean not null default false,
  starts_on         date,
  ends_on           date,
  closes_on         date,                 -- closing date for recruitment and opportunities
  ethics_reference  text check (length(ethics_reference) <= 300),
  ethics_committee  text check (length(ethics_committee) <= 200),
  members_only      boolean not null default false,
  submitted_by      uuid references auth.users (id) on delete set null,
  submitted_name    text not null check (length(submitted_name) between 2 and 120),
  submitted_email   text not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  review_note       text check (length(review_note) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references auth.users (id) on delete set null,
  check (kind <> 'event' or starts_on is not null),
  check (kind <> 'recruitment' or (ethics_reference is not null and ethics_committee is not null)),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index news_items_status_idx on public.news_items (status, created_at desc);

comment on table public.news_items is
  'News, events, study recruitment and opportunities. Members submit; admins approve. Submitter email is admin-only.';

create function public.news_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.submitted_by := old.submitted_by;
    new.submitted_email := old.submitted_email;
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := now();
      new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger news_items_before_write
  before insert or update on public.news_items
  for each row execute function public.news_before_write();

-- What visitors see: approved items, without submitter details. Members-only
-- items appear only for signed-in members.
create view public.listed_news
with (security_barrier = true)
as
select n.id, n.kind, n.title, n.summary, n.url, n.organisation, n.scope, n.location, n.is_online,
       n.starts_on, n.ends_on, n.closes_on, n.ethics_reference, n.ethics_committee, n.members_only,
       n.approved_at as posted_at
from public.news_items n
where n.status = 'approved' and (not n.members_only or public.is_member());

comment on view public.listed_news is 'Approved news and events. Members-only items only for members. No submitter details.';

-- submit_news(item): members (and admins). Admins' own posts go live at once.
create function public.submit_news(p jsonb)
returns text   -- 'pending' or 'approved'
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_kind text := public.jtext(p, 'kind');
begin
  if not (v_admin or public.is_member()) then
    raise exception 'Only members can post news and events' using errcode = '42501';
  end if;
  if v_kind = 'recruitment' and (public.jtext(p, 'ethics_reference') is null or public.jtext(p, 'ethics_committee') is null) then
    raise exception 'Study recruitment posts need the ethics approval number and the approving committee' using errcode = '22023';
  end if;
  if v_kind = 'event' and public.jtext(p, 'starts_on') is null then
    raise exception 'Please give the date the event starts' using errcode = '22023';
  end if;
  if not v_admin and (select count(*) from public.news_items where submitted_by = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You have posted a lot today. Please try again tomorrow' using errcode = 'P0001';
  end if;

  insert into public.news_items (
    kind, title, summary, url, organisation, scope, location, is_online,
    starts_on, ends_on, closes_on, ethics_reference, ethics_committee, members_only,
    submitted_by, submitted_name, submitted_email, status
  ) values (
    v_kind,
    public.jtext(p, 'title'),
    public.jtext(p, 'summary'),
    public.jtext(p, 'url'),
    public.jtext(p, 'organisation'),
    coalesce(public.jtext(p, 'scope'), 'national'),
    public.jtext(p, 'location'),
    coalesce((p ->> 'is_online')::boolean, false),
    public.jtext(p, 'starts_on')::date,
    public.jtext(p, 'ends_on')::date,
    public.jtext(p, 'closes_on')::date,
    case when v_kind = 'recruitment' then public.jtext(p, 'ethics_reference') end,
    case when v_kind = 'recruitment' then public.jtext(p, 'ethics_committee') end,
    coalesce((p ->> 'members_only')::boolean, false),
    auth.uid(),
    coalesce((select m.full_name from public.members m where m.email = public.auth_email()), public.auth_email()),
    public.auth_email(),
    case when v_admin then 'approved' else 'pending' end
  );
  return case when v_admin then 'approved' else 'pending' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Message topics ("What is this about?")
-- ---------------------------------------------------------------------------
alter table public.contact_requests add column topic text check (topic in (
  'access', 'data_question', 'collaboration', 'mentoring', 'supervision', 'advice', 'other'));

drop function public.send_contact_request(text, uuid, text, text, text, text, boolean, text);

create function public.send_contact_request(
  p_target_type  text,
  p_target_id    uuid,
  p_name         text,
  p_email        text,
  p_institution  text,
  p_message      text,
  p_acknowledged boolean,
  p_website      text default null,
  p_topic        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if nullif(btrim(p_website), '') is not null then
    return;
  end if;

  v_email := public.check_email(p_email);

  if p_acknowledged is not true then
    raise exception 'Please tick the box to confirm you understand how messages are handled' using errcode = '22023';
  end if;

  if p_target_type = 'dataset' then
    if not exists (select 1 from public.datasets where id = p_target_id and status = 'approved') then
      raise exception 'This listing is not available' using errcode = 'P0002';
    end if;
  elsif p_target_type = 'profile' then
    if not exists (select 1 from public.profiles where id = p_target_id and status = 'approved') then
      raise exception 'This listing is not available' using errcode = 'P0002';
    end if;
  else
    raise exception 'Unknown listing type' using errcode = '22023';
  end if;

  if (select count(*) from public.contact_requests r
      where lower(r.sender_email) = v_email and r.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.contact_requests r
         where (r.dataset_id = p_target_id or r.profile_id = p_target_id)
           and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many messages. Please try again later' using errcode = 'P0001';
  end if;

  insert into public.contact_requests (
    dataset_id, profile_id, sender_name, sender_email, sender_institution, message, topic
  ) values (
    case when p_target_type = 'dataset' then p_target_id end,
    case when p_target_type = 'profile' then p_target_id end,
    btrim(p_name),
    v_email,
    nullif(btrim(p_institution), ''),
    btrim(p_message),
    nullif(btrim(p_topic), '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recording thumbnails (uploaded by the sharer or an admin; YouTube ones
--    fetched by the hourly job and stored here)
-- ---------------------------------------------------------------------------
alter table public.resources add column thumbnail_path text check (length(thumbnail_path) <= 300);

update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp'
] where id = 'resources';

drop policy "Members read approved files; admins and uploaders read all" on storage.objects;
create policy "Members read approved files; admins and uploaders read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin()
      or (storage.foldername(name))[2] = auth.uid()::text
      or (public.is_member() and exists (
            select 1 from public.resources r
            where (r.file_path = name or r.thumbnail_path = name) and r.status = 'approved'))
    )
  );

create policy "Admins upload resource files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and public.is_admin());

create or replace function public.share_resource(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := public.jtext(p, 'file_path');
  v_thumb text := public.jtext(p, 'thumbnail_path');
  v_mine text := 'uploads/' || auth.uid()::text || '/%';
begin
  if not public.is_member() then
    raise exception 'Only members can share resources' using errcode = '42501';
  end if;
  if coalesce((p ->> 'confirms_rights')::boolean, false) is not true then
    raise exception 'Please confirm you may share this resource' using errcode = '22023';
  end if;
  if (v_path is not null and v_path not like v_mine) or (v_thumb is not null and v_thumb not like v_mine) then
    raise exception 'That file was not uploaded by you' using errcode = '42501';
  end if;
  if (select count(*) from public.resources where shared_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have shared a lot today. Please try again tomorrow' using errcode = 'P0001';
  end if;

  insert into public.resources (
    title, category, kind, url, file_path, file_type, file_size, thumbnail_path, description, licence,
    presenter, event_date, duration, shared_by, shared_by_name, shared_by_email, confirms_rights
  ) values (
    public.jtext(p, 'title'),
    public.jtext(p, 'category'),
    case when v_path is null then 'link' else 'file' end,
    case when v_path is null then public.jtext(p, 'url') end,
    v_path,
    public.jtext(p, 'file_type'),
    public.jtext(p, 'file_size')::integer,
    v_thumb,
    public.jtext(p, 'description'),
    public.jtext(p, 'licence'),
    public.jtext(p, 'presenter'),
    public.jtext(p, 'event_date')::date,
    public.jtext(p, 'duration'),
    auth.uid(),
    coalesce((select m.full_name from public.members m where m.email = public.auth_email()), public.auth_email()),
    public.auth_email(),
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. View counts (private: owners and admins only). One row per listing per
--    day; no information about who viewed.
-- ---------------------------------------------------------------------------
create table public.listing_views (
  dataset_id  uuid references public.datasets (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete cascade,
  day         date not null default (now() at time zone 'Australia/Sydney')::date,
  views       integer not null default 1,
  check ((dataset_id is null) <> (profile_id is null))
);

create unique index listing_views_dataset_day on public.listing_views (dataset_id, day) where dataset_id is not null;
create unique index listing_views_profile_day on public.listing_views (profile_id, day) where profile_id is not null;

comment on table public.listing_views is 'PRIVATE. Daily view counts per listing. Contains no information about visitors.';

create function public.record_view(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'dataset' and exists (select 1 from public.datasets where id = p_id and status = 'approved') then
    insert into public.listing_views (dataset_id) values (p_id)
    on conflict (dataset_id, day) where dataset_id is not null do update set views = public.listing_views.views + 1;
  elsif p_kind = 'profile' and exists (select 1 from public.profiles where id = p_id and status = 'approved') then
    insert into public.listing_views (profile_id) values (p_id)
    on conflict (profile_id, day) where profile_id is not null do update set views = public.listing_views.views + 1;
  end if;
end;
$$;

-- my_listings now includes views (last 30 days and all time) and messages received.
drop function public.my_listings();
create function public.my_listings()
returns table (
  kind              text,
  id                uuid,
  slug              text,
  status            text,
  listing           jsonb,
  revision_status   text,
  revision_at       timestamptz,
  revision          jsonb,
  revision_note     text,
  admin_note        text,
  review_due        boolean,
  views_30d         integer,
  views_total       integer,
  messages_total    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'dataset', d.id, d.slug, d.status,
         to_jsonb(d) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample' - 'reminder_sent_at',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note,
         d.status = 'approved' and coalesce(d.last_reviewed_at, d.approved_at) < now() - interval '11 months',
         coalesce((select sum(v.views) from public.listing_views v where v.dataset_id = d.id and v.day > current_date - 30), 0)::integer,
         coalesce((select sum(v.views) from public.listing_views v where v.dataset_id = d.id), 0)::integer,
         (select count(*) from public.contact_requests m where m.dataset_id = d.id and m.status in ('queued', 'sent'))::integer
  from public.datasets d
  join public.dataset_contacts c on c.dataset_id = d.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.dataset_id = d.id and r.status in ('pending', 'question')
  where d.status in ('pending', 'approved', 'unpublished')
  union all
  select 'profile', p.id, p.slug, p.status,
         to_jsonb(p) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample' - 'reminder_sent_at',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note,
         p.status = 'approved' and coalesce(p.last_reviewed_at, p.approved_at) < now() - interval '11 months',
         coalesce((select sum(v.views) from public.listing_views v where v.profile_id = p.id and v.day > current_date - 30), 0)::integer,
         coalesce((select sum(v.views) from public.listing_views v where v.profile_id = p.id), 0)::integer,
         (select count(*) from public.contact_requests m where m.profile_id = p.id and m.status in ('queued', 'sent'))::integer
  from public.profiles p
  join public.profile_contacts c on c.profile_id = p.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.profile_id = p.id and r.status in ('pending', 'question')
  where p.status in ('pending', 'approved', 'unpublished');
$$;

-- ---------------------------------------------------------------------------
-- 5. Emails about news posts, and retention
-- ---------------------------------------------------------------------------
alter table public.outbox drop constraint outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in (
  'listing_received', 'listing_approved', 'listing_rejected',
  'revision_approved', 'revision_declined', 'revision_question',
  'membership_received', 'membership_approved', 'membership_declined',
  'resource_approved', 'resource_rejected',
  'news_approved', 'news_rejected',
  'annual_reminder'));

create function public.notify_news_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.queue_email('news_' || new.status, new.submitted_email,
      jsonb_build_object('title', new.title, 'note', new.review_note, 'members_only', new.members_only));
  end if;
  return new;
end;
$$;

create trigger news_items_notify after update of status on public.news_items
  for each row when (old.status is distinct from new.status)
  execute function public.notify_news_decision();

create or replace function public.purge_old_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_n integer;
begin
  delete from public.contact_requests where created_at < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.outbox where created_at < now() - interval '12 months';

  delete from public.datasets
  where status in ('rejected', 'withdrawn') and coalesce(last_reviewed_at, updated_at) < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.profiles
  where status in ('rejected', 'withdrawn') and coalesce(last_reviewed_at, updated_at) < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.members
  where status in ('declined', 'revoked') and coalesce(reviewed_at, requested_at) < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.listing_revisions
  where status in ('declined', 'cancelled') and coalesce(reviewed_at, submitted_at) < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.resources
  where status in ('rejected', 'removed') and updated_at < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.news_items
  where status in ('rejected', 'removed') and updated_at < now() - interval '12 months';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;

create or replace function public.expired_resource_files()
returns table (file_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select f from public.resources r, unnest(array[r.file_path, r.thumbnail_path]) as f
  where r.status in ('rejected', 'removed') and f is not null
    and r.updated_at < now() - interval '12 months';
$$;

-- ---------------------------------------------------------------------------
-- 6. Security
-- ---------------------------------------------------------------------------
alter table public.news_items enable row level security;
alter table public.listing_views enable row level security;

grant select on public.listed_news to anon, authenticated;
grant select, update, delete on public.news_items to authenticated;
grant select on public.listing_views to authenticated;

create policy "Admins read news; submitters read their own"
  on public.news_items for select to authenticated
  using (public.is_admin() or submitted_by = auth.uid());
create policy "Admins update news"
  on public.news_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete news"
  on public.news_items for delete to authenticated using (public.is_admin());

create policy "Admins read view counts"
  on public.listing_views for select to authenticated using (public.is_admin());

grant execute on function public.submit_news(jsonb) to authenticated;
grant execute on function public.record_view(text, uuid) to anon, authenticated;
grant execute on function public.send_contact_request(text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.my_listings() to authenticated;
grant execute on function public.news_before_write() to authenticated;

revoke execute on function public.purge_old_records() from public, anon, authenticated;
revoke execute on function public.expired_resource_files() from public, anon, authenticated;
grant execute on function public.purge_old_records() to service_role;
grant execute on function public.expired_resource_files() to service_role;
