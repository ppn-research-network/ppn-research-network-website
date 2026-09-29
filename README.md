# Precision & Personalised Nutrition Research Network website

A moderated directory of Australian nutrition datasets (descriptions only, never the data) and a skills directory that connects nutrition researchers with biomedical scientists, engineers, data scientists and clinicians.

Built with Astro, React, Tailwind and Supabase. Hosted on GitHub Pages.

## Run it locally

Requires Node.js 22.12 or later (24 LTS recommended).

```sh
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

Open http://localhost:4321/ppn-research-network-website/

## Changing the web address

The site name, URL and base path are set in `site.config.mjs`.
