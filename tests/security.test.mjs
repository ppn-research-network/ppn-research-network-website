// Security tests: connect exactly as an anonymous visitor (public key only)
// and prove the database gives nothing away.
//
// Run with:  npm run test:security
// Test submissions are titled "[Security test] …" and stay pending (never public).
// Remove them with:  npm run test:security:cleanup

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const run = Date.now();
const testEmail = `security-test+${run}@example.com`;
const EMAIL_PATTERN = /[^@\s]+@[^@\s]+\.[^@\s]+/;

const NO_ID = '00000000-0000-0000-0000-000000000000';

// Passes only when the database refused on permission grounds, not for some
// unrelated reason such as a typo in a column name.
function assertDenied(error, what) {
  assert.ok(error, `${what} was allowed`);
  assert.equal(error.code, '42501', `${what} failed, but not with "permission denied": ${error.message}`);
}

const PRIVATE_TABLES = [
  'datasets',
  'dataset_contacts',
  'profiles',
  'profile_contacts',
  'contact_requests',
  'admins',
];

function validDataset(title) {
  return {
    title,
    summary: 'Automated security test submission. Safe to delete.',
    keywords: ['security test'],
    study_design: 'cohort',
    lead_institution: 'Test institution',
    state: 'NSW',
    data_types: ['dietary_intake'],
    biospecimens: false,
    access_level: 'controlled',
    access_requirements: ['ethics'],
    consent_secondary_use: 'unsure',
    contact_name: 'Test Person',
    contact_role: 'Tester',
    consent_to_list: true,
  };
}

function validProfile(name) {
  return {
    full_name: name,
    role: 'Tester',
    career_stage: 'other',
    institution: 'Test institution',
    state: 'VIC',
    discipline: 'other',
    skills: ['testing'],
    bio: 'Automated security test submission. Safe to delete.',
    looking_for: ['advice'],
    open_to: ['advice'],
    consent_to_list: true,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

for (const table of PRIVATE_TABLES) {
  test(`visitors cannot read the ${table} table`, async () => {
    const { error } = await db.from(table).select('*').limit(1);
    assertDenied(error, `reading ${table}`);
  });
}

for (const view of ['public_datasets', 'public_profiles']) {
  test(`${view}: readable, with no email or moderation columns and no email addresses`, async () => {
    const { data, error } = await db.from(view).select('*');
    assert.equal(error, null, error?.message);
    for (const row of data) {
      for (const [column, value] of Object.entries(row)) {
        assert.doesNotMatch(column, /email|status|review_note|approved_by|reviewed_by|consent_to_list/i,
          `${view} exposes column ${column}`);
        assert.doesNotMatch(JSON.stringify(value ?? ''), EMAIL_PATTERN,
          `${view} row ${row.id} has an email-like value in ${column}`);
      }
    }
  });
}

test('visitors can read the word lists', async () => {
  const { data, error } = await db.from('vocab_terms').select('list, code, label');
  assert.equal(error, null, error?.message);
  assert.ok(data.length > 0);
});

// ---------------------------------------------------------------------------
// Submitting: always pending, never public
// ---------------------------------------------------------------------------

test('a submitted dataset is hidden from the public, even if it asks to be approved', async () => {
  const title = `[Security test] dataset ${run}`;
  const listing = { ...validDataset(title), status: 'approved', approved_at: new Date().toISOString() };

  const { error } = await db.rpc('submit_dataset', { p_listing: listing, p_email: testEmail });
  assert.equal(error, null, error?.message);

  const { data } = await db.from('public_datasets').select('id').eq('title', title);
  assert.equal(data.length, 0, 'pending dataset is visible to the public');
});

test('a submitted profile is hidden from the public, even if it asks to be approved', async () => {
  const name = `[Security test] profile ${run}`;
  const profile = { ...validProfile(name), status: 'approved' };

  const { error } = await db.rpc('submit_profile', { p_profile: profile, p_email: testEmail });
  assert.equal(error, null, error?.message);

  const { data } = await db.from('public_profiles').select('id').eq('full_name', name);
  assert.equal(data.length, 0, 'pending profile is visible to the public');
});

test('submissions without the consent tick are refused', async () => {
  const listing = { ...validDataset(`[Security test] no consent ${run}`), consent_to_list: false };
  const { error } = await db.rpc('submit_dataset', { p_listing: listing, p_email: testEmail });
  assert.ok(error, 'submission without consent was accepted');
});

test('submissions with an invalid email are refused', async () => {
  const { error } = await db.rpc('submit_profile', {
    p_profile: validProfile(`[Security test] bad email ${run}`),
    p_email: 'not-an-email',
  });
  assert.ok(error, 'submission with an invalid email was accepted');
});

test('submissions with an unknown word-list option are refused', async () => {
  const listing = { ...validDataset(`[Security test] bad option ${run}`), data_types: ['made_up'] };
  const { error } = await db.rpc('submit_dataset', { p_listing: listing, p_email: testEmail });
  assert.ok(error, 'submission with an unknown data type was accepted');
});

test('contact requests to a listing that is not public are refused', async () => {
  const { error } = await db.rpc('send_contact_request', {
    p_target_type: 'dataset',
    p_target_id: crypto.randomUUID(),
    p_name: 'Test Person',
    p_email: testEmail,
    p_institution: 'Test institution',
    p_message: 'Automated security test message. Safe to delete.',
    p_acknowledged: true,
  });
  assert.ok(error, 'contact request to an unknown listing was accepted');
});

// ---------------------------------------------------------------------------
// Writing directly (bypassing the submission functions) must fail
// ---------------------------------------------------------------------------

test('visitors cannot add rows directly', async () => {
  const attempts = [
    ['datasets', { ...validDataset(`[Security test] direct ${run}`), status: 'approved', slug: `x-${run}` }],
    ['profiles', { ...validProfile(`[Security test] direct ${run}`), status: 'approved', slug: `y-${run}` }],
    ['contact_requests', { sender_name: 'x', sender_email: testEmail, message: 'x'.repeat(30) }],
    ['admins', { user_id: crypto.randomUUID(), email: testEmail }],
    ['vocab_terms', { list: 'data_type', code: `test_${run}`, label: 'Test' }],
  ];
  for (const [table, row] of attempts) {
    const { error } = await db.from(table).insert(row);
    assertDenied(error, `direct insert into ${table}`);
  }
});

test('visitors cannot change or delete rows', async () => {
  const attempts = [
    ['datasets', { status: 'approved' }, 'id', NO_ID],
    ['profiles', { status: 'approved' }, 'id', NO_ID],
    ['dataset_contacts', { email: testEmail }, 'dataset_id', NO_ID],
    ['contact_requests', { status: 'sent' }, 'id', NO_ID],
    ['vocab_terms', { label: 'Changed' }, 'code', ''],
  ];
  for (const [table, change, column, notValue] of attempts) {
    const upd = await db.from(table).update(change).neq(column, notValue);
    assertDenied(upd.error, `updating ${table}`);

    const del = await db.from(table).delete().neq(column, notValue);
    assertDenied(del.error, `deleting from ${table}`);
  }
});

test('visitors cannot call internal helper functions', async () => {
  const { error } = await db.rpc('jtext', { p: { a: 'b' }, p_key: 'a' });
  assertDenied(error, 'calling an internal helper function');
});

test('visitors are not admins', async () => {
  const { data, error } = await db.rpc('is_admin');
  assert.equal(error, null, error?.message);
  assert.equal(data, false);
});
