import { useEffect, useState } from 'react';
import { makeThumbnail } from '../../lib/images';
import { supabase } from '../../lib/supabase';
import { labelFor, type Vocab } from '../../lib/vocab';
import { formatDate } from '../../lib/listings';
import { setMemberStatus, setResourceStatus, type AdminData, type AdminResource, type Member } from './data';

// ---------------------------------------------------------------------------
// Membership requests
// ---------------------------------------------------------------------------
const MEMBER_STATUS: Record<Member['status'], [string, string]> = {
  pending: ['Waiting for review', 'bg-controlled text-controlled-ink'],
  approved: ['Member', 'bg-open text-open-ink'],
  declined: ['Declined', 'bg-collab text-collab-ink'],
  revoked: ['Membership ended', 'bg-collab text-collab-ink'],
};

export function Memberships({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const [show, setShow] = useState<Member['status']>('pending');
  const rows = data.members.filter((m) => m.status === show);

  return (
    <>
      <h1 className="text-4xl">Membership requests</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Members can see and share resources. They become members when they sign in with the email on an approved request.
      </p>
      <label className="mt-6 flex items-center gap-2 text-sm">Show
        <select className="input !mt-0 !min-h-9 w-auto !py-1" value={show} onChange={(e) => setShow(e.target.value as Member['status'])}>
          <option value="pending">Waiting for review ({data.members.filter((m) => m.status === 'pending').length})</option>
          <option value="approved">Members ({data.members.filter((m) => m.status === 'approved').length})</option>
          <option value="declined">Declined</option>
          <option value="revoked">Membership ended</option>
        </select>
      </label>
      {rows.length === 0 ? (
        <p className="card mt-6 p-8 text-muted">Nothing to show.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((m) => <MemberCard key={m.id} m={m} vocab={vocab} reload={reload} />)}
        </ul>
      )}
    </>
  );
}

function MemberCard({ m, vocab, reload }: { m: Member; vocab: Vocab; reload: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const change = async (status: Member['status'], needsNote = false) => {
    if (needsNote && !note.trim()) return setProblem('Write a short note to the person first.');
    setProblem('');
    const p = await setMemberStatus(m.id, status, needsNote ? note : undefined);
    if (p) setProblem(p);
    else await reload();
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{m.full_name}</p>
          <p className="text-sm text-muted">
            {labelFor(vocab, 'member_role', m.role)} · {m.institution} · {m.country}
          </p>
          <p className="text-sm">{m.email} <span className="ml-1 rounded-full bg-collab px-2 py-0.5 text-xs whitespace-nowrap text-collab-ink">Admins only</span></p>
        </div>
        <span className={`badge ${MEMBER_STATUS[m.status][1]}`}>{MEMBER_STATUS[m.status][0]}</span>
      </div>
      {m.reason && <p className="mt-3 text-sm leading-relaxed text-[#33403a]">“{m.reason}”</p>}
      <p className="mt-2 text-xs text-muted">Requested {formatDate(m.requested_at)}{m.reviewed_at && ` · Reviewed ${formatDate(m.reviewed_at)}`}</p>
      {m.review_note && <p className="mt-1 text-xs text-muted">Note: {m.review_note}</p>}

      {m.status === 'pending' && (
        <>
          <label htmlFor={`note-${m.id}`} className="field-label mt-4">Note (needed to decline)</label>
          <textarea id={`note-${m.id}`} className="input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-9 !py-1" onClick={() => change('approved')}>Approve membership</button>
            <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change('declined', true)}>Decline with note</button>
          </div>
        </>
      )}
      {m.status === 'approved' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {confirmEnd ? (
            <>
              <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change('revoked')}>Yes, end membership</button>
              <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => setConfirmEnd(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={() => setConfirmEnd(true)}>End membership</button>
          )}
        </div>
      )}
      {(m.status === 'declined' || m.status === 'revoked') && (
        <button type="button" className="btn-secondary mt-3 !min-h-9 !py-1" onClick={() => change('approved')}>Approve after all</button>
      )}
      {problem && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Resources waiting for review (and published ones, to remove)
// ---------------------------------------------------------------------------
export function PendingResources({ data, vocab, reload }: { data: AdminData; vocab: Vocab; reload: () => Promise<void> }) {
  const [show, setShow] = useState<AdminResource['status']>('pending');
  const rows = data.resources.filter((r) => r.status === show);
  return (
    <>
      <h1 className="text-4xl">Pending resources</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Check each resource is appropriate to share: blank templates only, nothing that identifies a participant, and
        credited to its authors.
      </p>
      <label className="mt-6 flex items-center gap-2 text-sm">Show
        <select className="input !mt-0 !min-h-9 w-auto !py-1" value={show} onChange={(e) => setShow(e.target.value as AdminResource['status'])}>
          <option value="pending">Waiting for review</option>
          <option value="approved">Shared with members</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
        </select>
      </label>
      {rows.length === 0 ? (
        <p className="card mt-6 p-8 text-muted">Nothing to show.</p>
      ) : (
        <ul className="mt-6 space-y-4">{rows.map((r) => <ResourceCard key={r.id} r={r} vocab={vocab} reload={reload} />)}</ul>
      )}
    </>
  );
}

function ResourceCard({ r, vocab, reload }: { r: AdminResource; vocab: Vocab; reload: () => Promise<void> }) {
  const checks = r.kind === 'file'
    ? ['Opened the file: it is a blank template or general document', 'Nothing identifies a participant', 'Appropriate to share within the network']
    : ['Opened the link and it works', 'Nothing identifies a participant', 'Appropriate to share within the network'];
  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const change = async (status: AdminResource['status'], needsNote = false) => {
    if (needsNote && !note.trim()) return setProblem('Write a short note to the person who shared it first.');
    setProblem('');
    const p = await setResourceStatus(r.id, status, needsNote ? note : undefined);
    if (p) setProblem(p);
    else await reload();
  };

  const openFile = async () => {
    const { data, error } = await supabase.storage.from('resources').createSignedUrl(r.file_path!, 60);
    if (error || !data) return setProblem('The file could not be opened.');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{r.title}</p>
          <p className="text-sm text-muted">
            {labelFor(vocab, 'resource_category', r.category)} · {r.kind === 'file' ? `${r.file_type?.toUpperCase()} file${r.file_size ? `, ${Math.ceil(r.file_size / 1024)} KB` : ''}` : 'Link'}
            {' '}· Shared by {r.shared_by_name} ({r.shared_by_email}) on {formatDate(r.created_at)}
          </p>
        </div>
        {r.kind === 'file'
          ? <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={openFile}>Open file</button>
          : <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer" className="btn-secondary !min-h-9 !py-1">Open link</a>}
      </div>
      {r.description && <p className="mt-3 text-sm text-[#33403a]">{r.description}</p>}
      {r.licence && <p className="mt-1 text-sm text-[#33403a]"><span className="font-semibold">Licence or conditions:</span> {r.licence}</p>}
      {r.category === 'recording' && <ThumbnailEditor r={r} reload={reload} />}
      {(r.presenter || r.duration || r.event_date) && (
        <p className="mt-1 text-sm text-muted">{[r.presenter, r.duration, r.event_date && formatDate(r.event_date)].filter(Boolean).join(' · ')}</p>
      )}
      {r.review_note && <p className="mt-1 text-xs text-muted">Note: {r.review_note}</p>}

      {r.status === 'pending' && (
        <>
          <fieldset className="mt-4 rounded-xl bg-band p-4">
            <legend className="sr-only">Review checklist</legend>
            <div className="space-y-2.5">
              {checks.map((c, i) => (
                <label key={c} className="choice text-sm">
                  <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor={`rnote-${r.id}`} className="field-label mt-4">Note (needed to reject)</label>
          <textarea id={`rnote-${r.id}`} className="input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-9 !py-1" disabled={ticked.some((t) => !t)} onClick={() => change('approved')}>Approve and share</button>
            <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change('rejected', true)}>Reject with note</button>
          </div>
        </>
      )}
      {r.status === 'approved' && <button type="button" className="btn-danger mt-3 !min-h-9 !py-1" onClick={() => change('removed')}>Remove from resources</button>}
      {(r.status === 'rejected' || r.status === 'removed') && <button type="button" className="btn-secondary mt-3 !min-h-9 !py-1" onClick={() => change('approved')}>Share after all</button>}
      {problem && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
    </li>
  );
}

// Recordings: show the thumbnail and let an admin add or replace it (e.g. for
// Zoom or Vimeo recordings; YouTube ones are fetched automatically).
function ThumbnailEditor({ r, reload }: { r: AdminResource; reload: () => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const isYouTube = /(?:youtube\.com|youtu\.be)\//i.test(r.url ?? '');

  useEffect(() => {
    setUrl(null);
    if (!r.thumbnail_path) return;
    supabase.storage.from('resources').createSignedUrl(r.thumbnail_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [r.thumbnail_path]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem('');
    try {
      const blob = await makeThumbnail(file);
      const path = `thumbnails/${r.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from('resources').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { data, error } = await supabase.from('resources').update({ thumbnail_path: path }).eq('id', r.id).select('id');
      if (error || !data?.length) throw error ?? new Error('not saved');
      if (r.thumbnail_path) await supabase.storage.from('resources').remove([r.thumbnail_path]);
      await reload();
    } catch (err) {
      setProblem(err instanceof Error && err.message.startsWith('Choose') ? err.message : 'The image could not be saved. Try a different JPG or PNG.');
    }
    setBusy(false);
  };

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-band p-4 sm:flex-row sm:items-center">
      <div className="aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-green">
        {url && <img src={url} alt="Current thumbnail" className="h-full w-full object-cover" />}
      </div>
      <div className="text-sm">
        <p className="font-semibold">Thumbnail</p>
        <p className="text-muted">
          {r.thumbnail_path ? 'Shown on the recording’s card.' : isYouTube ? 'None yet: the YouTube thumbnail is added automatically within an hour of approval.' : 'None: the card shows a coloured panel.'}
        </p>
        <label className="btn-secondary mt-2 !min-h-9 cursor-pointer !py-1">
          {busy ? 'Saving…' : r.thumbnail_path ? 'Replace image' : 'Add image'}
          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {problem && <p role="alert" className="mt-1 font-semibold text-danger">{problem}</p>}
      </div>
    </div>
  );
}
