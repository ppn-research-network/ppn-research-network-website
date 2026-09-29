# Database (Supabase)

Every database change is a numbered SQL file in `migrations/`. Never change the database by hand except for the admin tasks below.

## What is where

| Table or view | Holds | Visitors | Admins |
| --- | --- | --- | --- |
| `public_datasets` (view) | Approved datasets, no emails | Read | Read |
| `public_profiles` (view) | Approved profiles, no emails | Read | Read |
| `vocab_terms` | Word lists for forms and filters | Read | Read, add, edit |
| `datasets` | All dataset listings and their status | Nothing | Read, update, delete |
| `dataset_contacts` | Custodian emails (private) | Nothing | Read, update |
| `profiles` | All skills profiles and their status | Nothing | Read, update, delete |
| `profile_contacts` | Profile emails (private) | Nothing | Read, update |
| `contact_requests` | Messages sent through the site | Nothing | Read, update |
| `admins` | Who the admins are | Nothing | Read |

Visitors add things only through three functions, which always save as pending:
`submit_dataset(p_listing, p_email, p_website)`, `submit_profile(p_profile, p_email, p_website)` and
`send_contact_request(p_target_type, p_target_id, p_name, p_email, p_institution, p_message, p_acknowledged, p_website)`.
`p_website` is the hidden spam trap: if it has any value, nothing is saved.

## Applying changes

The project is linked to the Sydney Supabase project (`ppnresearchnetwork`). To apply new migration files:

```sh
npm run db:push
```

## Checking security

```sh
npm run test:security           # needs PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in .env
npm run test:security:cleanup   # removes the pending "[Security test]" rows it creates
```

## Admin tasks in the Supabase dashboard

**Add an admin**
1. Authentication → Users → Add user → Create new user. Enter their email, tick "Auto Confirm User", and leave the password blank or random (admins sign in with an email link).
2. Copy the new user's UID.
3. Table Editor → `admins` → Insert row: paste the UID into `user_id` and their email into `email`. Save.

To remove an admin, delete their row from `admins`.

**Change a word list** (Table Editor → `vocab_terms`)
- Rename an option: edit its `label`. Existing listings show the new name straight away.
- Hide an option from forms and filters: set `active` to false. Listings that already use it keep it.
- Add an option: insert a row with the `list` name, a new lowercase `code` (letters, numbers and underscores only) and a `label`. Use `sort_order` to position it.
- Never change or delete a `code` once listings use it.
- Study designs also have a `filter_group`, which is the name of the directory filter they appear under.
