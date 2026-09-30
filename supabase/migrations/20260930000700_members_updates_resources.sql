-- Phase 4b · Members, owner updates with admin review, listing history, and
-- members-only resources.
--
-- Who can do what (in addition to Phase 2):
--   Listing owner   signed in with the email held privately on a listing:
--                   propose updates (my_listings, submit_revision) and withdraw.
--   Member          signed in with an email whose membership is approved:
--                   read approved resources and their files; share resources.
--   Admin           approve memberships, updates and resources.
-- Sign-in links prove the person controls the email address.

-- ---------------------------------------------------------------------------
-- Word lists: membership roles and resource categories
-- ---------------------------------------------------------------------------
alter table public.vocab_terms drop constraint vocab_terms_list_check;
alter table public.vocab_terms add constraint vocab_terms_list_check check (list in (
  'study_design', 'data_type', 'access_requirement', 'discipline', 'career_stage',
  'looking_for', 'open_to', 'honorific', 'member_role', 'resource_category'));

insert into public.vocab_terms (list, code, label, sort_order) values
  ('member_role', 'researcher',  'Researcher',                10),
  ('member_role', 'student',     'PhD or research student',   20),
  ('member_role', 'clinician',   'Clinician or practitioner', 30),
  ('member_role', 'industry',    'Industry',                  40),
  ('member_role', 'other',       'Other',                     50),
  ('resource_category', 'recording',  'Workshop and webinar recordings', 10),
  ('resource_category', 'consent',    'Consent and ethics templates',    20),
  ('resource_category', 'agreements', 'Data-sharing agreements',         30),
  ('resource_category', 'protocols',  'Protocols and SOPs',              40);

-- ---------------------------------------------------------------------------
-- Who is signed in
-- ---------------------------------------------------------------------------

-- The signed-in person's email, lower case (null when signed out).
create function public.auth_email()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(lower(auth.jwt() ->> 'email'), '');
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name     text not null check (length(full_name) between 2 and 120),
  institution   text not null check (length(institution) between 2 and 200),
  country       text not null default 'Australia' check (length(country) between 2 and 80),
  role          text not null,     -- word list: member_role
  reason        text check (length(reason) <= 1000),
  agreed_code   boolean not null check (agreed_code),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'revoked')),
  review_note   text check (length(review_note) <= 2000),
  requested_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users (id) on delete set null
);

comment on table public.members is
  'PRIVATE. Membership requests and members. A person is a member when their signed-in email has an approved row.';

create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = public.auth_email() and m.status = 'approved'
  );
$$;

create function public.member_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.vocab_codes_valid('member_role', array[new.role]) then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger members_before_write
  before insert or update on public.members
  for each row execute function public.member_before_write();

-- request_membership(details, website)
-- details: full_name, email, institution, country, role, reason, agreed_code
create function public.request_membership(p_details jsonb, p_website text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_existing text;
begin
  if nullif(btrim(p_website), '') is not null then
    return;
  end if;

  v_email := public.check_email(p_details ->> 'email');

  if coalesce((p_details ->> 'agreed_code')::boolean, false) is not true then
    raise exception 'Please tick the box to agree to the member code of conduct' using errcode = '22023';
  end if;

  select status into v_existing from public.members where email = v_email;
  if v_existing = 'approved' then
    return;   -- already a member: nothing to do
  elsif v_existing = 'pending' then
    raise exception 'A membership request for this email is already waiting for review' using errcode = 'P0001';
  elsif v_existing is not null then
    -- previously declined or revoked: resubmit for review
    update public.members set
      full_name = public.jtext(p_details, 'full_name'),
      institution = public.jtext(p_details, 'institution'),
      country = coalesce(public.jtext(p_details, 'country'), 'Australia'),
      role = public.jtext(p_details, 'role'),
      reason = public.jtext(p_details, 'reason'),
      agreed_code = true,
      status = 'pending',
      requested_at = now()
    where email = v_email;
    return;
  end if;

  insert into public.members (email, full_name, institution, country, role, reason, agreed_code)
  values (
    v_email,
    public.jtext(p_details, 'full_name'),
    public.jtext(p_details, 'institution'),
    coalesce(public.jtext(p_details, 'country'), 'Australia'),
    public.jtext(p_details, 'role'),
    public.jtext(p_details, 'reason'),
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Listing history (public for published listings)
-- ---------------------------------------------------------------------------
create table public.listing_history (
  id           uuid primary key default gen_random_uuid(),
  dataset_id   uuid references public.datasets (id) on delete cascade,
  profile_id   uuid references public.profiles (id) on delete cascade,
  happened_at  timestamptz not null default now(),
  summary      text not null check (length(summary) between 3 and 300),
  check ((dataset_id is null) <> (profile_id is null))
);

create index listing_history_dataset_idx on public.listing_history (dataset_id);
create index listing_history_profile_idx on public.listing_history (profile_id);

create view public.public_listing_history
with (security_barrier = true)
as
select h.id, h.dataset_id, h.profile_id, h.happened_at, h.summary
from public.listing_history h
left join public.datasets d on d.id = h.dataset_id
left join public.profiles p on p.id = h.profile_id
where coalesce(d.status, p.status) = 'approved';

-- ---------------------------------------------------------------------------
-- Proposed updates from listing owners
-- ---------------------------------------------------------------------------
create table public.listing_revisions (
  id                uuid primary key default gen_random_uuid(),
  dataset_id        uuid references public.datasets (id) on delete cascade,
  profile_id        uuid references public.profiles (id) on delete cascade,
  proposed          jsonb not null,              -- the full listing as the owner wants it
  previous          jsonb,                       -- snapshot of the live listing when approved
  ethics_reference  text check (length(ethics_reference) <= 500),   -- admins only, never public
  owner_note        text check (length(owner_note) <= 2000),
  status            text not null default 'pending'
                    check (status in ('pending', 'question', 'approved', 'declined', 'cancelled')),
  admin_note        text check (length(admin_note) <= 2000),
  submitted_by      uuid references auth.users (id) on delete set null,
  submitted_email   text not null,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users (id) on delete set null,
  check ((dataset_id is null) <> (profile_id is null))
);

-- At most one open update per listing.
create unique index listing_revisions_one_open_dataset on public.listing_revisions (dataset_id)
  where status in ('pending', 'question') and dataset_id is not null;
create unique index listing_revisions_one_open_profile on public.listing_revisions (profile_id)
  where status in ('pending', 'question') and profile_id is not null;

comment on table public.listing_revisions is
  'PRIVATE. Owner-proposed changes. The live listing only changes when an admin approves (approve_revision).';

-- Does the signed-in person own this listing (by the private email on it)?
create function public.owns_listing(p_kind text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_email() is not null and case p_kind
    when 'dataset' then exists (select 1 from public.dataset_contacts c where c.dataset_id = p_id and c.email = public.auth_email())
    when 'profile' then exists (select 1 from public.profile_contacts c where c.profile_id = p_id and c.email = public.auth_email())
    else false
  end;
$$;

-- Access levels ranked from most (1) to least (4) open; a listing's openness
-- is its most open level.
create function public.most_open_rank(p_levels text[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select min(array_position(array['open', 'registered', 'controlled', 'collaboration'], l))
  from unnest(p_levels) as l;
$$;

create function public.access_levels_text(p_levels text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
    case l when 'open' then 'Open' when 'registered' then 'Registered'
           when 'controlled' then 'Controlled' else 'Collaboration only' end,
    ' and ' order by array_position(array['open', 'registered', 'controlled', 'collaboration'], l))
  from unnest(p_levels) as l;
$$;

-- Writes a full listing (JSON, same shape as the submission forms) onto the
-- live row. Status and moderation columns are never touched here.
create function public.apply_listing(p_kind text, p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'dataset' then
    update public.datasets set
      title = public.jtext(p, 'title'),
      summary = public.jtext(p, 'summary'),
      keywords = public.jarray(p, 'keywords'),
      study_design = public.jtext(p, 'study_design'),
      years_collected = public.jtext(p, 'years_collected'),
      sample_size = public.jtext(p, 'sample_size')::integer,
      age_range = public.jtext(p, 'age_range'),
      population = public.jtext(p, 'population'),
      lead_institution = public.jtext(p, 'lead_institution'),
      state = public.jtext(p, 'state'),
      data_types = public.jarray(p, 'data_types'),
      data_types_other = public.jtext(p, 'data_types_other'),
      biospecimens = public.jtext(p, 'biospecimens')::boolean,
      biospecimens_details = public.jtext(p, 'biospecimens_details'),
      access_levels = public.jarray(p, 'access_levels'),
      access_requirements = public.jarray(p, 'access_requirements'),
      access_notes = public.jtext(p, 'access_notes'),
      consent_secondary_use = public.jtext(p, 'consent_secondary_use'),
      repository_url = public.jtext(p, 'repository_url'),
      publication_url = public.jtext(p, 'publication_url'),
      trial_registration = public.jtext(p, 'trial_registration'),
      contact_name = public.jtext(p, 'contact_name'),
      contact_role = public.jtext(p, 'contact_role')
    where id = p_id;
  elsif p_kind = 'profile' then
    update public.profiles set
      honorific = public.jtext(p, 'honorific'),
      full_name = public.jtext(p, 'full_name'),
      role = public.jtext(p, 'role'),
      career_stage = public.jtext(p, 'career_stage'),
      institution = public.jtext(p, 'institution'),
      state = public.jtext(p, 'state'),
      discipline = public.jtext(p, 'discipline'),
      skills = public.jarray(p, 'skills'),
      bio = public.jtext(p, 'bio'),
      orcid = upper(public.jtext(p, 'orcid')),
      profile_url = public.jtext(p, 'profile_url'),
      looking_for = public.jarray(p, 'looking_for'),
      open_to = public.jarray(p, 'open_to')
    where id = p_id;
  else
    raise exception 'Unknown listing type' using errcode = '22023';
  end if;
end;
$$;

-- The signed-in person's listings, for the My listings page.
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
  admin_note        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'dataset', d.id, d.slug, d.status,
         to_jsonb(d) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note
  from public.datasets d
  join public.dataset_contacts c on c.dataset_id = d.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.dataset_id = d.id and r.status in ('pending', 'question')
  where d.status in ('pending', 'approved', 'unpublished')
  union all
  select 'profile', p.id, p.slug, p.status,
         to_jsonb(p) - 'review_note' - 'approved_by' - 'last_reviewed_by' - 'is_sample',
         r.status, r.submitted_at, r.proposed, r.owner_note, r.admin_note
  from public.profiles p
  join public.profile_contacts c on c.profile_id = p.id and c.email = public.auth_email()
  left join public.listing_revisions r on r.profile_id = p.id and r.status in ('pending', 'question')
  where p.status in ('pending', 'approved', 'unpublished');
$$;

-- submit_revision(kind, id, proposed listing, ethics reference, note)
-- Pending listings (not yet public) are corrected directly. Published ones get
-- a proposed update for an admin to approve; the live listing does not change.
create function public.submit_revision(
  p_kind      text,
  p_id        uuid,
  p_proposed  jsonb,
  p_ethics    text default null,
  p_note      text default null
)
returns text   -- 'updated' (pending listing changed) or 'submitted' (sent for review)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_old_levels text[];
begin
  if not public.owns_listing(p_kind, p_id) then
    raise exception 'You can only update your own listings' using errcode = '42501';
  end if;

  if p_kind = 'dataset' then
    select status, access_levels into v_status, v_old_levels from public.datasets where id = p_id;
  else
    select status into v_status from public.profiles where id = p_id;
  end if;

  if v_status not in ('pending', 'approved', 'unpublished') then
    raise exception 'This listing can no longer be updated' using errcode = 'P0001';
  end if;

  if p_kind = 'dataset' and cardinality(public.jarray(p_proposed, 'access_levels')) > 1
     and public.jtext(p_proposed, 'access_notes') is null then
    raise exception 'Please explain which parts of the data are available at which access level' using errcode = '22023';
  end if;

  -- Opening up access needs an ethics amendment reference.
  if p_kind = 'dataset'
     and public.most_open_rank(public.jarray(p_proposed, 'access_levels')) < public.most_open_rank(v_old_levels)
     and nullif(btrim(p_ethics), '') is null then
    raise exception 'Access is becoming more open, so please give the ethics approval reference for this change' using errcode = '22023';
  end if;

  -- Check the proposed listing is valid by applying it and rolling back.
  begin
    perform public.apply_listing(p_kind, p_id, p_proposed);
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    null;
  end;

  if v_status = 'pending' then
    perform public.apply_listing(p_kind, p_id, p_proposed);
    return 'updated';
  end if;

  update public.listing_revisions set
    proposed = p_proposed,
    ethics_reference = nullif(btrim(p_ethics), ''),
    owner_note = nullif(btrim(p_note), ''),
    status = 'pending',
    submitted_by = auth.uid(),
    submitted_email = public.auth_email(),
    submitted_at = now(),
    admin_note = null
  where status in ('pending', 'question')
    and ((p_kind = 'dataset' and dataset_id = p_id) or (p_kind = 'profile' and profile_id = p_id));

  if not found then
    insert into public.listing_revisions (dataset_id, profile_id, proposed, ethics_reference, owner_note, submitted_by, submitted_email)
    values (
      case when p_kind = 'dataset' then p_id end,
      case when p_kind = 'profile' then p_id end,
      p_proposed, nullif(btrim(p_ethics), ''), nullif(btrim(p_note), ''), auth.uid(), public.auth_email()
    );
  end if;
  return 'submitted';
end;
$$;

-- The owner withdraws a proposed update they no longer want.
create function public.cancel_revision(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_listing(p_kind, p_id) then
    raise exception 'You can only change your own listings' using errcode = '42501';
  end if;
  update public.listing_revisions set status = 'cancelled', reviewed_at = now()
  where status in ('pending', 'question')
    and ((p_kind = 'dataset' and dataset_id = p_id) or (p_kind = 'profile' and profile_id = p_id));
end;
$$;

-- The owner takes their listing down immediately. No review needed.
create function public.withdraw_listing(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_listing(p_kind, p_id) then
    raise exception 'You can only withdraw your own listings' using errcode = '42501';
  end if;
  if p_kind = 'dataset' then
    update public.datasets set status = 'withdrawn' where id = p_id;
    update public.listing_revisions set status = 'cancelled', reviewed_at = now()
      where dataset_id = p_id and status in ('pending', 'question');
  else
    update public.profiles set status = 'withdrawn' where id = p_id;
    update public.listing_revisions set status = 'cancelled', reviewed_at = now()
      where profile_id = p_id and status in ('pending', 'question');
  end if;
end;
$$;

-- An admin approves a proposed update: copy it onto the live listing, keep the
-- previous version, and add a public history line.
create function public.approve_revision(p_revision_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.listing_revisions;
  v_kind text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_changed text[] := '{}';
  v_labels jsonb;
  v_key text;
  v_summary text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve updates' using errcode = '42501';
  end if;

  select * into r from public.listing_revisions where id = p_revision_id and status in ('pending', 'question') for update;
  if not found then
    raise exception 'This update is no longer waiting for review' using errcode = 'P0002';
  end if;

  v_kind := case when r.dataset_id is not null then 'dataset' else 'profile' end;
  v_id := coalesce(r.dataset_id, r.profile_id);

  if v_kind = 'dataset' then
    select to_jsonb(d) into v_before from public.datasets d where d.id = v_id;
  else
    select to_jsonb(p) into v_before from public.profiles p where p.id = v_id;
  end if;

  perform public.apply_listing(v_kind, v_id, r.proposed);

  if v_kind = 'dataset' then
    select to_jsonb(d) into v_after from public.datasets d where d.id = v_id;
    update public.datasets set last_reviewed_at = now() where id = v_id;
    v_labels := '{"title":"title","summary":"description","keywords":"keywords","study_design":"study design",
      "years_collected":"years collected","sample_size":"sample size","age_range":"age range","population":"population",
      "lead_institution":"institution","state":"state","data_types":"data types","data_types_other":"data types",
      "biospecimens":"biospecimens","biospecimens_details":"biospecimens","access_requirements":"access requirements",
      "access_notes":"access details","consent_secondary_use":"consent for secondary use","repository_url":"repository",
      "publication_url":"key publication","trial_registration":"trial registration","contact_name":"contact person",
      "contact_role":"contact role"}';
  else
    select to_jsonb(p) into v_after from public.profiles p where p.id = v_id;
    update public.profiles set last_reviewed_at = now() where id = v_id;
    v_labels := '{"honorific":"title","full_name":"name","role":"role","career_stage":"career stage",
      "institution":"institution","state":"state","discipline":"discipline","skills":"skills","bio":"bio",
      "orcid":"ORCID","profile_url":"profile link","looking_for":"looking for","open_to":"open to"}';
  end if;

  -- Public history: access changes get their own line, everything else is summarised.
  if v_kind = 'dataset' and (v_before -> 'access_levels') is distinct from (v_after -> 'access_levels') then
    insert into public.listing_history (dataset_id, summary) values (v_id,
      'Access changed from ' || public.access_levels_text(array(select jsonb_array_elements_text(v_before -> 'access_levels')))
      || ' to ' || public.access_levels_text(array(select jsonb_array_elements_text(v_after -> 'access_levels'))));
  end if;

  for v_key in select jsonb_object_keys(v_labels) loop
    if (v_before -> v_key) is distinct from (v_after -> v_key)
       and not (v_labels ->> v_key) = any (v_changed) then
      v_changed := v_changed || (v_labels ->> v_key);
    end if;
  end loop;

  if cardinality(v_changed) > 0 then
    v_summary := initcap(left(array_to_string(v_changed, ', '), 1)) || substr(array_to_string(v_changed, ', '), 2)
      || case when v_kind = 'dataset' then ' updated by the custodian' else ' updated' end;
    insert into public.listing_history (dataset_id, profile_id, summary) values (
      case when v_kind = 'dataset' then v_id end,
      case when v_kind = 'profile' then v_id end,
      left(v_summary, 300));
  end if;

  update public.listing_revisions set
    status = 'approved', previous = v_before, admin_note = nullif(btrim(p_note), ''),
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = r.id;
end;
$$;

create function public.revision_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('declined', 'question') then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger listing_revisions_before_update
  before update on public.listing_revisions
  for each row execute function public.revision_before_update();

-- ---------------------------------------------------------------------------
-- Resources (members only)
-- ---------------------------------------------------------------------------
create table public.resources (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 5 and 200),
  category         text not null,                 -- word list: resource_category
  kind             text not null check (kind in ('link', 'file')),
  url              text check (url ~ '^https?://' and length(url) <= 500),
  file_path        text check (length(file_path) <= 300),
  file_type        text check (file_type in ('pdf', 'docx', 'xlsx')),
  file_size        integer check (file_size between 1 and 10485760),
  description      text check (length(description) <= 600),
  presenter        text check (length(presenter) <= 120),
  event_date       date,
  duration         text check (length(duration) <= 20),
  shared_by        uuid references auth.users (id) on delete set null,
  shared_by_name   text not null check (length(shared_by_name) between 2 and 120),
  shared_by_email  text not null,
  confirms_rights  boolean not null check (confirms_rights),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  review_note      text check (length(review_note) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_at      timestamptz,
  approved_by      uuid references auth.users (id) on delete set null,
  check ((kind = 'link' and url is not null and file_path is null)
      or (kind = 'file' and file_path is not null and file_type is not null))
);

create index resources_status_idx on public.resources (status);

create function public.resource_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.vocab_codes_valid('resource_category', array[new.category]) then
    raise exception 'Unknown resource category' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.shared_by := old.shared_by;
    new.shared_by_email := old.shared_by_email;
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := now();
      new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger resources_before_write
  before insert or update on public.resources
  for each row execute function public.resource_before_write();

-- share_resource(details): members only; saved as pending for an admin.
-- A file must already be uploaded to uploads/<your user id>/…
create function public.share_resource(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := public.jtext(p, 'file_path');
begin
  if not public.is_member() then
    raise exception 'Only members can share resources' using errcode = '42501';
  end if;
  if coalesce((p ->> 'confirms_rights')::boolean, false) is not true then
    raise exception 'Please confirm you may share this resource' using errcode = '22023';
  end if;
  if v_path is not null and v_path not like 'uploads/' || auth.uid()::text || '/%' then
    raise exception 'That file was not uploaded by you' using errcode = '42501';
  end if;
  if (select count(*) from public.resources where shared_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have shared a lot today. Please try again tomorrow' using errcode = 'P0001';
  end if;

  insert into public.resources (
    title, category, kind, url, file_path, file_type, file_size, description,
    presenter, event_date, duration, shared_by, shared_by_name, shared_by_email, confirms_rights
  ) values (
    public.jtext(p, 'title'),
    public.jtext(p, 'category'),
    case when v_path is null then 'link' else 'file' end,
    case when v_path is null then public.jtext(p, 'url') end,
    v_path,
    public.jtext(p, 'file_type'),
    public.jtext(p, 'file_size')::integer,
    public.jtext(p, 'description'),
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

-- Private file storage for resources: PDF, Word and Excel, 10 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

create policy "Members upload resource files to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resources'
    and public.is_member()
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Members read approved files; admins and uploaders read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin()
      or (storage.foldername(name))[2] = auth.uid()::text
      or (public.is_member() and exists (
            select 1 from public.resources r where r.file_path = name and r.status = 'approved'))
    )
  );

create policy "Admins delete resource files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Security: privileges and Row Level Security for the new tables
-- ---------------------------------------------------------------------------
alter table public.members            enable row level security;
alter table public.listing_history    enable row level security;
alter table public.listing_revisions  enable row level security;
alter table public.resources          enable row level security;

grant select on public.public_listing_history to anon, authenticated;

grant select, update         on public.members            to authenticated;
grant select                 on public.listing_history    to authenticated;
grant select, update         on public.listing_revisions  to authenticated;
grant select, update, delete on public.resources          to authenticated;

create policy "People see their own membership; admins see all"
  on public.members for select to authenticated
  using (email = public.auth_email() or public.is_admin());
create policy "Admins update memberships"
  on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins read listing history"
  on public.listing_history for select to authenticated using (public.is_admin());

create policy "Owners see their own updates; admins see all"
  on public.listing_revisions for select to authenticated
  using (public.is_admin()
      or (dataset_id is not null and public.owns_listing('dataset', dataset_id))
      or (profile_id is not null and public.owns_listing('profile', profile_id)));
create policy "Admins update proposed updates"
  on public.listing_revisions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Members read approved resources; sharers and admins read more"
  on public.resources for select to authenticated
  using ((status = 'approved' and public.is_member()) or shared_by = auth.uid() or public.is_admin());
create policy "Admins update resources"
  on public.resources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete resources"
  on public.resources for delete to authenticated using (public.is_admin());

-- Functions the website may call.
grant execute on function public.request_membership(jsonb, text)                 to anon, authenticated;
grant execute on function public.is_member()                                       to anon, authenticated;
grant execute on function public.my_listings()                                     to authenticated;
grant execute on function public.submit_revision(text, uuid, jsonb, text, text)    to authenticated;
grant execute on function public.cancel_revision(text, uuid)                       to authenticated;
grant execute on function public.withdraw_listing(text, uuid)                      to authenticated;
grant execute on function public.approve_revision(uuid, text)                      to authenticated;
grant execute on function public.share_resource(jsonb)                             to authenticated;

-- Helpers used inside security rules, checks and triggers.
grant execute on function public.auth_email()                        to anon, authenticated;
grant execute on function public.owns_listing(text, uuid)            to authenticated;
grant execute on function public.most_open_rank(text[])              to authenticated;
grant execute on function public.access_levels_text(text[])          to authenticated;
grant execute on function public.member_before_write()               to authenticated;
grant execute on function public.revision_before_update()            to authenticated;
grant execute on function public.resource_before_write()             to authenticated;
