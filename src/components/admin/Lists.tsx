import { useState } from 'react';
import type { Vocab } from '../../lib/vocab';
import { accessBadge, displayName, formatDate } from '../../lib/listings';
import type { AdminDataset, AdminProfile, ListingStatus } from '../../lib/types';
import { withBase } from '../../lib/url';
import DatasetForm, { fromDataset } from '../forms/DatasetForm';
import ProfileForm, { fromProfile } from '../forms/ProfileForm';
import { markReviewed, saveListing, setRequestStatus, setStatus, type AdminData, type ContactRequest, type Kind } from './data';

interface Entry {
  kind: Kind;
  item: AdminDataset | AdminProfile;
  name: string;
  where: string;
  href: string;
}

function entries(data: AdminData, vocab: Vocab): Entry[] {
  return [
    ...data.datasets.map((d): Entry => ({
      kind: 'dataset', item: d, name: d.title, where: `${d.lead_institution} · ${d.state}`,
      href: withBase(`/data/dataset/?slug=${encodeURIComponent(d.slug)}`),
    })),
    ...data.profiles.map((p): Entry => ({
      kind: 'profile', item: p, name: displayName(vocab, p.honorific, p.full_name), where: `${p.institution} · ${p.state}`,
      href: withBase(`/skills/profile/?slug=${encodeURIComponent(p.slug)}`),
    })),
  ];
}

const STATUS_TEXT: Record<ListingStatus, string> = {
  pending: 'Pending',
  approved: 'Published',
  rejected: 'Rejected',
  unpublished: 'Unpublished',
  withdrawn: 'Withdrawn',
};
const STATUS_CLASS: Record<ListingStatus, string> = {
  pending: 'bg-controlled text-controlled-ink',
  approved: 'bg-open text-open-ink',
  rejected: 'bg-collab text-collab-ink',
  unpublished: 'bg-collab text-collab-ink',
  withdrawn: 'bg-collab text-collab-ink',
};

// ---------------------------------------------------------------------------
// Published listings (and unpublished / rejected ones, to bring them back)
// ---------------------------------------------------------------------------
export function Published({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const [show, setShow] = useState<'approved' | 'unpublished' | 'rejected' | 'withdrawn'>('approved');
  const [type, setType] = useState<'' | Kind>('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState('');

  const list = entries(data, vocab).filter((e) => e.item.status === show && (!type || e.kind === type));

  const change = async (e: Entry, status: ListingStatus) => {
    setProblem('');
    const p = await setStatus(e.kind, e.item.id, status);
    setConfirming(null);
    if (p) setProblem(p);
    else await reload();
  };

  if (editing) {
    const email = (editing.kind === 'dataset' ? data.datasetEmails : data.profileEmails)[editing.item.id] ?? '';
    const onSave = async (listing: Record<string, unknown>, newEmail: string) => {
      const p = await saveListing(editing.kind, editing.item.id, listing, newEmail);
      if (!p) { await reload(); setEditing(null); }
      return p;
    };
    return (
      <>
        <button type="button" className="text-sm text-green underline" onClick={() => setEditing(null)}>← Back to listings</button>
        <h1 className="mt-3 text-3xl">Edit: {editing.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {editing.item.status === 'approved' ? 'Changes go live as soon as you save.' : 'Changes are saved; the listing stays hidden.'}
        </p>
        <div className="card mt-6 p-6 sm:p-8">
          {editing.kind === 'dataset'
            ? <DatasetForm mode="admin" initial={fromDataset(editing.item as AdminDataset, email)} onSave={onSave} onCancel={() => setEditing(null)} />
            : <ProfileForm mode="admin" initial={fromProfile(editing.item as AdminProfile, email)} onSave={onSave} onCancel={() => setEditing(null)} />}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-4xl">Published listings</h1>
      <p className="mt-2 text-muted">Edit a listing, or take it down. Unpublished listings can be brought back.</p>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">Show
          <select className="input !mt-0 !min-h-9 w-auto !py-1" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="approved">Published</option>
            <option value="unpublished">Unpublished</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn by owner</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Type
          <select className="input !mt-0 !min-h-9 w-auto !py-1" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">Datasets and profiles</option>
            <option value="dataset">Datasets</option>
            <option value="profile">Profiles</option>
          </select>
        </label>
      </div>

      {problem && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{problem}</p>}

      {list.length === 0 ? (
        <p className="card mt-6 p-8 text-muted">Nothing to show.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-card">
          {list.map((e) => (
            <li key={e.item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider text-muted uppercase">{e.kind}</span>
                  <span className={`badge ${STATUS_CLASS[e.item.status]}`}>{STATUS_TEXT[e.item.status]}</span>
                  {e.kind === 'dataset' && <span className={`badge ${accessBadge((e.item as AdminDataset).access_levels).className}`}>{accessBadge((e.item as AdminDataset).access_levels).text}</span>}
                  {e.item.is_sample && <span className="badge bg-collab text-collab-ink">Sample</span>}
                </div>
                <p className="mt-1.5 font-semibold">{e.name}</p>
                <p className="text-sm text-muted">
                  {e.where} · Listed {formatDate(e.item.approved_at) || '—'} · Last reviewed {formatDate(e.item.last_reviewed_at) || '—'}
                </p>
                {e.item.review_note && <p className="mt-1 text-sm text-muted">Note: {e.item.review_note}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {e.item.status === 'approved' && <a href={e.href} target="_blank" rel="noopener noreferrer" className="btn-secondary !min-h-9 !py-1">View</a>}
                <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => setEditing(e)}>Edit</button>
                {e.item.status === 'approved' ? (
                  confirming === e.item.id ? (
                    <>
                      <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change(e, 'unpublished')}>Yes, unpublish</button>
                      <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => setConfirming(null)}>Keep it</button>
                    </>
                  ) : (
                    <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => setConfirming(e.item.id)}>Unpublish</button>
                  )
                ) : (
                  <button type="button" className="btn-primary !min-h-9 !py-1" onClick={() => change(e, 'approved')}>Publish</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact requests
// ---------------------------------------------------------------------------
const REQUEST_TEXT: Record<ContactRequest['status'], [string, string]> = {
  queued: ['Waiting to send', 'bg-controlled text-controlled-ink'],
  sent: ['Sent', 'bg-open text-open-ink'],
  failed: ['Failed', 'bg-controlled text-danger'],
  blocked: ['Blocked', 'bg-collab text-collab-ink'],
  skipped: ['Not sent: test address', 'bg-collab text-collab-ink'],
};

export function Requests({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const [problem, setProblem] = useState('');
  const all = entries(data, vocab);

  const change = async (id: string, status: ContactRequest['status']) => {
    setProblem('');
    const p = await setRequestStatus(id, status);
    if (p) setProblem(p);
    else await reload();
  };

  return (
    <>
      <h1 className="text-4xl">Contact requests</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Messages people have sent through the site. The email job passes each one on to the custodian or researcher, with
        replies going straight to the sender. Block anything that looks like spam before it is sent.
      </p>
      {problem && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{problem}</p>}
      {data.requests.length === 0 ? (
        <p className="card mt-6 p-8 text-muted">No messages yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {data.requests.map((r) => {
            const target = all.find((e) => e.item.id === (r.dataset_id ?? r.profile_id));
            const [text, cls] = REQUEST_TEXT[r.status];
            return (
              <li key={r.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted">
                    {formatDate(r.created_at)} · To: <strong className="text-ink">{target?.name ?? 'a listing that has been removed'}</strong>
                  </p>
                  <span className={`badge ${cls}`}>{text}</span>
                </div>
                <p className="mt-2 text-sm">
                  From <strong>{r.sender_name}</strong> &lt;{r.sender_email}&gt;{r.sender_institution && `, ${r.sender_institution}`}
                </p>
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-[#33403a]">{r.message}</p>
                {r.last_error && <p className="mt-2 text-xs text-danger">Last error: {r.last_error}</p>}
                <div className="mt-4 flex gap-2">
                  {r.status === 'queued' && <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change(r.id, 'blocked')}>Block</button>}
                  {(r.status === 'blocked' || r.status === 'failed') && <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => change(r.id, 'queued')}>{r.status === 'failed' ? 'Try again' : 'Unblock'}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Due for annual review: published listings not reviewed for 12 months
// ---------------------------------------------------------------------------
export function dueForReview(data: AdminData, vocab: Vocab): Entry[] {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return entries(data, vocab).filter(
    (e) => e.item.status === 'approved' && (!e.item.last_reviewed_at || new Date(e.item.last_reviewed_at) < cutoff),
  );
}

export function AnnualReview({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const [problem, setProblem] = useState('');
  const due = dueForReview(data, vocab);

  const reviewed = async (e: Entry) => {
    setProblem('');
    const p = await markReviewed(e.kind, e.item.id);
    if (p) setProblem(p);
    else await reload();
  };

  return (
    <>
      <h1 className="text-4xl">Due for annual review</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Published listings not reviewed in the last 12 months. The owner is emailed a reminder automatically and can
        confirm the listing themselves. If there's no reply after 30 days, check with them, then mark it as reviewed, edit
        it, or unpublish it from Published listings.
      </p>
      {problem && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{problem}</p>}
      {due.length === 0 ? (
        <p className="card mt-6 p-8 text-muted">Nothing is due. Every published listing has been reviewed in the last year.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-card">
          {due.map((e) => {
            const email = (e.kind === 'dataset' ? data.datasetEmails : data.profileEmails)[e.item.id];
            return (
              <li key={e.item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-sm text-muted">{e.where} · Last reviewed {formatDate(e.item.last_reviewed_at) || 'never'} · {email}</p>
                  <p className="text-sm text-muted">
                    {e.item.reminder_sent_at
                      ? `Reminder emailed ${formatDate(e.item.reminder_sent_at)}${Date.now() - new Date(e.item.reminder_sent_at).getTime() > 30 * 86400000 ? ' · no reply after 30 days' : ''}`
                      : 'Reminder not sent yet (goes out with the next daily run)'}
                  </p>
                </div>
                <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => reviewed(e)}>Mark as reviewed</button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
