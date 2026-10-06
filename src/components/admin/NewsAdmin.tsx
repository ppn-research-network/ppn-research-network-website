import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/listings';
import { kindInfo, whenText, type NewsItem } from '../../lib/news';
import { withBase } from '../../lib/url';
import type { AdminData } from './data';

export interface AdminNews extends Omit<NewsItem, 'posted_at'> {
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  submitted_name: string;
  submitted_email: string;
  review_note: string | null;
  created_at: string;
  approved_at: string | null;
}

async function setNewsStatus(id: string, status: AdminNews['status'], note?: string): Promise<string | null> {
  const { data, error } = await supabase.from('news_items')
    .update({ status, ...(note !== undefined ? { review_note: note.trim() || null } : {}) }).eq('id', id).select('id');
  if (error) return error.message;
  return data?.length ? null : 'The change was not saved. Check you are still signed in as an admin.';
}

export default function NewsAdmin({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [show, setShow] = useState<AdminNews['status']>('pending');
  const rows = data.news.filter((n) => n.status === show);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">News and events</h1>
          <p className="mt-2 max-w-3xl text-muted">Members’ posts wait here for review. Posts by admins go live straight away.</p>
        </div>
        <a href={withBase('/news/submit/')} className="btn-primary">Post news or an event</a>
      </div>
      <label className="mt-6 flex items-center gap-2 text-sm">Show
        <select className="input !mt-0 !min-h-9 w-auto !py-1" value={show} onChange={(e) => setShow(e.target.value as AdminNews['status'])}>
          <option value="pending">Waiting for review</option>
          <option value="approved">Published</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
        </select>
      </label>
      {rows.length === 0 ? <p className="card mt-6 p-8 text-muted">Nothing to show.</p> : (
        <ul className="mt-6 space-y-4">{rows.map((n) => <NewsCardAdmin key={n.id} n={n} reload={reload} />)}</ul>
      )}
    </>
  );
}

function NewsCardAdmin({ n, reload }: { n: AdminNews; reload: () => Promise<void> }) {
  const checks = [
    'The link works and matches the post',
    'Relevant to the network and appropriate to share',
    ...(n.kind === 'recruitment' ? ['Ethics approval details given; people apply through the study’s own page'] : []),
  ];
  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const k = kindInfo(n.kind);

  const change = async (status: AdminNews['status'], needsNote = false) => {
    if (needsNote && !note.trim()) return setProblem('Write a short note to the person who posted it first.');
    setProblem('');
    const p = await setNewsStatus(n.id, status, needsNote ? note : undefined);
    if (p) setProblem(p);
    else await reload();
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${k.badgeClass}`}>{k.label}</span>
        <span className="badge bg-paper text-muted ring-1 ring-line">{n.scope === 'international' ? 'International' : 'National'}</span>
        {n.members_only && <span className="badge bg-controlled text-controlled-ink">Members only</span>}
      </div>
      <p className="mt-2 text-lg font-semibold">{n.title}</p>
      <p className="text-sm text-green">{whenText({ ...n, posted_at: n.approved_at ?? n.created_at })}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#33403a]">{n.summary}</p>
      <p className="mt-2 text-sm"><a href={n.url} target="_blank" rel="noopener noreferrer" className="break-all">{n.url}</a></p>
      {[n.organisation, n.is_online ? 'Online' : null, n.location].filter(Boolean).length > 0 && (
        <p className="text-sm text-muted">{[n.organisation, n.is_online ? 'Online' : null, n.location].filter(Boolean).join(' · ')}</p>
      )}
      {n.kind === 'recruitment' && <p className="mt-1 text-sm">Ethics: {n.ethics_committee}, {n.ethics_reference}</p>}
      <p className="mt-2 text-xs text-muted">Posted by {n.submitted_name} ({n.submitted_email}) on {formatDate(n.created_at)}</p>
      {n.review_note && <p className="mt-1 text-xs text-muted">Note: {n.review_note}</p>}

      {n.status === 'pending' && (
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
          <label htmlFor={`nnote-${n.id}`} className="field-label mt-4">Note (needed to reject)</label>
          <textarea id={`nnote-${n.id}`} className="input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-9 !py-1" disabled={ticked.some((t) => !t)} onClick={() => change('approved')}>Approve and publish</button>
            <button type="button" className="btn-danger !min-h-9 !py-1" onClick={() => change('rejected', true)}>Reject with note</button>
          </div>
        </>
      )}
      {n.status === 'approved' && <button type="button" className="btn-danger mt-3 !min-h-9 !py-1" onClick={() => change('removed')}>Remove</button>}
      {(n.status === 'rejected' || n.status === 'removed') && <button type="button" className="btn-secondary mt-3 !min-h-9 !py-1" onClick={() => change('approved')}>Publish after all</button>}
      {problem && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
    </li>
  );
}
