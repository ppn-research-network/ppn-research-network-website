-- Phase 2 · Listings: datasets and skills profiles, each with a private contacts table.
-- Emails live only in dataset_contacts and profile_contacts, which visitors can never read.

-- ---------------------------------------------------------------------------
-- Small helpers used by checks and triggers
-- ---------------------------------------------------------------------------

-- A list of short free-text tags (keywords, skills): limited count and length, no blanks.
create function public.tags_ok(p_tags text[], p_max_items integer, p_max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) <= p_max_items
     and not exists (
       select 1 from unnest(p_tags) t
       where t is null or length(btrim(t)) = 0 or length(t) > p_max_len
     );
$$;

-- URL-friendly version of a title, with a short unique suffix.
create function public.make_slug(p_text text, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from left(
           regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g'), 60))
         || '-' || left(replace(p_id::text, '-', ''), 6);
$$;

-- ---------------------------------------------------------------------------
-- Datasets
-- ---------------------------------------------------------------------------
create table public.datasets (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,

  -- About the dataset
  title                  text not null check (length(title) between 5 and 200),
  summary                text not null check (length(summary) between 20 and 1500),
  keywords               text[] not null default '{}' check (public.tags_ok(keywords, 20, 60)),

  -- Study details
  study_design           text not null,                         -- word list: study_design
  years_collected        text check (length(years_collected) <= 40),
  sample_size            integer check (sample_size > 0),
  age_range              text check (length(age_range) <= 80),
  population             text check (length(population) <= 300),
  lead_institution       text not null check (length(lead_institution) between 2 and 200),
  state                  text not null check (state in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),

  -- What data are available
  data_types             text[] not null check (cardinality(data_types) between 1 and 20),  -- word list: data_type
  data_types_other       text check (length(data_types_other) <= 200),
  biospecimens           boolean not null,
  biospecimens_details   text check (length(biospecimens_details) <= 300),

  -- Access (access_level order matters: open is the most open)
  access_level           text not null check (access_level in ('open', 'registered', 'controlled', 'collaboration')),
  access_requirements    text[] not null default '{}',          -- word list: access_requirement
  access_notes           text check (length(access_notes) <= 1000),
  consent_secondary_use  text not null check (consent_secondary_use in ('yes', 'partly', 'unsure')),
  repository_url         text check (repository_url ~ '^https?://' and length(repository_url) <= 500),
  publication_url        text check (publication_url ~ '^https?://' and length(publication_url) <= 500),
  trial_registration     text check (length(trial_registration) <= 200),

  -- Contact person (public part; the email is in dataset_contacts)
  contact_name           text not null check (length(contact_name) between 2 and 120),
  contact_role           text not null check (length(contact_role) between 2 and 120),

  -- Consent and moderation (admin-only columns are never in the public view)
  consent_to_list        boolean not null check (consent_to_list),
  status                 text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected', 'unpublished', 'withdrawn')),
  review_note            text check (length(review_note) <= 2000),
  submitted_at           timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  approved_at            timestamptz,     -- first approval; shown as "Listed"
  approved_by            uuid references auth.users (id) on delete set null,
  last_reviewed_at       timestamptz,
  last_reviewed_by       uuid references auth.users (id) on delete set null
);

create index datasets_status_idx on public.datasets (status);

create table public.dataset_contacts (
  dataset_id  uuid primary key references public.datasets (id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  created_at  timestamptz not null default now()
);

comment on table public.dataset_contacts is
  'PRIVATE. Custodian email for each dataset. Readable by admins and the email job only.';

-- ---------------------------------------------------------------------------
-- Skills profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,

  honorific         text check (honorific in ('Dr', 'A/Prof', 'Prof')),
  full_name         text not null check (length(full_name) between 2 and 120),
  role              text not null check (length(role) between 2 and 120),    -- e.g. Biostatistician
  career_stage      text not null,                                           -- word list: career_stage
  institution       text not null check (length(institution) between 2 and 200),
  state             text not null check (state in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  discipline        text not null,                                           -- word list: discipline
  skills            text[] not null default '{}' check (public.tags_ok(skills, 15, 40)),
  bio               text not null check (length(bio) between 20 and 800),
  orcid             text check (orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  profile_url       text check (profile_url ~ '^https?://' and length(profile_url) <= 500),
  looking_for       text[] not null default '{}',                            -- word list: looking_for
  open_to           text[] not null default '{}',                            -- word list: open_to

  consent_to_list   boolean not null check (consent_to_list),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'unpublished', 'withdrawn')),
  review_note       text check (length(review_note) <= 2000),
  submitted_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references auth.users (id) on delete set null,
  last_reviewed_at  timestamptz,
  last_reviewed_by  uuid references auth.users (id) on delete set null
);

create index profiles_status_idx on public.profiles (status);

create table public.profile_contacts (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  created_at  timestamptz not null default now()
);

comment on table public.profile_contacts is
  'PRIVATE. Email for each skills profile. Readable by admins and the email job only.';

-- ---------------------------------------------------------------------------
-- Triggers: slug, word-list checks, and moderation timestamps
-- ---------------------------------------------------------------------------

create function public.listing_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'datasets' then
      new.slug := public.make_slug(new.title, new.id);
    else
      new.slug := public.make_slug(new.full_name, new.id);
    end if;
  else
    new.slug := old.slug;               -- links never change once created
    new.submitted_at := old.submitted_at;
    new.updated_at := now();
  end if;

  -- Every stored code must exist in the word lists.
  if tg_table_name = 'datasets' then
    if not public.vocab_codes_valid('study_design', array[new.study_design])
       or not public.vocab_codes_valid('data_type', new.data_types)
       or not public.vocab_codes_valid('access_requirement', new.access_requirements) then
      raise exception 'Unknown option in study design, data types or access requirements'
        using errcode = '22023';
    end if;
  else
    if not public.vocab_codes_valid('career_stage', array[new.career_stage])
       or not public.vocab_codes_valid('discipline', array[new.discipline])
       or not public.vocab_codes_valid('looking_for', new.looking_for)
       or not public.vocab_codes_valid('open_to', new.open_to) then
      raise exception 'Unknown option in career stage, discipline, looking for or open to'
        using errcode = '22023';
    end if;
  end if;

  -- Record who moderated and when.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.last_reviewed_at := now();
    new.last_reviewed_by := auth.uid();
    if new.status = 'approved' then
      new.approved_at := coalesce(old.approved_at, now());
      new.approved_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;

  return new;
end;
$$;

create trigger datasets_before_write
  before insert or update on public.datasets
  for each row execute function public.listing_before_write();

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.listing_before_write();
