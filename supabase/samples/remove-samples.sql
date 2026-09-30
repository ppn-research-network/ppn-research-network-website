-- Removes every sample listing (is_sample = true), with their contact emails
-- and any messages sent to them. Run with:  npm run samples:remove
delete from public.datasets where is_sample;
delete from public.profiles where is_sample;

select
  (select count(*) from public.datasets where is_sample) as sample_datasets_left,
  (select count(*) from public.profiles where is_sample) as sample_profiles_left;
