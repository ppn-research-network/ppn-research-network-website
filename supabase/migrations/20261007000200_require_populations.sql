-- Phase 6b · Datasets must give at least one life stage and one health status
-- (new submissions and owner updates). Applied when the forms were published.

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

  if cardinality(public.jarray(p_listing, 'life_stages')) = 0 or cardinality(public.jarray(p_listing, 'health_statuses')) = 0 then
    raise exception 'Please tick at least one life stage and one health status' using errcode = '22023';
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

  if p_kind = 'dataset' and (cardinality(public.jarray(p_proposed, 'life_stages')) = 0
     or cardinality(public.jarray(p_proposed, 'health_statuses')) = 0) then
    raise exception 'Please tick at least one life stage and one health status' using errcode = '22023';
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
