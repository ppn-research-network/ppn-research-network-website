// Weekly backup, run by .github/workflows/weekly.yml.
// Writes every table as CSV, plus the members' resource files, into a dated
// snapshot folder inside the folder given on the command line (a checkout of
// the PRIVATE backups repository), and keeps only the newest KEEP snapshots.
// The workflow then replaces the repository's history with a single commit,
// so older backups are really gone (privacy notice: about 8 weeks).
//
//   node automation/backup.mjs <folder>
//
// Logs are public: counts only.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { log, safeError, serviceClient } from './lib.mjs';

const TABLES = [
  'datasets', 'dataset_contacts', 'profiles', 'profile_contacts', 'contact_requests',
  'admins', 'members', 'listing_revisions', 'listing_history', 'resources',
  'vocab_terms', 'outbox', 'job_state',
];
const PAGE = 1000;
const KEEP = 8;

const root = process.argv[2];
if (!root) {
  console.error('Usage: node automation/backup.mjs <folder>');
  process.exit(1);
}

const db = serviceClient();
const snapshot = new Date().toISOString().slice(0, 10);
const out = join(root, 'snapshots', snapshot);

function csvCell(value) {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))];
  writeFileSync(join(out, 'tables', `${table}.csv`), lines.join('\n') + '\n');
  return rows.length;
}

// Every file in the private "resources" bucket (uploads/<user id>/<file>).
async function listFiles(prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from('resources').list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`listing files: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listFiles(path)));   // a folder
      else files.push(path);
    }
    if (data.length < PAGE) break;
  }
  return files;
}

try {
  // Tidy up the layout used before snapshots existed.
  rmSync(join(root, 'tables'), { recursive: true, force: true });
  rmSync(join(root, 'files'), { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'tables'), { recursive: true });

  const counts = {};
  for (const t of TABLES) counts[t] = await exportTable(t);

  const files = await listFiles();
  for (const path of files) {
    const { data, error } = await db.storage.from('resources').download(path);
    if (error) throw new Error(`downloading a file: ${error.message}`);
    const target = join(out, 'files', path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await data.arrayBuffer()));
  }

  // Keep only the newest KEEP weekly snapshots.
  const all = readdirSync(join(root, 'snapshots')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const removed = all.slice(0, Math.max(0, all.length - KEEP));
  for (const d of removed) rmSync(join(root, 'snapshots', d), { recursive: true, force: true });

  writeFileSync(join(root, 'README.md'), `# Backups of the network website database

Updated ${new Date().toISOString()} by the weekly job in ppn-research-network-website.

\`snapshots/<date>/\` holds one weekly backup each; only the newest ${KEEP} are kept, and the repository's history
is replaced every week, so older backups are permanently removed (as the privacy notice promises).

- \`tables/\`: one CSV file per database table (lists and JSON columns are stored as JSON text).
- \`files/\`: members' resource files, in the same folders as in Supabase Storage.

PRIVATE: contains email addresses and messages. Never make this repository public.

## Restoring
Table structure comes from the migrations in the website repository (\`supabase/migrations\`). Rows can be
imported from these CSV files in the Supabase dashboard (Table Editor, Import data from CSV), parents first:
datasets and profiles, then their contacts, then everything else.
`);

  log('Backup written', { ...counts, files: files.length, snapshots_kept: all.length - removed.length, snapshots_removed: removed.length });
} catch (err) {
  console.error(`Backup failed: ${safeError(err)}`);
  process.exit(1);
}
