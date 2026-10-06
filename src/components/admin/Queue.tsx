import { useEffect, useState, type ReactNode } from 'react';
import type { Vocab } from '../../lib/vocab';
import { labelFor } from '../../lib/vocab';
import { accessLevel, consentLabel, displayName, formatDate, formatNumber, sortLevels } from '../../lib/listings';
import type { AdminDataset, AdminProfile } from '../../lib/types';
import DatasetForm, { fromDataset } from '../forms/DatasetForm';
import ProfileForm, { fromProfile } from '../forms/ProfileForm';
import { saveListing, setStatus, type AdminData, type Kind } from './data';

// Pending datasets or pending profiles: pick one, check it, approve or reject.
export default function Queue({ kind, data, vocab, reload }: {
  kind: Kind;
  data: AdminData;
  vocab: Vocab;
  reload: () => Promise<void>;
}) {
  const items = (kind === 'dataset' ? data.datasets : data.profiles).filter((x) => x.status === 'pending');
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((x) => x.id === selectedId) ?? items[0];

  useEffect(() => {
    if (!items.some((x) => x.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  const noun = kind === 'dataset' ? 'datasets' : 'profiles';

  return (
    <>
      <h1 className="text-4xl">Pending {noun}</h1>
      <p className="mt-2 text-muted">Nothing appears in the public directory until an admin approves it.</p>

      {items.length === 0 ? (
        <div className="card mt-8 max-w-xl p-8">
          <p className="font-semibold">All caught up</p>
          <p className="mt-2 text-sm text-muted">There are no {noun} waiting for review.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[20rem_1fr] xl:items-start">
          <ul className="space-y-3" aria-label={`Pending ${noun}`}>
            {items.map((x) => {
              const on = x.id === selected?.id;
              const title = 'title' in x ? x.title : displayName(vocab, x.honorific, x.full_name);
              const where = 'lead_institution' in x ? x.lead_institution : x.institution;
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    aria-current={on || undefined}
                    onClick={() => setSelectedId(x.id)}
                    className={`w-full rounded-xl border bg-card p-4 text-left ${on ? 'border-green ring-1 ring-green' : 'border-line hover:border-green'}`}
                  >
                    <span className="block font-semibold leading-snug">{title}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {where} · {x.state} · Submitted {formatDate(x.submitted_at)}
                      {x.is_sample && ' · Sample'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <Review key={selected.id} kind={kind} item={selected} data={data} vocab={vocab} reload={reload} />
          )}
        </div>
      )}
    </>
  );
}

function Review({ kind, item, data, vocab, reload }: {
  kind: Kind;
  item: AdminDataset | AdminProfile;
  data: AdminData;
  vocab: Vocab;
  reload: () => Promise<void>;
}) {
  const email = (kind === 'dataset' ? data.datasetEmails : data.profileEmails)[item.id] ?? '';
  const checks = kind === 'dataset'
    ? [
        'Describes data only; no files or identifiable details',
        'Submitter is the custodian or has permission',
        `Consent flag checked: ${(item as AdminDataset).consent_secondary_use === 'yes' ? 'consent covers secondary use' : `${consentLabel((item as AdminDataset).consent_secondary_use).toLowerCase()} consented`}`,
      ]
    : [
        'Describes the person’s own work; nothing sensitive or inappropriate',
        'Looks like a genuine researcher, practitioner or student',
        'Links open and match the person',
      ];

  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false));
  const [note, setNote] = useState(item.review_note ?? '');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setProblem('');
    const p = await fn();
    setBusy(false);
    if (p) setProblem(p);
    else await reload();
  };

  const approve = () => act(() => setStatus(kind, item.id, 'approved', note));
  const reject = () => {
    if (!note.trim()) {
      setProblem('Write a note to the submitter explaining why, then choose Reject with note.');
      document.getElementById('review-note')?.focus();
      return;
    }
    act(() => setStatus(kind, item.id, 'rejected', note));
  };

  if (editing) {
    return (
      <div className="card p-6 sm:p-8">
        <h2 className="text-2xl">Edit before approving</h2>
        <p className="mt-1 mb-8 text-sm text-muted">Changes are saved to the pending listing. It still needs approving afterwards.</p>
        {kind === 'dataset' ? (
          <DatasetForm
            mode="admin"
            initial={fromDataset(item as AdminDataset, email)}
            onCancel={() => setEditing(false)}
            onSave={async (listing, newEmail) => {
              const p = await saveListing('dataset', item.id, listing, newEmail);
              if (!p) { await reload(); setEditing(false); }
              return p;
            }}
          />
        ) : (
          <ProfileForm
            mode="admin"
            initial={fromProfile(item as AdminProfile, email)}
            onCancel={() => setEditing(false)}
            onSave={async (listing, newEmail) => {
              const p = await saveListing('profile', item.id, listing, newEmail);
              if (!p) { await reload(); setEditing(false); }
              return p;
            }}
          />
        )}
      </div>
    );
  }

  return (
    <article className="card p-6 sm:p-7">
      {kind === 'dataset' ? <DatasetSummary d={item as AdminDataset} email={email} vocab={vocab} /> : <ProfileSummary p={item as AdminProfile} email={email} vocab={vocab} />}

      <fieldset className="mt-6 rounded-xl bg-band p-5">
        <legend className="sr-only">Review checklist</legend>
        <p className="font-semibold" aria-hidden="true">Review checklist</p>
        <div className="mt-3 space-y-3">
          {checks.map((c, i) => (
            <label key={c} className="choice text-sm">
              <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="review-note" className="field-label">Note to submitter (sent if you reject or request changes)</label>
        <textarea id="review-note" className="input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {problem && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{problem}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy || ticked.some((t) => !t)} onClick={approve}
          aria-describedby={ticked.some((t) => !t) ? 'approve-hint' : undefined}>
          Approve and publish
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={reject}>Reject with note</button>
      </div>
      {ticked.some((t) => !t) && <p id="approve-hint" className="mt-2 text-xs text-muted">Tick every item in the review checklist to enable approval.</p>}
    </article>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="mt-5 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[11rem_1fr]">{children}</dl>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (<><dt className="text-muted">{label}</dt><dd>{children}</dd></>);
}
function AdminsOnly() {
  return <span className="ml-2 inline-block rounded-full bg-collab px-2 py-0.5 text-xs whitespace-nowrap text-collab-ink">Admins only</span>;
}

function DatasetSummary({ d, email, vocab }: { d: AdminDataset; email: string; vocab: Vocab }) {
  const levels = sortLevels(d.access_levels);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {levels.map((l) => <span key={l} className={`badge ${accessLevel(l).badgeClass}`}>{accessLevel(l).badge}</span>)}
        {d.is_sample && <span className="badge bg-collab text-collab-ink">Sample listing</span>}
      </div>
      <h2 className="mt-3 text-3xl leading-tight">{d.title}</h2>
      <p className="mt-2 text-muted">
        {[d.lead_institution, d.state, labelFor(vocab, 'study_design', d.study_design), d.sample_size != null && `n = ${formatNumber(d.sample_size)}`, d.years_collected]
          .filter(Boolean).join(' · ')}
      </p>
      <p className="mt-4 leading-relaxed text-[#33403a]">{d.summary}</p>
      <Rows>
        <Row label="Contact (public)">{d.contact_name}, {d.contact_role}</Row>
        <Row label="Contact email">{email}<AdminsOnly /></Row>
        <Row label="Consent for reuse">{consentLabel(d.consent_secondary_use)}</Row>
        <Row label="Requirements">{d.access_requirements.map((r) => labelFor(vocab, 'access_requirement', r)).join(', ') || 'None listed'}</Row>
        {d.access_notes && <Row label="Access details">{d.access_notes}</Row>}
        <Row label="Data types">{d.data_types.map((t) => labelFor(vocab, 'data_type', t)).join(', ')}{d.data_types_other && ` (${d.data_types_other})`}</Row>
        <Row label="Biospecimens">{d.biospecimens ? `Yes${d.biospecimens_details ? `: ${d.biospecimens_details}` : ''}` : 'No'}</Row>
        <Row label="Life stage">{(d.life_stages ?? []).map((c) => labelFor(vocab, 'life_stage', c)).join(', ') || '—'}</Row>
        <Row label="Health status">{(d.health_statuses ?? []).map((c) => labelFor(vocab, 'health_status', c)).join(', ') || '—'}</Row>
        {d.population && <Row label="Population">{d.population}{d.age_range && `, ${d.age_range}`}</Row>}
        {d.keywords.length > 0 && <Row label="Keywords">{d.keywords.join(', ')}</Row>}
        {d.repository_url && <Row label="Repository"><a href={d.repository_url} target="_blank" rel="noopener noreferrer" className="break-all">{d.repository_url}</a></Row>}
        {d.publication_url && <Row label="Publication"><a href={d.publication_url} target="_blank" rel="noopener noreferrer" className="break-all">{d.publication_url}</a></Row>}
        {d.trial_registration && <Row label="Trial registration">{d.trial_registration}</Row>}
        <Row label="Submitted">{formatDate(d.submitted_at)}</Row>
      </Rows>
    </>
  );
}

function ProfileSummary({ p, email, vocab }: { p: AdminProfile; email: string; vocab: Vocab }) {
  return (
    <>
      {p.is_sample && <span className="badge bg-collab text-collab-ink">Sample listing</span>}
      <h2 className="mt-3 text-3xl leading-tight">{displayName(vocab, p.honorific, p.full_name)}</h2>
      <p className="mt-2 text-muted">{p.role} · {p.institution} · {p.state} · {labelFor(vocab, 'career_stage', p.career_stage)}</p>
      <p className="mt-4 leading-relaxed text-[#33403a]">{p.bio}</p>
      <Rows>
        <Row label="Discipline">{labelFor(vocab, 'discipline', p.discipline)}</Row>
        <Row label="Email">{email}<AdminsOnly /></Row>
        {p.skills.length > 0 && <Row label="Skills">{p.skills.join(', ')}</Row>}
        {p.looking_for.length > 0 && <Row label="Looking for">{p.looking_for.map((c) => labelFor(vocab, 'looking_for', c)).join(', ')}</Row>}
        {p.open_to.length > 0 && <Row label="Open to">{p.open_to.map((c) => labelFor(vocab, 'open_to', c)).join(', ')}</Row>}
        {[...(p.life_stages ?? []), ...(p.health_statuses ?? [])].length > 0 && (
          <Row label="Works with">{[...(p.life_stages ?? []).map((c) => labelFor(vocab, 'life_stage', c)), ...(p.health_statuses ?? []).map((c) => labelFor(vocab, 'health_status', c))].join(', ')}</Row>
        )}
        {p.orcid && <Row label="ORCID"><a href={`https://orcid.org/${p.orcid}`} target="_blank" rel="noopener noreferrer">{p.orcid}</a></Row>}
        {p.profile_url && <Row label="Profile link"><a href={p.profile_url} target="_blank" rel="noopener noreferrer" className="break-all">{p.profile_url}</a></Row>}
        <Row label="Submitted">{formatDate(p.submitted_at)}</Row>
      </Rows>
    </>
  );
}
