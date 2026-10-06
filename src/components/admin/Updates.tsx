import { useEffect, useState, type ReactNode } from 'react';
import { labelFor, type Vocab, type VocabList } from '../../lib/vocab';
import { accessLevel, consentLabel, displayName, formatDate, sortLevels, stateName } from '../../lib/listings';
import { moreOpen } from '../forms/OwnerNotes';
import { approveRevision, setRevisionStatus, type AdminData, type Revision } from './data';

// Field definitions for the "What changed" table.
type Format = (v: unknown, vocab: Vocab) => ReactNode;
const text: Format = (v) => (v == null || v === '' ? '—' : String(v));
const list = (l?: VocabList): Format => (v, vocab) => {
  const arr = (v as string[] | null) ?? [];
  return arr.length ? arr.map((c) => (l ? labelFor(vocab, l, c) : c)).join('; ') : '—';
};
const one = (l: VocabList): Format => (v, vocab) => (v ? labelFor(vocab, l, String(v)) : '—');
const access: Format = (v) => (
  <span className="flex flex-wrap gap-1">
    {sortLevels((v as string[]) ?? []).map((l) => <span key={l} className={`badge ${accessLevel(l).badgeClass}`}>{accessLevel(l).badge}</span>)}
  </span>
);

const DATASET_FIELDS: [string, string, Format][] = [
  ['title', 'Title', text], ['summary', 'Description', text], ['keywords', 'Keywords', list()],
  ['study_design', 'Study design', one('study_design')], ['years_collected', 'Years collected', text],
  ['sample_size', 'Sample size', text], ['age_range', 'Age range', text], ['population', 'Population', text],
  ['lead_institution', 'Lead institution', text], ['state', 'State', (v) => stateName(String(v))],
  ['life_stages', 'Life stage', list('life_stage')], ['health_statuses', 'Health status', list('health_status')],
  ['data_types', 'Data types', list('data_type')], ['data_types_other', 'Other data types', text],
  ['biospecimens', 'Biospecimens', (v) => (v ? 'Yes' : 'No')], ['biospecimens_details', 'Biospecimen details', text],
  ['access_levels', 'Access level', access], ['access_requirements', 'Requirements', list('access_requirement')],
  ['access_notes', 'Access details', text], ['consent_secondary_use', 'Consent for secondary use', (v) => consentLabel(String(v))],
  ['repository_url', 'Repository', text], ['publication_url', 'Key publication', text],
  ['trial_registration', 'Trial registration', text], ['contact_name', 'Contact name', text], ['contact_role', 'Contact role', text],
];
const PROFILE_FIELDS: [string, string, Format][] = [
  ['honorific', 'Title', one('honorific')], ['full_name', 'Name', text], ['role', 'Role', text],
  ['career_stage', 'Career stage', one('career_stage')], ['institution', 'Institution', text],
  ['state', 'State', (v) => stateName(String(v))], ['discipline', 'Discipline', one('discipline')],
  ['skills', 'Skills', list()], ['bio', 'Bio', text], ['orcid', 'ORCID', text], ['profile_url', 'Profile link', text],
  ['looking_for', 'Looking for', list('looking_for')], ['open_to', 'Open to', list('open_to')],
  ['life_stages', 'Works with: life stage', list('life_stage')], ['health_statuses', 'Works with: health status', list('health_status')],
];

// Compare values ignoring blank-vs-null and list order.
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === '' || v === undefined) return null;
    if (Array.isArray(v)) return JSON.stringify([...v].sort());
    return JSON.stringify(v);
  };
  return norm(a) === norm(b);
}

export default function Updates({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const items = data.revisions;
  const [index, setIndex] = useState(0);
  useEffect(() => { if (index >= items.length) setIndex(Math.max(0, items.length - 1)); }, [items.length, index]);
  const r = items[index];

  if (!r) {
    return (
      <>
        <h1 className="text-4xl">Update requests</h1>
        <p className="mt-2 text-muted">Changes listing owners have proposed. The live listing is unchanged until you approve.</p>
        <div className="card mt-8 max-w-xl p-8">
          <p className="font-semibold">All caught up</p>
          <p className="mt-2 text-sm text-muted">No updates are waiting for review.</p>
        </div>
      </>
    );
  }
  return <Review key={r.id} r={r} index={index} total={items.length} setIndex={setIndex} data={data} vocab={vocab} reload={reload} />;
}

function Review({ r, index, total, setIndex, data, vocab, reload }: {
  r: Revision; index: number; total: number; setIndex: (i: number) => void;
  data: AdminData; vocab: Vocab; reload: () => Promise<void>;
}) {
  const isDataset = !!r.dataset_id;
  const live = (isDataset ? data.datasets.find((d) => d.id === r.dataset_id) : data.profiles.find((p) => p.id === r.profile_id)) as unknown as Record<string, unknown> | undefined;
  const fields = isDataset ? DATASET_FIELDS : PROFILE_FIELDS;
  const changed = live ? fields.filter(([key]) => !same(live[key], r.proposed[key])) : [];
  const opensUp = isDataset && live && moreOpen((r.proposed.access_levels as string[]) ?? [], (live.access_levels as string[]) ?? []);
  const repoChanged = changed.some(([k]) => k === 'repository_url' || k === 'publication_url' || k === 'profile_url');

  const checks = [
    'Request came from the listing owner’s sign-in',
    ...(opensUp ? ['Ethics reference provided for the more open access'] : []),
    ...(repoChanged ? ['New links open and match the listing'] : []),
  ];
  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  if (!live) return <p className="text-danger">This listing no longer exists.</p>;
  const title = isDataset ? String(live.title) : displayName(vocab, (live.honorific as string) ?? null, String(live.full_name));
  const owner = isDataset ? String(live.contact_name) : String(live.full_name);

  const act = async (fn: () => Promise<string | null>, needsNote = false) => {
    if (needsNote && !note.trim()) {
      setProblem('Write a note to the owner first. It is emailed to them.');
      document.getElementById('update-note')?.focus();
      return;
    }
    setBusy(true);
    setProblem('');
    const p = await fn();
    setBusy(false);
    if (p) setProblem(p);
    else await reload();
  };

  const accessLine = opensUp
    ? `Access changed from ${sortLevels(live.access_levels as string[]).map((l) => accessLevel(l).label).join(' and ')} to ${sortLevels(r.proposed.access_levels as string[]).map((l) => accessLevel(l).label).join(' and ')}`
    : null;

  return (
    <>
      <p className="text-sm text-muted">
        Update requests / {index + 1} of {total}
        {total > 1 && (
          <span className="ml-3 inline-flex gap-2">
            <button type="button" className="underline disabled:opacity-40" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button type="button" className="underline disabled:opacity-40" disabled={index === total - 1} onClick={() => setIndex(index + 1)}>Next</button>
          </span>
        )}
      </p>
      <h1 className="mt-1 text-4xl leading-tight">{title}</h1>
      <p className="mt-2 text-muted">
        Requested by the listing owner, {owner} ({r.submitted_email}), on {formatDate(r.submitted_at)}. The live listing is
        unchanged until you approve.
      </p>
      {r.status === 'question' && r.admin_note && (
        <p className="mt-3 rounded-lg bg-registered p-3 text-sm text-registered-ink">You asked: {r.admin_note}</p>
      )}

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="px-5 pt-5 pb-3 text-left font-semibold">What changed</caption>
          <thead className="bg-paper text-left text-xs text-muted">
            <tr><th scope="col" className="px-5 py-3 font-semibold">Field</th><th scope="col" className="px-5 py-3 font-semibold">Live now</th><th scope="col" className="px-5 py-3 font-semibold">Proposed</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {changed.length === 0 && <tr><td colSpan={3} className="px-5 py-4 text-muted">No fields changed.</td></tr>}
            {changed.map(([key, label, fmt]) => (
              <tr key={key}>
                <th scope="row" className="px-5 py-3.5 text-left font-semibold">{label}</th>
                <td className="px-5 py-3.5 align-top">{fmt(live[key], vocab)}</td>
                <td className="bg-open/40 px-5 py-3.5 align-top">{fmt(r.proposed[key], vocab)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-sans text-base font-semibold">Owner's note and evidence</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#33403a]">{r.owner_note ? `“${r.owner_note}”` : 'No note given.'}</p>
          {r.ethics_reference && <p className="mt-3 text-sm text-muted">Ethics: {r.ethics_reference}</p>}
          {opensUp && !r.ethics_reference && <p className="mt-3 text-sm font-semibold text-danger">No ethics reference given.</p>}
        </div>
        <fieldset className="card p-5">
          <legend className="sr-only">Checks before approving</legend>
          <p className="font-semibold" aria-hidden="true">Checks before approving</p>
          <div className="mt-3 space-y-3">
            {checks.map((c, i) => (
              <label key={c} className="choice text-sm">
                <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="mt-5 flex gap-2 rounded-lg bg-band p-4 text-sm text-[#4a5550]">
        <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></svg>
        <span>
          Approving updates the live listing{accessLine ? `, adds “${accessLine}” to its public history,` : ' and adds a line to its public history,'}
          {' '}and (once email is set up) emails the owner. The previous version is kept in the admin record.
        </span>
      </p>

      <div className="mt-5">
        <label htmlFor="update-note" className="field-label">Note to the owner (needed to ask a question or decline)</label>
        <textarea id="update-note" className="input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {problem && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{problem}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy || ticked.some((t) => !t)} onClick={() => act(() => approveRevision(r.id, note))}>Approve update</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => act(() => setRevisionStatus(r.id, 'question', note), true)}>Ask the owner a question</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => act(() => setRevisionStatus(r.id, 'declined', note), true)}>Decline with note</button>
      </div>
      {ticked.some((t) => !t) && <p className="mt-2 text-xs text-muted">Tick every check to enable approval.</p>}
    </>
  );
}
