// The hourly job, run by .github/workflows/hourly.yml.
//
//   1. Touch the database so the free Supabase project never pauses.
//   2. Once a day (from 9 am Sydney): queue annual-review reminders, delete
//      records and files past their retention period (see the privacy notice).
//   3. Pass on contact messages (Reply-To = the sender).
//   4. Send emails about people's own submissions (the outbox).
//   5. Once a day: email admins a digest, only if something is waiting.
//
// DRY_RUN=true reads everything and reports counts, but sends and changes nothing.
// Logs are public: counts only, never addresses or content (see lib.mjs).

import {
  DRY_RUN, MAX_SENDS_PER_RUN, fromAddress, isTestAddress, log, mailer, safeError, serviceClient, sydneyNow,
} from './lib.mjs';
import { digestEmail, outboxEmail, relayEmail } from './emails.mjs';

const MAX_ATTEMPTS = 3;
const db = serviceClient();
const transport = DRY_RUN ? null : mailer();
let sendsLeft = MAX_SENDS_PER_RUN;

async function send(message) {
  if (DRY_RUN) return;
  await transport.sendMail({ from: fromAddress(), ...message });
}

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

// ---------------------------------------------------------------------------
async function keepAlive() {
  check(await db.from('vocab_terms').select('code', { count: 'exact', head: true }), 'keep-alive query');
  log('Database reached');
}

// ---------------------------------------------------------------------------
async function dailyPrep(today) {
  const state = check(await db.from('job_state').select('value').eq('key', 'daily_prep').maybeSingle(), 'reading job state');
  if (state?.value === today) return;
  if (DRY_RUN) {
    log('Dry run: would queue annual reminders and purge old records');
    return;
  }
  const reminders = check(await db.rpc('queue_annual_reminders'), 'queueing annual reminders');
  // Remove files of resources past their retention period, then the records.
  const expired = check(await db.rpc('expired_resource_files'), 'finding expired files').map((r) => r.file_path);
  if (expired.length) check(await db.storage.from('resources').remove(expired), 'removing expired files');
  const purged = check(await db.rpc('purge_old_records'), 'purging old records');
  check(await db.from('job_state').upsert({ key: 'daily_prep', value: today, updated_at: new Date().toISOString() }), 'saving job state');
  log('Daily tasks done', { reminders_queued: reminders, old_records_deleted: purged, old_files_deleted: expired.length });
}

// ---------------------------------------------------------------------------
async function relayMessages() {
  const rows = check(await db.from('contact_requests')
    .select('id, dataset_id, profile_id, sender_name, sender_email, sender_institution, message, attempts, datasets(title), profiles(full_name)')
    .eq('status', 'queued').order('created_at').limit(MAX_SENDS_PER_RUN), 'reading contact messages');

  const datasetIds = rows.filter((r) => r.dataset_id).map((r) => r.dataset_id);
  const profileIds = rows.filter((r) => r.profile_id).map((r) => r.profile_id);
  const dc = datasetIds.length ? check(await db.from('dataset_contacts').select('dataset_id, email').in('dataset_id', datasetIds), 'reading contacts') : [];
  const pc = profileIds.length ? check(await db.from('profile_contacts').select('profile_id, email').in('profile_id', profileIds), 'reading contacts') : [];
  const to = new Map([...dc.map((c) => [c.dataset_id, c.email]), ...pc.map((c) => [c.profile_id, c.email])]);

  const counts = { sent: 0, skipped: 0, failed: 0, waiting: 0 };
  for (const r of rows) {
    const recipient = to.get(r.dataset_id ?? r.profile_id);
    const update = async (changes) => { if (!DRY_RUN) check(await db.from('contact_requests').update(changes).eq('id', r.id), 'updating a contact message'); };

    if (!recipient) {
      await update({ status: 'failed', last_error: 'The listing has no contact email' });
      counts.failed++;
      continue;
    }
    if (isTestAddress(recipient) || isTestAddress(r.sender_email)) {
      await update({ status: 'skipped', last_error: 'Test address: not sent' });
      counts.skipped++;
      continue;
    }
    if (sendsLeft <= 0) { counts.waiting++; continue; }

    const type = r.dataset_id ? 'dataset' : 'profile';
    const { subject, text } = relayEmail({
      type,
      title: type === 'dataset' ? r.datasets?.title : r.profiles?.full_name,
      sender_name: r.sender_name,
      sender_institution: r.sender_institution,
      sender_email: r.sender_email,
      message: r.message,
    });
    try {
      await send({ to: recipient, replyTo: { name: r.sender_name, address: r.sender_email }, subject, text });
      sendsLeft--;
      await update({ status: 'sent', sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null });
      counts.sent++;
    } catch (err) {
      const attempts = r.attempts + 1;
      await update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, last_error: safeError(err) });
      counts.failed++;
    }
  }
  log(DRY_RUN ? 'Contact messages (dry run: would send)' : 'Contact messages', counts);
}

// ---------------------------------------------------------------------------
async function sendOutbox() {
  const rows = check(await db.from('outbox').select('id, kind, to_email, details, attempts')
    .eq('status', 'queued').order('created_at').limit(MAX_SENDS_PER_RUN), 'reading the outbox');

  const counts = { sent: 0, skipped: 0, failed: 0, waiting: 0 };
  for (const r of rows) {
    const update = async (changes) => { if (!DRY_RUN) check(await db.from('outbox').update(changes).eq('id', r.id), 'updating the outbox'); };
    if (isTestAddress(r.to_email)) {
      await update({ status: 'skipped', last_error: 'Test address: not sent' });
      counts.skipped++;
      continue;
    }
    if (sendsLeft <= 0) { counts.waiting++; continue; }
    try {
      const { subject, text } = outboxEmail(r.kind, r.details ?? {});
      await send({ to: r.to_email, subject, text });
      sendsLeft--;
      await update({ status: 'sent', sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null });
      counts.sent++;
    } catch (err) {
      const attempts = r.attempts + 1;
      await update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, last_error: safeError(err) });
      counts.failed++;
    }
  }
  log(DRY_RUN ? 'Notification emails (dry run: would send)' : 'Notification emails', counts);
}

// ---------------------------------------------------------------------------
async function adminDigest(today) {
  const state = check(await db.from('job_state').select('value').eq('key', 'last_digest').maybeSingle(), 'reading job state');
  if (state?.value === today) return;

  const count = async (q, what) => {
    const result = await q;
    check(result, what);
    return result.count ?? 0;
  };
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const head = { count: 'exact', head: true };
  const counts = {
    datasets: await count(db.from('datasets').select('id', head).eq('status', 'pending'), 'counting datasets'),
    profiles: await count(db.from('profiles').select('id', head).eq('status', 'pending'), 'counting profiles'),
    updates: await count(db.from('listing_revisions').select('id', head).eq('status', 'pending'), 'counting updates'),
    members: await count(db.from('members').select('id', head).eq('status', 'pending'), 'counting members'),
    resources: await count(db.from('resources').select('id', head).eq('status', 'pending'), 'counting resources'),
    failedMessages: await count(db.from('contact_requests').select('id', head).eq('status', 'failed'), 'counting messages'),
    overdueReviews:
      await count(db.from('datasets').select('id', head).eq('status', 'approved').lt('reminder_sent_at', monthAgo), 'counting reviews')
      + await count(db.from('profiles').select('id', head).eq('status', 'approved').lt('reminder_sent_at', monthAgo), 'counting reviews'),
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total > 0) {
    const admins = check(await db.from('admins').select('email'), 'reading admins').map((a) => a.email).filter((e) => !isTestAddress(e));
    const { subject, text } = digestEmail(counts);
    if (admins.length) {
      await send({ to: process.env.GMAIL_USER ?? admins[0], bcc: admins, subject, text });
      sendsLeft--;
    }
    log(DRY_RUN ? 'Admin digest (dry run: would send)' : 'Admin digest sent', { waiting: total, admins: admins.length });
  } else {
    log('Admin digest: nothing waiting, not sent');
  }
  if (!DRY_RUN) {
    check(await db.from('job_state').upsert({ key: 'last_digest', value: today, updated_at: new Date().toISOString() }), 'saving job state');
  }
}

// ---------------------------------------------------------------------------
try {
  if (DRY_RUN) log('DRY RUN: nothing will be sent or changed');
  else await transport.verify();

  await keepAlive();
  const { date, hour } = sydneyNow();
  const daily = hour >= 9 || process.env.FORCE_DAILY === 'true';
  if (daily) await dailyPrep(date);
  await relayMessages();
  await sendOutbox();
  if (daily) await adminDigest(date);
  log('Finished');
} catch (err) {
  // The message may come from a library; strip anything that looks like an address.
  console.error(`The job stopped: ${safeError(err)}`);
  process.exit(1);
}
