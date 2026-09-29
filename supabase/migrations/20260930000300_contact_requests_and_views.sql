-- Phase 2 · Contact requests and the public views.

-- ---------------------------------------------------------------------------
-- Contact requests
-- Messages sent through the site. The Phase 5 email job relays each one to
-- the custodian or profile owner and marks it sent. Visitors can only add
-- rows, through send_contact_request().
-- ---------------------------------------------------------------------------
create table public.contact_requests (
  id                  uuid primary key default gen_random_uuid(),
  dataset_id          uuid references public.datasets (id) on delete cascade,
  profile_id          uuid references public.profiles (id) on delete cascade,
  sender_name         text not null check (length(sender_name) between 2 and 120),
  sender_email        text not null check (sender_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(sender_email) <= 254),
  sender_institution  text check (length(sender_institution) <= 200),
  message             text not null check (length(message) between 20 and 3000),
  status              text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked')),
  attempts            integer not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  check ((dataset_id is null) <> (profile_id is null))   -- exactly one target
);

create index contact_requests_status_idx on public.contact_requests (status);
create index contact_requests_sender_idx on public.contact_requests (lower(sender_email), created_at);

comment on table public.contact_requests is
  'PRIVATE. Messages sent through the site, waiting for or already relayed by the email job.';

-- ---------------------------------------------------------------------------
-- Public views: approved listings only, never any email or admin-only column.
-- These are the only way visitors can read listings. They run with the view
-- owner's rights (not the visitor's), which is deliberate: visitors have no
-- access to the underlying tables at all.
-- ---------------------------------------------------------------------------
create view public.public_datasets
with (security_barrier = true)
as
select
  d.id,
  d.slug,
  d.title,
  d.summary,
  d.keywords,
  d.study_design,
  d.years_collected,
  d.sample_size,
  d.age_range,
  d.population,
  d.lead_institution,
  d.state,
  d.data_types,
  d.data_types_other,
  d.biospecimens,
  d.biospecimens_details,
  d.access_level,
  d.access_requirements,
  d.access_notes,
  d.consent_secondary_use,
  d.repository_url,
  d.publication_url,
  d.trial_registration,
  d.contact_name,
  d.contact_role,
  d.approved_at      as listed_at,
  d.last_reviewed_at
from public.datasets d
where d.status = 'approved';

comment on view public.public_datasets is
  'Approved datasets for the public directory. No emails, no moderation details.';

create view public.public_profiles
with (security_barrier = true)
as
select
  p.id,
  p.slug,
  p.honorific,
  p.full_name,
  p.role,
  p.career_stage,
  p.institution,
  p.state,
  p.discipline,
  p.skills,
  p.bio,
  p.orcid,
  p.profile_url,
  p.looking_for,
  p.open_to,
  p.approved_at      as listed_at,
  p.last_reviewed_at
from public.profiles p
where p.status = 'approved';

comment on view public.public_profiles is
  'Approved skills profiles for the public directory. No emails, no moderation details.';
