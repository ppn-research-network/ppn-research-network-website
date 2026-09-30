-- Phase 4 · Field changes agreed with the owner:
--   1. A dataset can offer several access levels (e.g. some parts open, others on request).
--      More than one level needs an explanation in access_notes.
--   2. Titles (Dr, Ms, Mx …) become an editable word list.
--   3. Sample listings are flagged so they can be removed in one step before launch.
--   4. Admins can mark a listing as reviewed without changing its status.

-- ---------------------------------------------------------------------------
-- 1. Titles word list
-- ---------------------------------------------------------------------------
alter table public.vocab_terms drop constraint vocab_terms_list_check;
alter table public.vocab_terms add constraint vocab_terms_list_check check (list in (
  'study_design', 'data_type', 'access_requirement',
  'discipline', 'career_stage', 'looking_for', 'open_to', 'honorific'));

insert into public.vocab_terms (list, code, label, sort_order) values
  ('honorific', 'dr',     'Dr',     10),
  ('honorific', 'a_prof', 'A/Prof', 20),
  ('honorific', 'prof',   'Prof',   30),
  ('honorific', 'mr',     'Mr',     40),
  ('honorific', 'ms',     'Ms',     50),
  ('honorific', 'mrs',    'Mrs',    60),
  ('honorific', 'miss',   'Miss',   70),
  ('honorific', 'mx',     'Mx',     80);

-- Profiles now store the code (dr, a_prof …); convert any existing values.
alter table public.profiles drop constraint profiles_honorific_check;
update public.profiles set honorific = case honorific
  when 'Dr' then 'dr' when 'A/Prof' then 'a_prof' when 'Prof' then 'prof' else honorific end;

-- ---------------------------------------------------------------------------
-- 2. Several access levels per dataset
-- ---------------------------------------------------------------------------
drop view public.public_datasets;   -- recreated below with the new column

alter table public.datasets add column access_levels text[];
update public.datasets set access_levels = array[access_level];
alter table public.datasets alter column access_levels set not null;
alter table public.datasets add constraint datasets_access_levels_check check (
  cardinality(access_levels) between 1 and 4
  and access_levels <@ array['open', 'registered', 'controlled', 'collaboration']);
alter table public.datasets add constraint datasets_mixed_access_explained check (
  cardinality(access_levels) = 1 or access_notes is not null);
alter table public.datasets drop column access_level;

comment on column public.datasets.access_levels is
  'One or more of open, registered, controlled, collaboration (most to least open). More than one needs access_notes.';

-- ---------------------------------------------------------------------------
-- 3. Sample listings
-- ---------------------------------------------------------------------------
alter table public.datasets add column is_sample boolean not null default false;
alter table public.profiles add column is_sample boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. Trigger: check titles against the word list, and record who marked a
--    listing as reviewed.
-- ---------------------------------------------------------------------------
create or replace function public.listing_before_write()
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
       or not public.vocab_codes_valid('open_to', new.open_to)
       or (new.honorific is not null and not public.vocab_codes_valid('honorific', array[new.honorific])) then
      raise exception 'Unknown option in title, career stage, discipline, looking for or open to'
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
    if new.last_reviewed_at is distinct from old.last_reviewed_at then
      new.last_reviewed_at := now();    -- "Mark as reviewed"
      new.last_reviewed_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public view, recreated with access_levels (still no emails, no admin columns)
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
  d.access_levels,
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

grant select on public.public_datasets to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_dataset: now reads access_levels (an array)
-- ---------------------------------------------------------------------------
create or replace function public.submit_dataset(p_listing jsonb, p_email text, p_website text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if nullif(btrim(p_website), '') is not null then
    return;   -- spam trap filled in: pretend it worked, store nothing
  end if;

  v_email := public.check_email(p_email);

  if coalesce((p_listing ->> 'consent_to_list')::boolean, false) is not true then
    raise exception 'Please tick the box to confirm the dataset can be listed' using errcode = '22023';
  end if;

  if cardinality(public.jarray(p_listing, 'access_levels')) > 1
     and public.jtext(p_listing, 'access_notes') is null then
    raise exception 'Please explain which parts of the data are available at which access level' using errcode = '22023';
  end if;

  if (select count(*) from public.dataset_contacts c
      where c.email = v_email and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many submissions from this email address. Please try again later' using errcode = 'P0001';
  end if;

  insert into public.datasets (
    title, summary, keywords,
    study_design, years_collected, sample_size, age_range, population,
    lead_institution, state,
    data_types, data_types_other, biospecimens, biospecimens_details,
    access_levels, access_requirements, access_notes, consent_secondary_use,
    repository_url, publication_url, trial_registration,
    contact_name, contact_role,
    consent_to_list
  ) values (
    public.jtext(p_listing, 'title'),
    public.jtext(p_listing, 'summary'),
    public.jarray(p_listing, 'keywords'),
    public.jtext(p_listing, 'study_design'),
    public.jtext(p_listing, 'years_collected'),
    public.jtext(p_listing, 'sample_size')::integer,
    public.jtext(p_listing, 'age_range'),
    public.jtext(p_listing, 'population'),
    public.jtext(p_listing, 'lead_institution'),
    public.jtext(p_listing, 'state'),
    public.jarray(p_listing, 'data_types'),
    public.jtext(p_listing, 'data_types_other'),
    public.jtext(p_listing, 'biospecimens')::boolean,
    public.jtext(p_listing, 'biospecimens_details'),
    public.jarray(p_listing, 'access_levels'),
    public.jarray(p_listing, 'access_requirements'),
    public.jtext(p_listing, 'access_notes'),
    public.jtext(p_listing, 'consent_secondary_use'),
    public.jtext(p_listing, 'repository_url'),
    public.jtext(p_listing, 'publication_url'),
    public.jtext(p_listing, 'trial_registration'),
    public.jtext(p_listing, 'contact_name'),
    public.jtext(p_listing, 'contact_role'),
    true
  )
  returning id into v_id;

  insert into public.dataset_contacts (dataset_id, email) values (v_id, v_email);
end;
$$;
