-- Phase 6b · Population fields: life stage and health status.
--   Datasets: required by the forms; the database check is switched on in the
--   next migration, once the published site sends these fields.
--   Profiles: optional ("populations I work with").
-- Both are editable word lists. Existing listings start empty.

alter table public.vocab_terms drop constraint vocab_terms_list_check;
alter table public.vocab_terms add constraint vocab_terms_list_check check (list in (
  'study_design', 'data_type', 'access_requirement', 'discipline', 'career_stage',
  'looking_for', 'open_to', 'honorific', 'member_role', 'resource_category',
  'life_stage', 'health_status'));

insert into public.vocab_terms (list, code, label, sort_order) values
  ('life_stage', 'pregnancy_lactation', 'Pregnancy and lactation',          10),
  ('life_stage', 'infants',             'Infants (under 2 years)',          20),
  ('life_stage', 'children',            'Children (2–12 years)',            30),
  ('life_stage', 'adolescents',         'Adolescents (13–17 years)',        40),
  ('life_stage', 'adults',              'Adults (18–64 years)',             50),
  ('life_stage', 'older_adults',        'Older adults (65 years and over)', 60),
  ('health_status', 'generally_healthy',     'Generally healthy',                                  10),
  ('health_status', 'overweight_obesity',    'Overweight or obesity',                              20),
  ('health_status', 'prediabetes_t2d',       'Prediabetes or type 2 diabetes',                     30),
  ('health_status', 'type1_diabetes',        'Type 1 diabetes',                                    40),
  ('health_status', 'gestational_diabetes',  'Gestational diabetes',                               50),
  ('health_status', 'cardiovascular',        'Cardiovascular disease or risk factors',             60),
  ('health_status', 'gastrointestinal',      'Gastrointestinal conditions',                        70),
  ('health_status', 'kidney',                'Kidney disease',                                     80),
  ('health_status', 'liver',                 'Liver disease',                                      90),
  ('health_status', 'cancer',                'Cancer',                                            100),
  ('health_status', 'mental_health',         'Mental health conditions',                          110),
  ('health_status', 'food_allergy',          'Food allergy or intolerance',                       120),
  ('health_status', 'other',                 'Other',                                             130);

alter table public.datasets add column life_stages text[] not null default '{}';
alter table public.datasets add column health_statuses text[] not null default '{}';
alter table public.profiles add column life_stages text[] not null default '{}';
alter table public.profiles add column health_statuses text[] not null default '{}';

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
       or not public.vocab_codes_valid('access_requirement', new.access_requirements)
       or not public.vocab_codes_valid('life_stage', new.life_stages)
       or not public.vocab_codes_valid('health_status', new.health_statuses) then
      raise exception 'Unknown option in study design, data types, access requirements or population'
        using errcode = '22023';
    end if;
  else
    if not public.vocab_codes_valid('career_stage', array[new.career_stage])
       or not public.vocab_codes_valid('discipline', array[new.discipline])
       or not public.vocab_codes_valid('looking_for', new.looking_for)
       or not public.vocab_codes_valid('open_to', new.open_to)
       or (new.honorific is not null and not public.vocab_codes_valid('honorific', array[new.honorific]))
       or not public.vocab_codes_valid('life_stage', new.life_stages)
       or not public.vocab_codes_valid('health_status', new.health_statuses) then
      raise exception 'Unknown option in title, career stage, discipline, looking for, open to or population'
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
    contact_name, contact_role, life_stages, health_statuses,
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
    public.jarray(p_listing, 'life_stages'),
    public.jarray(p_listing, 'health_statuses'),
    true
  )
  returning id into v_id;

  insert into public.dataset_contacts (dataset_id, email) values (v_id, v_email);
end;
$$;

create or replace function public.submit_profile(p_profile jsonb, p_email text, p_website text default null)
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
    return;
  end if;

  v_email := public.check_email(p_email);

  if coalesce((p_profile ->> 'consent_to_list')::boolean, false) is not true then
    raise exception 'Please tick the box to confirm your profile can be listed' using errcode = '22023';
  end if;

  if (select count(*) from public.profile_contacts c
      where c.email = v_email and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many submissions from this email address. Please try again later' using errcode = 'P0001';
  end if;

  insert into public.profiles (
    honorific, full_name, role, career_stage, institution, state,
    discipline, skills, bio, orcid, profile_url, looking_for, open_to, life_stages, health_statuses,
    consent_to_list
  ) values (
    public.jtext(p_profile, 'honorific'),
    public.jtext(p_profile, 'full_name'),
    public.jtext(p_profile, 'role'),
    public.jtext(p_profile, 'career_stage'),
    public.jtext(p_profile, 'institution'),
    public.jtext(p_profile, 'state'),
    public.jtext(p_profile, 'discipline'),
    public.jarray(p_profile, 'skills'),
    public.jtext(p_profile, 'bio'),
    upper(public.jtext(p_profile, 'orcid')),
    public.jtext(p_profile, 'profile_url'),
    public.jarray(p_profile, 'looking_for'),
    public.jarray(p_profile, 'open_to'),
    public.jarray(p_profile, 'life_stages'),
    public.jarray(p_profile, 'health_statuses'),
    true
  )
  returning id into v_id;

  insert into public.profile_contacts (profile_id, email) values (v_id, v_email);
end;
$$;

create or replace function public.apply_listing(p_kind text, p_id uuid, p jsonb)
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
      contact_role = public.jtext(p, 'contact_role'),
      life_stages = public.jarray(p, 'life_stages'),
      health_statuses = public.jarray(p, 'health_statuses')
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
      open_to = public.jarray(p, 'open_to'),
      life_stages = public.jarray(p, 'life_stages'),
      health_statuses = public.jarray(p, 'health_statuses')
    where id = p_id;
  else
    raise exception 'Unknown listing type' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.submit_revision(
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

create or replace function public.approve_revision(p_revision_id uuid, p_note text default null)
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
      "contact_role":"contact role","life_stages":"life stage","health_statuses":"health status"}';
  else
    select to_jsonb(p) into v_after from public.profiles p where p.id = v_id;
    update public.profiles set last_reviewed_at = now() where id = v_id;
    v_labels := '{"honorific":"title","full_name":"name","role":"role","career_stage":"career stage",
      "institution":"institution","state":"state","discipline":"discipline","skills":"skills","bio":"bio",
      "orcid":"ORCID","profile_url":"profile link","looking_for":"looking for","open_to":"open to","life_stages":"populations","health_statuses":"populations"}';
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

drop view public.public_datasets;
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
  d.life_stages,
  d.health_statuses,
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

drop view public.public_profiles;
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
  p.life_stages,
  p.health_statuses,
  p.approved_at      as listed_at,
  p.last_reviewed_at
from public.profiles p
where p.status = 'approved';

comment on view public.public_profiles is
  'Approved skills profiles for the public directory. No emails, no moderation details.';

grant select on public.public_datasets, public.public_profiles to anon, authenticated;
