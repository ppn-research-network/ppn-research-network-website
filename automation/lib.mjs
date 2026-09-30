// Shared pieces for the scheduled jobs (hourly.mjs, backup.mjs).
//
// PUBLIC LOGS: this repository is public, so GitHub Actions logs are too.
// Never print an email address, a message, a name or a key. Log counts only,
// through log() below.

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { BASE_PATH, CONTACT_EMAIL, NETWORK_NAME, REVIEW_TIME, SITE_URL } from '../site.config.mjs';

export { CONTACT_EMAIL, NETWORK_NAME, REVIEW_TIME };

export const DRY_RUN = process.env.DRY_RUN === 'true';

// Sends per run, across every kind of email, to stay far inside Gmail's daily limit.
export const MAX_SENDS_PER_RUN = 50;

export function requireEnv(...names) {
  // Before any secrets have been added (new repository), skip quietly rather
  // than failing every hour.
  if (!process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.GMAIL_USER) {
    console.log('Not set up yet: add the repository secrets to switch this job on.');
    process.exit(0);
  }
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing settings: ${missing.join(', ')}. Add them as repository secrets.`);
    process.exit(1);
  }
}

// Database client with the service role key: bypasses the security rules, so
// it must only ever run inside GitHub Actions, never in the website.
export function serviceClient() {
  requireEnv('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function mailer() {
  requireEnv('GMAIL_USER', 'GMAIL_APP_PASSWORD');
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

export function fromAddress() {
  return { name: NETWORK_NAME, address: process.env.GMAIL_USER };
}

// Full link to a page on the live site, e.g. site('/account/').
export function site(path) {
  const base = BASE_PATH === '/' ? '' : BASE_PATH.replace(/\/$/, '');
  return `${SITE_URL}${base}${path}`;
}

export const listingLink = (type, slug) =>
  site(type === 'dataset' ? `/data/dataset/?slug=${encodeURIComponent(slug)}` : `/skills/profile/?slug=${encodeURIComponent(slug)}`);

// Sample listings and test accounts use these; never send to them.
export function isTestAddress(email) {
  return /@example\.(com|org|net)$/i.test(String(email ?? '').trim());
}

// Keep subjects on one line.
export const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

// Error text stored in the database for admins: strip anything that looks like
// an email address, and keep it short.
export function safeError(err) {
  return String(err?.message ?? err).replace(/[^\s@<>"]+@[^\s@<>"]+/g, '[address]').slice(0, 300);
}

// Counts-only logging.
export function log(message, counts = {}) {
  const parts = Object.entries(counts).map(([k, v]) => `${k}=${Number(v) || 0}`);
  console.log(`${message}${parts.length ? ` (${parts.join(', ')})` : ''}`);
}

// Date and hour in Sydney, for once-a-day tasks.
export function sydneyNow() {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
