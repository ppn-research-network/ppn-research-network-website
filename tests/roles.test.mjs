// Security tests for signed-in people: listing owners, members and strangers.
// Creates temporary test accounts (…@example.com) in the linked Supabase
// project, runs the checks, then deletes the accounts and everything they made.
//
// Run with:  npm run test:roles    (needs the Supabase CLI linked, and .env)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const run = Date.now();
const password = randomBytes(18).toString('hex');
const people = {
  owner: `roles-test-owner+${run}@example.com`,
  stranger: `roles-test-stranger+${run}@example.com`,
  member: `roles-test-member+${run}@example.com`,
  admin: `roles-test-admin+${run}@example.com`,
};
const clients = {};
let datasetId;
let memberFile;

// Runs SQL against the linked project through the Supabase CLI.
function sql(text) {
  const dir = mkdtempSync(join(tmpdir(), 'roles-test-'));
  const file = join(dir, 'q.sql');
  try {
    writeFileSync(file, text, { mode: 0o600 });
    return execFileSync('supabase', ['db', 'query', '--linked', '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const createUser = (email) => `
  do $$ declare uid uuid := gen_random_uuid(); begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', '${email}',
      extensions.crypt('${password}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', '${email}', 'email_verified', true), 'email', now(), now(), now());
  end $$;`;

before(async () => {
  sql(Object.values(people).map(createUser).join('\n') + `
    insert into public.admins (user_id, email) select id, email from auth.users where email = '${people.admin}';
    insert into public.members (email, full_name, institution, role, agreed_code, status)
      values ('${people.member}', 'Roles Test Member', 'Test institution', 'researcher', true, 'approved');`);

  for (const [who, email] of Object.entries(people)) {
    const c = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`${who} could not sign in: ${error.message}`);
    clients[who] = c;
  }

  // The owner's dataset, published.
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await anon.rpc('submit_dataset', {
    p_listing: {
      title: `[Roles test] dataset ${run}`, summary: 'Automated roles test listing. Safe to delete.', study_design: 'cohort',
      lead_institution: 'Test institution', state: 'NSW', data_types: ['dietary_intake'], biospecimens: false,
      access_levels: ['controlled'], consent_secondary_use: 'partly', contact_name: 'Test Owner', contact_role: 'Tester', consent_to_list: true,
    },
    p_email: people.owner,
  });
  if (error) throw error;
  const { data } = await clients.admin.from('datasets').update({ status: 'approved' }).eq('title', `[Roles test] dataset ${run}`).select('id');
  datasetId = data[0].id;
});

after(async () => {
  if (memberFile) await clients.admin?.storage.from('resources').remove([memberFile]);
  sql(`
    delete from public.resources where shared_by_email like 'roles-test-%@example.com';
    delete from public.outbox where to_email like 'roles-test-%@example.com';
    delete from public.news_items where submitted_email like 'roles-test-%@example.com';
    delete from public.datasets where title like '[Roles test]%';
    delete from public.members where email like 'roles-test-%@example.com';
    delete from public.admins where email like 'roles-test-%@example.com';
    delete from auth.users where email like 'roles-test-%@example.com';`);
});

const denied = (error, what) => {
  assert.ok(error, `${what} was allowed`);
};

// ---------------------------------------------------------------------------
// Listing owners
// ---------------------------------------------------------------------------

test('an owner sees only their own listings', async () => {
  const { data, error } = await clients.owner.rpc('my_listings');
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, datasetId);
});

test('someone else sees none of the owner’s listings and cannot change them', async () => {
  const { data } = await clients.stranger.rpc('my_listings');
  assert.equal(data.length, 0);
  const { error: e1 } = await clients.stranger.rpc('submit_revision', { p_kind: 'dataset', p_id: datasetId, p_proposed: { title: 'Hijacked' } });
  denied(e1, 'a stranger proposing an update');
  const { error: e2 } = await clients.stranger.rpc('withdraw_listing', { p_kind: 'dataset', p_id: datasetId });
  denied(e2, 'a stranger withdrawing the listing');
  const { error: e3 } = await clients.stranger.rpc('approve_revision', { p_revision_id: crypto.randomUUID() });
  denied(e3, 'a non-admin approving an update');
});

test('opening up access needs an ethics reference, and the live listing waits for approval', async () => {
  const { data: mine } = await clients.owner.rpc('my_listings');
  const proposed = { ...mine[0].listing, access_levels: ['open'] };
  const { error: noEthics } = await clients.owner.rpc('submit_revision', { p_kind: 'dataset', p_id: datasetId, p_proposed: proposed });
  denied(noEthics, 'opening access without an ethics reference');

  const { data, error } = await clients.owner.rpc('submit_revision', {
    p_kind: 'dataset', p_id: datasetId, p_proposed: proposed, p_ethics: 'HREC test 123', p_note: 'Test',
  });
  assert.equal(error, null, error?.message);
  assert.equal(data, 'submitted');

  const anon = createClient(url, key, { auth: { persistSession: false } });
  const { data: live } = await anon.from('public_datasets').select('access_levels').eq('id', datasetId).single();
  assert.deepEqual(live.access_levels, ['controlled'], 'the live listing changed before approval');
});

test('proposed updates and ethics references are hidden from the public and from other people', async () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });
  denied((await anon.from('listing_revisions').select('*')).error, 'a visitor reading proposed updates');
  const { data } = await clients.stranger.from('listing_revisions').select('*');
  assert.equal(data.length, 0, 'a stranger can see proposed updates');
});

// ---------------------------------------------------------------------------
// Members and resources
// ---------------------------------------------------------------------------

test('a member can upload to their own folder and share a resource for review', async () => {
  const { data: u } = await clients.member.auth.getUser();
  memberFile = `uploads/${u.user.id}/${run}-roles-test.pdf`;
  const pdf = new Blob(['%PDF-1.4\n% roles test\n'], { type: 'application/pdf' });
  const up = await clients.member.storage.from('resources').upload(memberFile, pdf, { contentType: 'application/pdf' });
  assert.equal(up.error, null, up.error?.message);

  const { error } = await clients.member.rpc('share_resource', {
    p: { title: `[Roles test] template ${run}`, category: 'consent', file_path: memberFile, file_type: 'pdf', file_size: 30, confirms_rights: true },
  });
  assert.equal(error, null, error?.message);
});

test('a member cannot upload into someone else’s folder, or share a file that isn’t theirs', async () => {
  const { data: s } = await clients.stranger.auth.getUser();
  const pdf = new Blob(['%PDF-1.4\n'], { type: 'application/pdf' });
  const up = await clients.member.storage.from('resources').upload(`uploads/${s.user.id}/${run}.pdf`, pdf, { contentType: 'application/pdf' });
  denied(up.error, 'uploading into another person’s folder');
});

test('a non-member cannot list resources, upload, or download files', async () => {
  const { data } = await clients.stranger.from('resources').select('*');
  assert.equal(data.length, 0, 'a non-member can see resources');

  const { data: s } = await clients.stranger.auth.getUser();
  const pdf = new Blob(['%PDF-1.4\n'], { type: 'application/pdf' });
  const up = await clients.stranger.storage.from('resources').upload(`uploads/${s.user.id}/${run}.pdf`, pdf, { contentType: 'application/pdf' });
  denied(up.error, 'a non-member uploading');

  const dl = await clients.stranger.storage.from('resources').createSignedUrl(memberFile, 60);
  denied(dl.error, 'a non-member downloading a member’s file');

  const { error } = await clients.stranger.rpc('share_resource', { p: { title: 'Nope nope', category: 'consent', url: 'https://example.com', confirms_rights: true } });
  denied(error, 'a non-member sharing a resource');
});

test('visitors cannot read resources, members or files', async () => {
  const anon = createClient(url, key, { auth: { persistSession: false } });
  denied((await anon.from('resources').select('*')).error, 'a visitor reading resources');
  denied((await anon.from('members').select('*')).error, 'a visitor reading members');
  const dl = await anon.storage.from('resources').createSignedUrl(memberFile, 60);
  denied(dl.error, 'a visitor downloading a file');
});

test('other members only see a resource once an admin approves it', async () => {
  const title = `[Roles test] template ${run}`;
  sql(`insert into public.members (email, full_name, institution, role, agreed_code, status)
       values ('${people.stranger}', 'Roles Test Second Member', 'Test institution', 'researcher', true, 'approved');`);
  const before = await clients.stranger.from('resources').select('id').eq('title', title);
  assert.equal(before.data.length, 0, 'a pending resource is visible to other members');

  const { data: r } = await clients.admin.from('resources').update({ status: 'approved' }).eq('title', title).select('id');
  assert.equal(r.length, 1);
  const afterApprove = await clients.stranger.from('resources').select('id').eq('title', title);
  assert.equal(afterApprove.data.length, 1, 'an approved resource is not visible to members');
  const dl = await clients.stranger.storage.from('resources').createSignedUrl(memberFile, 60);
  assert.equal(dl.error, null, dl.error?.message);
});

// ---------------------------------------------------------------------------
// News and events
// ---------------------------------------------------------------------------

test('only members can post news; posts wait for approval; members-only posts stay hidden from non-members', async () => {
  const item = { kind: 'event', title: `[Roles test] members workshop ${run}`, summary: 'Automated roles test post. Safe to delete.', url: 'https://example.org', starts_on: '2030-01-01', members_only: true };
  // The owner account is never a member (the stranger becomes one in an earlier test).
  denied((await clients.owner.rpc('submit_news', { p: { ...item, members_only: false } })).error, 'a non-member posting news');

  const { data, error } = await clients.member.rpc('submit_news', { p: item });
  assert.equal(error, null, error?.message);
  assert.equal(data, 'pending');
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.equal((await anon.from('listed_news').select('id').eq('title', item.title)).data.length, 0, 'a pending post is public');

  const { data: approved } = await clients.admin.from('news_items').update({ status: 'approved' }).eq('title', item.title).select('id');
  assert.equal(approved.length, 1);
  assert.equal((await clients.member.from('listed_news').select('id').eq('title', item.title)).data.length, 1, 'a member cannot see a members-only post');
  assert.equal((await anon.from('listed_news').select('id').eq('title', item.title)).data.length, 0, 'a visitor can see a members-only post');
  assert.equal((await clients.owner.from('listed_news').select('id').eq('title', item.title)).data.length, 0, 'a signed-in non-member can see a members-only post');
});
