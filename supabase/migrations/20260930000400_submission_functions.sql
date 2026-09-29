-- Phase 2 · Submission functions.
-- The only way visitors can add anything. Each one forces status = 'pending'
-- (by never setting it), stores emails in the private tables, silently drops
-- submissions where the hidden spam-trap field was filled in, and limits how
-- often one email address can submit.

-- ---------------------------------------------------------------------------
-- Helpers for reading form data sent as JSON
-- ---------------------------------------------------------------------------

-- Trimmed text, or null when blank.
create function public.jtext(p jsonb, p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p ->> p_key), '');
$$;

-- A JSON array of strings as a text array, dropping blanks and duplicates.
-- Anything that is not an array becomes an empty array.
create function public.jarray(p jsonb, p_key text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p -> p_key)
    when 'array' then coalesce((
      select array_agg(distinct btrim(x))
      from jsonb_array_elements_text(p -> p_key) as x
      where btrim(x) <> ''
    ), '{}')
    else '{}'::text[]
  end;
$$;

create function public.check_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;
  return lower(btrim(p_email));
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_dataset(listing, email, website)
--   listing  JSON object of the form fields (see supabase/README.md)
--   email    custodian email, stored privately
--   website  the hidden spam trap; real people leave it empty
-- ---------------------------------------------------------------------------
create function public.submit_dataset(p_listing jsonb, p_email text, p_website text default null)
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

  if (select count(*) from public.dataset_contacts c
      where c.email = v_email and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many submissions from this email address. Please try again later' using errcode = 'P0001';
  end if;

  insert into public.datasets (
    title, summary, keywords,
    study_design, years_collected, sample_size, age_range, population,
    lead_institution, state,
    data_types, data_types_other, biospecimens, biospecimens_details,
    access_level, access_requirements, access_notes, consent_secondary_use,
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
    public.jtext(p_listing, 'access_level'),
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

-- ---------------------------------------------------------------------------
-- submit_profile(profile, email, website)
-- ---------------------------------------------------------------------------
create function public.submit_profile(p_profile jsonb, p_email text, p_website text default null)
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
    discipline, skills, bio, orcid, profile_url, looking_for, open_to,
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
    true
  )
  returning id into v_id;

  insert into public.profile_contacts (profile_id, email) values (v_id, v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- send_contact_request(target type, target id, name, email, institution,
--                      message, acknowledged, website)
-- Only approved listings can be contacted.
-- ---------------------------------------------------------------------------
create function public.send_contact_request(
  p_target_type  text,
  p_target_id    uuid,
  p_name         text,
  p_email        text,
  p_institution  text,
  p_message      text,
  p_acknowledged boolean,
  p_website      text default null
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

  -- At most 5 messages an hour from one sender, and 20 a day to one listing.
  if (select count(*) from public.contact_requests r
      where lower(r.sender_email) = v_email and r.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.contact_requests r
         where (r.dataset_id = p_target_id or r.profile_id = p_target_id)
           and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many messages. Please try again later' using errcode = 'P0001';
  end if;

  insert into public.contact_requests (
    dataset_id, profile_id, sender_name, sender_email, sender_institution, message
  ) values (
    case when p_target_type = 'dataset' then p_target_id end,
    case when p_target_type = 'profile' then p_target_id end,
    btrim(p_name),
    v_email,
    nullif(btrim(p_institution), ''),
    btrim(p_message)
  );
end;
$$;
