-- Phase 2 · Security: table privileges and Row Level Security.
--
-- Who can do what:
--   Visitors (anon)          read the two public views and the word lists;
--                            call the three submission functions. Nothing else.
--   Signed-in, not admin     same as visitors (Phase 4b adds owner and member rights).
--   Admins                   read and update everything; delete listings.
--   Email job (service key)  bypasses these rules by design (Phase 5 only).

-- ---------------------------------------------------------------------------
-- 1. Start from nothing: remove Supabase's default table grants.
-- ---------------------------------------------------------------------------
revoke all on table
  public.admins,
  public.vocab_terms,
  public.datasets,
  public.dataset_contacts,
  public.profiles,
  public.profile_contacts,
  public.contact_requests,
  public.public_datasets,
  public.public_profiles
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security on every table.
-- ---------------------------------------------------------------------------
alter table public.admins            enable row level security;
alter table public.vocab_terms       enable row level security;
alter table public.datasets          enable row level security;
alter table public.dataset_contacts  enable row level security;
alter table public.profiles          enable row level security;
alter table public.profile_contacts  enable row level security;
alter table public.contact_requests  enable row level security;

-- ---------------------------------------------------------------------------
-- 3. What visitors get.
-- ---------------------------------------------------------------------------
grant select on public.public_datasets, public.public_profiles to anon, authenticated;

grant select on public.vocab_terms to anon, authenticated;
create policy "Anyone can read the word lists"
  on public.vocab_terms for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. What admins get (signed in, and listed in admins).
-- ---------------------------------------------------------------------------
grant select                  on public.admins            to authenticated;
grant select, insert, update  on public.vocab_terms       to authenticated;
grant select, update, delete  on public.datasets          to authenticated;
grant select, update          on public.dataset_contacts  to authenticated;
grant select, update, delete  on public.profiles          to authenticated;
grant select, update          on public.profile_contacts  to authenticated;
grant select, update          on public.contact_requests  to authenticated;

create policy "Admins read admins"
  on public.admins for select to authenticated
  using (public.is_admin());

create policy "Admins add word-list options"
  on public.vocab_terms for insert to authenticated
  with check (public.is_admin());
create policy "Admins edit word-list options"
  on public.vocab_terms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins read datasets"
  on public.datasets for select to authenticated using (public.is_admin());
create policy "Admins update datasets"
  on public.datasets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete datasets"
  on public.datasets for delete to authenticated using (public.is_admin());

create policy "Admins read dataset contacts"
  on public.dataset_contacts for select to authenticated using (public.is_admin());
create policy "Admins update dataset contacts"
  on public.dataset_contacts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins read profiles"
  on public.profiles for select to authenticated using (public.is_admin());
create policy "Admins update profiles"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete profiles"
  on public.profiles for delete to authenticated using (public.is_admin());

create policy "Admins read profile contacts"
  on public.profile_contacts for select to authenticated using (public.is_admin());
create policy "Admins update profile contacts"
  on public.profile_contacts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins read contact requests"
  on public.contact_requests for select to authenticated using (public.is_admin());
create policy "Admins update contact requests"
  on public.contact_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Functions: only the three submission functions (and is_admin, which the
--    admin dashboard uses) can be called from the website.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.submit_dataset(jsonb, text, text)                                  to anon, authenticated;
grant execute on function public.submit_profile(jsonb, text, text)                                  to anon, authenticated;
grant execute on function public.send_contact_request(text, uuid, text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.is_admin()                                                         to anon, authenticated;

-- Helpers that admins' edits run through (checks and triggers).
grant execute on function public.tags_ok(text[], integer, integer) to authenticated;
grant execute on function public.make_slug(text, uuid)            to authenticated;
grant execute on function public.vocab_codes_valid(text, text[])  to authenticated;
grant execute on function public.listing_before_write()           to authenticated;

-- Stop Supabase's defaults from quietly granting visitors access to anything
-- added in later phases; each later migration grants what it needs explicitly.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
