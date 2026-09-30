-- Phase 6 · Licence field for shared resources, and the retention periods
-- promised in the privacy notice:
--   rejected / withdrawn listings           deleted 12 months after the decision
--   declined requests, ended memberships    deleted 12 months after the decision
--   declined / cancelled owner updates      deleted 12 months after the decision
--   rejected / removed resources            deleted 12 months after the decision
--                                           (the job removes their files first)
--   contact messages and email queue        deleted after 12 months (unchanged)

-- ---------------------------------------------------------------------------
-- Licence or conditions of use on shared resources
-- ---------------------------------------------------------------------------
alter table public.resources add column licence text check (length(licence) <= 300);

create or replace function public.share_resource(p jsonb)
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
    title, category, kind, url, file_path, file_type, file_size, description, licence,
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
-- Retention
-- ---------------------------------------------------------------------------

-- Files of resources about to be deleted, so the job can remove them from
-- storage before purge_old_records() deletes the rows.
create function public.expired_resource_files()
returns table (file_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.file_path from public.resources r
  where r.status in ('rejected', 'removed') and r.file_path is not null
    and r.updated_at < now() - interval '12 months';
$$;

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

  return v_total;
end;
$$;

revoke execute on function public.expired_resource_files() from public, anon, authenticated;
revoke execute on function public.purge_old_records() from public, anon, authenticated;
grant execute on function public.expired_resource_files() to service_role;
grant execute on function public.purge_old_records() to service_role;
