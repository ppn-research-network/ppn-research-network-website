-- Phase 5 · Email automation.
--
-- The hourly GitHub Actions job (automation/) signs in with the service role
-- key, which bypasses these security rules by design. Everything here is
-- invisible to visitors, members and owners.
--
--   outbox          one row per email to send about someone's own submission,
--                   written by triggers the moment the event happens, so
--                   nothing is missed or sent twice.
--   job_state       small key/value store (e.g. when the last digest went out).
--   annual review   owners confirm a listing is still current; the job sends a
--                   yearly reminder.

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table public.outbox (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'listing_received', 'listing_approved', 'listing_rejected',
                'revision_approved', 'revision_declined', 'revision_question',
                'membership_received', 'membership_approved', 'membership_declined',
                'resource_approved', 'resource_rejected',
                'annual_reminder')),
  to_email    text not null,
  details     jsonb not null default '{}',   -- title, note, link and so on
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index outbox_status_idx on public.outbox (status, created_at);

comment on table public.outbox is
  'PRIVATE. Emails waiting to be sent by the hourly job. Written by triggers only.';

create table public.job_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

comment on table public.job_state is 'PRIVATE. Bookkeeping for the hourly email job.';

alter table public.outbox enable row level security;
alter table public.job_state enable row level security;
-- No grants and no policies: only the service role (the job) can use these.

create function public.queue_email(p_kind text, p_to text, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.outbox (kind, to_email, details)
  select p_kind, lower(p_to), coalesce(p_details, '{}')
  where p_to is not null;
$$;

-- ---------------------------------------------------------------------------
-- Listings: received, approved, rejected
-- ---------------------------------------------------------------------------

-- "We received it": fires when the private contact row is added, which is the
-- last step of a submission.
create function public.notify_listing_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if tg_table_name = 'dataset_contacts' then
    select title into v_title from public.datasets
      where id = new.dataset_id and status = 'pending' and not is_sample;
    if found then
      perform public.queue_email('listing_received', new.email, jsonb_build_object('type', 'dataset', 'title', v_title));
    end if;
  else
    select full_name into v_title from public.profiles
      where id = new.profile_id and status = 'pending' and not is_sample;
    if found then
      perform public.queue_email('listing_received', new.email, jsonb_build_object('type', 'profile', 'title', v_title));
    end if;
  end if;
  return new;
end;
$$;

create trigger dataset_contacts_notify after insert on public.dataset_contacts
  for each row execute function public.notify_listing_received();
create trigger profile_contacts_notify after insert on public.profile_contacts
  for each row execute function public.notify_listing_received();

-- Approved or rejected by an admin (first decision on a new listing only).
create function public.notify_listing_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_type text := case when tg_table_name = 'datasets' then 'dataset' else 'profile' end;
  v_title text;
begin
  if new.is_sample or old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  if v_type = 'dataset' then
    select email into v_email from public.dataset_contacts where dataset_id = new.id;
    v_title := (to_jsonb(new) ->> 'title');
  else
    select email into v_email from public.profile_contacts where profile_id = new.id;
    v_title := (to_jsonb(new) ->> 'full_name');
  end if;
  perform public.queue_email(
    case when new.status = 'approved' then 'listing_approved' else 'listing_rejected' end,
    v_email,
    jsonb_build_object('type', v_type, 'title', v_title, 'slug', new.slug, 'note', new.review_note));
  return new;
end;
$$;

create trigger datasets_notify_decision after update of status on public.datasets
  for each row when (old.status is distinct from new.status)
  execute function public.notify_listing_decision();
create trigger profiles_notify_decision after update of status on public.profiles
  for each row when (old.status is distinct from new.status)
  execute function public.notify_listing_decision();

-- ---------------------------------------------------------------------------
-- Owner updates: approved, declined, or the admin asks a question
-- ---------------------------------------------------------------------------
create function public.notify_revision_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := case when new.dataset_id is not null then 'dataset' else 'profile' end;
  v_title text;
  v_slug text;
begin
  if new.status not in ('approved', 'declined', 'question') then
    return new;
  end if;
  if v_type = 'dataset' then
    select title, slug into v_title, v_slug from public.datasets where id = new.dataset_id;
  else
    select full_name, slug into v_title, v_slug from public.profiles where id = new.profile_id;
  end if;
  perform public.queue_email('revision_' || new.status, new.submitted_email,
    jsonb_build_object('type', v_type, 'title', v_title, 'slug', v_slug, 'note', new.admin_note));
  return new;
end;
$$;

create trigger listing_revisions_notify after update of status on public.listing_revisions
  for each row when (old.status is distinct from new.status)
  execute function public.notify_revision_decision();

-- ---------------------------------------------------------------------------
-- Membership: received, approved, declined
-- ---------------------------------------------------------------------------
create function public.notify_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (old.status is distinct from new.status and new.status = 'pending') then
    if new.status = 'pending' then
      perform public.queue_email('membership_received', new.email, jsonb_build_object('name', new.full_name));
    end if;
  elsif old.status is distinct from new.status and new.status in ('approved', 'declined') and old.status = 'pending' then
    perform public.queue_email('membership_' || new.status, new.email,
      jsonb_build_object('name', new.full_name, 'note', new.review_note));
  end if;
  return new;
end;
$$;

create trigger members_notify after insert or update of status on public.members
  for each row execute function public.notify_membership();

-- ---------------------------------------------------------------------------
-- Shared resources: approved or not
-- ---------------------------------------------------------------------------
create function public.notify_resource_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.queue_email('resource_' || new.status, new.shared_by_email,
      jsonb_build_object('title', new.title, 'note', new.review_note));
  end if;
  return new;
end;
$$;

create trigger resources_notify after update of status on public.resources
  for each row when (old.status is distinct from new.status)
  execute function public.notify_resource_decision();

-- ---------------------------------------------------------------------------
-- Annual review
-- ---------------------------------------------------------------------------
alter table public.datasets add column reminder_sent_at timestamptz;
alter table public.profiles add column reminder_sent_at timestamptz;

-- The owner confirms their listing is still current.
create function public.confirm_listing_current(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_listing(p_kind, p_id) then
    raise exception 'You can only confirm your own listings' using errcode = '42501';
  end if;
  if p_kind = 'dataset' then
    update public.datasets set last_reviewed_at = now(), reminder_sent_at = null where id = p_id and status = 'approved';
  else
    update public.profiles set last_reviewed_at = now(), reminder_sent_at = null where id = p_id and status = 'approved';
  end if;
end;
$$;

grant execute on function public.confirm_listing_current(text, uuid) to authenticated;

-- Called by the job: queue a reminder for each published listing not reviewed
-- in 12 months that hasn't had one yet. Returns how many were queued.
create function public.queue_annual_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select 'dataset' as type, d.id, d.title, d.slug, c.email
    from public.datasets d join public.dataset_contacts c on c.dataset_id = d.id
    where d.status = 'approved' and not d.is_sample and d.reminder_sent_at is null
      and coalesce(d.last_reviewed_at, d.approved_at) < now() - interval '12 months'
    union all
    select 'profile', p.id, p.full_name, p.slug, c.email
    from public.profiles p join public.profile_contacts c on c.profile_id = p.id
    where p.status = 'approved' and not p.is_sample and p.reminder_sent_at is null
      and coalesce(p.last_reviewed_at, p.approved_at) < now() - interval '12 months'
  loop
    perform public.queue_email('annual_reminder', r.email, jsonb_build_object('type', r.type, 'title', r.title, 'slug', r.slug));
    if r.type = 'dataset' then
      update public.datasets set reminder_sent_at = now() where id = r.id;
    else
      update public.profiles set reminder_sent_at = now() where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- my_listings now also says when a listing is due for its yearly check.
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
  review_due        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'dataset', d.id, d.slug, d.status,
         to_jsonb(d) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample' - 'reminder_sent_at',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note,
         d.status = 'approved' and coalesce(d.last_reviewed_at, d.approved_at) < now() - interval '11 months'
  from public.datasets d
  join public.dataset_contacts c on c.dataset_id = d.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.dataset_id = d.id and r.status in ('pending', 'question')
  where d.status in ('pending', 'approved', 'unpublished')
  union all
  select 'profile', p.id, p.slug, p.status,
         to_jsonb(p) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample' - 'reminder_sent_at',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note,
         p.status = 'approved' and coalesce(p.last_reviewed_at, p.approved_at) < now() - interval '11 months'
  from public.profiles p
  join public.profile_contacts c on c.profile_id = p.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.profile_id = p.id and r.status in ('pending', 'question')
  where p.status in ('pending', 'approved', 'unpublished');
$$;

grant execute on function public.my_listings() to authenticated;

-- ---------------------------------------------------------------------------
-- Retention: contact messages are kept for 12 months (privacy notice).
-- ---------------------------------------------------------------------------
create function public.purge_old_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.contact_requests where created_at < now() - interval '12 months';
  get diagnostics v_count = row_count;
  delete from public.outbox where created_at < now() - interval '12 months';
  return v_count;
end;
$$;

-- Only the job (service role) may run these.
revoke execute on function public.queue_annual_reminders() from public, anon, authenticated;
revoke execute on function public.purge_old_records() from public, anon, authenticated;
revoke execute on function public.queue_email(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.queue_annual_reminders() to service_role;
grant execute on function public.purge_old_records() to service_role;
