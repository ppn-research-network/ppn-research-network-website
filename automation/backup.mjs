// Weekly backup, run by .github/workflows/weekly.yml.
// Writes every table as CSV, plus the members' resource files, into the folder
// given on the command line (a checkout of the PRIVATE backups repository).
//
//   node automation/backup.mjs <folder>
//
// Logs are public: counts only.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { log, safeError, serviceClient } from './lib.mjs';

const TABLES = [
  'datasets', 'dataset_contacts', 'profiles', 'profile_contacts', 'contact_requests',
  'admins', 'members', 'listing_revisions', 'listing_history', 'resources',
  'vocab_terms', 'outbox', 'job_state',
];
const PAGE = 1000;

const out = process.argv[2];
if (!out) {
  console.error('Usage: node automation/backup.mjs <folder>');
  process.exit(1);
}

const db = serviceClient();

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
  // Start fresh each week so deleted records disappear from the latest copy;
  // earlier weeks stay in the backup repository's history.
  rmSync(join(out, 'tables'), { recursive: true, force: true });
  rmSync(join(out, 'files'), { recursive: true, force: true });
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

  writeFileSync(join(out, 'README.md'), `# Backup of the network website database

Updated ${new Date().toISOString()} by the weekly job in ppn-research-network-website.

- \`tables/\`: one CSV file per database table (lists and JSON columns are stored as JSON text).
- \`files/\`: members' resource files, in the same folders as in Supabase Storage.

PRIVATE: contains email addresses and messages. Never make this repository public.
Earlier weeks are in this repository's commit history.

## Restoring
Table structure comes from the migrations in the website repository (\`supabase/migrations\`). Rows can be
imported from these CSV files in the Supabase dashboard (Table Editor, Import data from CSV), parents first:
datasets and profiles, then their contacts, then everything else.
`);

  log('Backup written', { ...counts, files: files.length });
} catch (err) {
  console.error(`Backup failed: ${safeError(err)}`);
  process.exit(1);
}
