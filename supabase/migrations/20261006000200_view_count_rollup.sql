-- Phase 6b · Keep view counts small: after 90 days, a listing's daily rows are
-- merged into one row per month (dated the 1st). Totals stay the same; the
-- "last 30 days" figure only ever uses recent daily rows.

create function public.roll_up_old_views()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  create temporary table old_views on commit drop as
  with gone as (
    delete from public.listing_views
    where day < current_date - 90 and day <> date_trunc('month', day)::date
    returning dataset_id, profile_id, date_trunc('month', day)::date as month, views
  )
  select dataset_id, profile_id, month, sum(views)::integer as views
  from gone group by dataset_id, profile_id, month;

  get diagnostics v_n = row_count;

  insert into public.listing_views (dataset_id, day, views)
  select dataset_id, month, views from old_views where dataset_id is not null
  on conflict (dataset_id, day) where dataset_id is not null
  do update set views = public.listing_views.views + excluded.views;

  insert into public.listing_views (profile_id, day, views)
  select profile_id, month, views from old_views where profile_id is not null
  on conflict (profile_id, day) where profile_id is not null
  do update set views = public.listing_views.views + excluded.views;

  return v_n;
end;
$$;

revoke execute on function public.roll_up_old_views() from public, anon, authenticated;
grant execute on function public.roll_up_old_views() to service_role;
