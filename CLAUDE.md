# Precision & Personalised Nutrition Research Network website

## Purpose
A website for an Australian precision and personalised nutrition research network with two moderated directories:
1. Data directory: descriptions (metadata only) of datasets that researchers are willing to share, with access level, requirements and a contact person.
2. Skills directory: researcher profiles (nutrition, biomedical science, engineering, data science, statistics, clinical) so people can find collaborators.

Plus a members-only Resources page (recordings, templates, protocols), owner edits with admin review, and an admin approval dashboard. The members area ships at launch.

## Names and places
- Network name (logo, titles, footer): **Precision & Personalised Nutrition Research Network**. No "Australia" subtitle under the logo.
- GitHub organisation: `ppn-research-network`. Repository: `ppn-research-network-website` (public).
- Commits: name `ppnresearchnetwork`, email `ppn.researchnetwork@gmail.com` (set in this repo's local git config).
- Network Gmail (sends all site email): `ppn.researchnetwork@gmail.com`.
- Supabase project: `ppnresearchnetwork`, Sydney region.
- Site name and address live in one file: `site.config.mjs`. Internal links always go through `withBase()` in `src/lib/url.ts`.

## Stack
- Astro (static output) + React for interactive parts + Tailwind v4 + TypeScript
- Supabase: Postgres, Row Level Security, Auth (email magic link for admins, members and listing owners, sent through custom SMTP)
- Hosting: GitHub Pages, deployed by GitHub Actions
- Email: scheduled GitHub Actions using nodemailer through the network Gmail (SMTP + app password)

## Non-negotiable rules
- Never store or display research data itself; metadata only.
- Contact emails must never reach the browser of a visitor. Store them in admin-only tables.
- Every submission is saved with status 'pending' and only appears after an admin approves it.
- Never commit secrets. Only the Supabase public (anon) key may appear in site code. `.env` is git-ignored; `.env.example` holds blank labelled lines only.
- Every database change is a SQL migration file in supabase/migrations.
- The site's base path and URL come from one setting (`site.config.mjs`), so moving from github.io to a custom domain is a config change.
- Nothing members-only may be in the static site build; load it from Supabase after sign-in.
- Accessible (WCAG 2.1 AA), mobile-first, Australian English.
- Write automated tests for the security rules.

## Local-only files (git-ignored, never upload)
- `Build_Plan.md`: the full build plan. Read it at the start of each phase.
- `Precision Nutrition Network Website Claude Code Build Plan.docx`: do not touch.
- `design/*.pdf`: the mockups. Match them for layout, wording and colours. Where a screen has no mockup, design it in the same style.

## Design
Tokens are defined once in `src/styles/global.css` (`@theme`); use the Tailwind names (`bg-green`, `text-accent`, `bg-paper`, `border-line`, `bg-open` …) rather than raw hex values.
- Off-white page (`paper`), white cards with thin `line` borders and rounded corners, dark green (`green`) primary buttons, outlined secondary buttons, terracotta (`accent`) eyebrows and step labels, dark `footer` band (also the admin sidebar).
- Headings: serif (Newsreader). Body: sans (IBM Plex Sans). Both self-hosted via Fontsource, no Google Fonts requests.
- Access badges: Open = green, Registered = blue, Controlled = peach, Collaboration only = grey. Data-type and skill tags are pale green pills.
- Header nav: Data directory, Skills directory, 🔒 Resources, About, Sign in (or initials + My account), "Add a listing" button.
- Footer: disclaimer ("Listings describe data held by their custodians. The network does not hold, host or grant access to data, and a listing is not an endorsement.") with About, Privacy and terms, Contact the admins, Admin login.

## Working style
- The owner is not a developer: explain in plain English, especially any step done by hand (dashboards, secrets).
- One phase at a time (see Build_Plan.md). Plan before coding each phase, ask questions, and wait for approval. Never start the next phase unprompted.
- Say exactly when Supabase keys are needed and where to find them; the owner pastes them into `.env` themselves.
- Commit at the end of each phase with a clear message, then give a short summary: what was built, how to check it in a browser, what comes next.

## Commands
- `npm run dev`: run locally at http://localhost:4321/ppn-research-network-website/
- `npm run build`: build the static site into `dist/`
- `npm run check`: type-check
- `npm run db:push`: apply new migrations to the linked Supabase project (Sydney, ref `tjhpayiavitmcbkegnqq`; ignore the stray Singapore project)
- `npm run test:security` / `npm run test:security:cleanup`: security tests as an anonymous visitor, then remove their pending test rows

## Site structure
- `site.config.mjs` also holds CONTACT_EMAIL, REVIEW_TIME and INSTITUTION_COUNT; use them rather than repeating the wording.
- Pages use `SiteLayout` (header + footer). Reusable styles: `btn-primary`, `btn-secondary`, `btn-danger`, `card`, `eyebrow`, `badge`, `tag`, `input`, `field-label`, `choice`, `prose-page` (in `global.css`).
- Forms are React islands in `src/components/forms/`, built from `Fields.tsx` (labels, hints, inline errors, error summary, honeypot, consent box, privacy notice). Validate in the browser to match the database constraints.
- Detail page URLs: `/data/dataset/?slug=…` and `/skills/profile/?slug=…` (static pages that load the listing at runtime).
- Draft wording the owner must review is marked `<mark>[CHECK]</mark>`. List and remove these before launch (Phase 6).
- Admin names are not published; the site refers to "the leadership committee". Do not name the University of Newcastle or other institutions.

## Database
See `supabase/README.md`. Pick-lists (study design, data types, disciplines, etc.) live in the `vocab_terms` table so admins can change them in the dashboard; forms and filters must load them from there, never hard-code them. Listings store the `code`; show the `label`. Access levels, states and consent answers are fixed check constraints.
