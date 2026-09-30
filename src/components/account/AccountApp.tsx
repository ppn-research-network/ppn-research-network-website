import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadMembership, signOut, useSession, type Membership } from '../../lib/session';
import { accessBadge, formatDate } from '../../lib/listings';
import type { AdminDataset, AdminProfile } from '../../lib/types';
import { withBase } from '../../lib/url';
import { useVocab, labelFor, type Vocab } from '../../lib/vocab';
import { displayName } from '../../lib/listings';
import { CONTACT_EMAIL } from '../../../site.config.mjs';
import DatasetForm, { fromDataset } from '../forms/DatasetForm';
import ProfileForm, { fromProfile } from '../forms/ProfileForm';
import SignInCard from './SignInCard';
import MembershipForm from './MembershipForm';
import { friendlyError } from '../forms/Fields';

interface MyListing {
  kind: 'dataset' | 'profile';
  id: string;
  slug: string;
  status: 'pending' | 'approved' | 'unpublished';
  listing: Record<string, unknown>;
  revision_status: 'pending' | 'question' | null;
  revision_at: string | null;
  revision: Record<string, unknown> | null;
  revision_note: string | null;
  admin_note: string | null;
  review_due: boolean;
}

interface MyResource {
  id: string;
  title: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  review_note: string | null;
  created_at: string;
}

type Section = 'listings' | 'resources' | 'membership';

export default function AccountApp() {
  const { session, ready, email } = useSession();
  const [section, setSection] = useState<Section>(() => (new URLSearchParams(window.location.search).get('section') as Section) || 'listings');

  if (!ready) return <p className="py-16 text-muted" role="status">Checking your sign-in…</p>;

  if (!session) {
    return (
      <div className="py-4">
        <h1 className="text-4xl sm:text-5xl">My account</h1>
        <p className="mt-4 max-w-2xl text-lg text-[#33403a]">
          Sign in to update or withdraw your listings, and to see member resources.
        </p>
        <div className="mt-8 max-w-md"><SignInCard returnTo="/account/" /></div>
      </div>
    );
  }

  const go = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, '', `${window.location.pathname}?section=${s}`);
  };

  const items: { key: Section; label: string }[] = [
    { key: 'listings', label: 'My listings' },
    { key: 'resources', label: 'Resources I’ve shared' },
    { key: 'membership', label: 'Membership' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="My account">
        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          {items.map((i) => (
            <li key={i.key} className="shrink-0">
              <button
                type="button"
                aria-current={section === i.key ? 'page' : undefined}
                onClick={() => go(i.key)}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm whitespace-nowrap ${section === i.key ? 'bg-tag font-semibold text-green' : 'text-ink hover:bg-band'}`}
              >
                {i.label}
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <button type="button" onClick={signOut} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-muted hover:bg-band">Sign out</button>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">
        {section === 'listings' && <MyListings email={email} />}
        {section === 'resources' && <MyResources />}
        {section === 'membership' && <MyMembership email={email} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MyListings({ email }: { email: string }) {
  const { vocab } = useVocab();
  const [rows, setRows] = useState<MyListing[] | null>(null);
  const [editing, setEditing] = useState<MyListing | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_listings');
    setRows((data as MyListing[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!rows || !vocab) return <p className="text-muted" role="status">Loading your listings…</p>;

  if (editing) {
    return (
      <EditListing
        item={editing}
        email={email}
        vocab={vocab}
        onDone={async (msg) => { setEditing(null); setMessage(msg); await load(); window.scrollTo(0, 0); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <h1 className="text-4xl">My listings</h1>
      <p className="mt-2 text-muted">
        Listings linked to {email}. Changes go to an admin for a quick check; your current listing stays live in the meantime.
      </p>
      {message && <p role="status" className="mt-5 rounded-lg bg-open p-4 text-sm font-semibold text-open-ink">{message}</p>}

      {rows.length === 0 ? (
        <div className="card mt-6 p-6">
          <p className="font-semibold">No listings are linked to this email</p>
          <p className="mt-2 text-sm text-muted">
            Listings are linked by the email given when they were submitted. If you used a different address, sign in with
            that one, or email {CONTACT_EMAIL}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={withBase('/submit/')} className="btn-secondary">Submit a dataset</a>
            <a href={withBase('/submit/profile/')} className="btn-secondary">Join the skills directory</a>
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((r) => <ListingCard key={r.id} r={r} vocab={vocab} onEdit={() => setEditing(r)} onChanged={load} />)}
        </ul>
      )}
    </>
  );
}

function titleOf(r: MyListing, vocab: Vocab) {
  return r.kind === 'dataset'
    ? String(r.listing.title)
    : displayName(vocab, (r.listing.honorific as string) ?? null, String(r.listing.full_name));
}

function ListingCard({ r, vocab, onEdit, onChanged }: { r: MyListing; vocab: Vocab; onEdit: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const live = r.status === 'approved';
  const href = withBase(r.kind === 'dataset' ? `/data/dataset/?slug=${r.slug}` : `/skills/profile/?slug=${r.slug}`);
  const liveAccess = r.kind === 'dataset' ? accessBadge(r.listing.access_levels as string[]).text : '';

  const confirmCurrent = async () => {
    setBusy(true);
    await supabase.rpc('confirm_listing_current', { p_kind: r.kind, p_id: r.id });
    setBusy(false);
    await onChanged();
  };

  const cancel = async () => {
    setBusy(true);
    await supabase.rpc('cancel_revision', { p_kind: r.kind, p_id: r.id });
    setBusy(false);
    await onChanged();
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">{r.kind === 'dataset' ? 'Dataset' : 'Skills profile'}</p>
          <h2 className="mt-1 text-2xl leading-snug">{live ? <a href={href} className="text-ink">{titleOf(r, vocab)}</a> : titleOf(r, vocab)}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {live && <span className="badge bg-open text-open-ink">Live</span>}
          {r.status === 'pending' && <span className="badge bg-controlled text-controlled-ink">Waiting for approval</span>}
          {r.status === 'unpublished' && <span className="badge bg-collab text-collab-ink">Unpublished</span>}
          {r.revision_status === 'pending' && <span className="badge bg-controlled text-controlled-ink">Update in review</span>}
          {r.revision_status === 'question' && <span className="badge bg-registered text-registered-ink">Admin has a question</span>}
          {!r.revision_status && <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={onEdit}>Edit</button>}
        </div>
      </div>
      {r.revision_status && (
        <div className="mt-3 space-y-2 text-sm text-muted">
          <p>
            Update submitted {formatDate(r.revision_at)}.
            {live && ` Visitors still see the current version${liveAccess ? ` (${liveAccess})` : ''} until an admin approves it.`}
          </p>
          {r.revision_status === 'question' && r.admin_note && (
            <p className="rounded-lg bg-registered p-3 text-registered-ink"><strong>The admin asks:</strong> {r.admin_note}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={onEdit}>
              {r.revision_status === 'question' ? 'Reply by editing the update' : 'Change the update'}
            </button>
            <button type="button" className="btn-secondary !min-h-9 !py-1" disabled={busy} onClick={cancel}>Cancel the update</button>
          </div>
        </div>
      )}
      {r.status === 'pending' && <p className="mt-3 text-sm text-muted">An admin is reviewing this listing. You can still correct it.</p>}
      {r.review_due && !r.revision_status && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-band p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Once a year we ask you to check this listing is still accurate. Is it?</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-9 !py-1" disabled={busy} onClick={confirmCurrent}>Yes, it’s still current</button>
            <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={onEdit}>Update it</button>
          </div>
        </div>
      )}
    </li>
  );
}

function EditListing({ item, email, vocab, onDone, onCancel }: {
  item: MyListing;
  email: string;
  vocab: Vocab;
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [problem, setProblem] = useState('');
  // Start from the proposed update if there is one, otherwise the live listing.
  const values = { ...item.listing, ...(item.revision ?? {}) };
  const live = item.status === 'approved';
  const label = live ? 'Submit update for review' : 'Save changes';

  const save = async (listing: Record<string, unknown>, _email: string, extra: { ethics: string; note: string }) => {
    const { data, error } = await supabase.rpc('submit_revision', {
      p_kind: item.kind, p_id: item.id, p_proposed: listing, p_ethics: extra.ethics, p_note: extra.note,
    });
    if (error) return friendlyError(error).replace('your listing was not sent', 'your update was not sent');
    await onDone(data === 'updated'
      ? 'Your changes are saved. An admin will review the listing before it goes live.'
      : 'Update sent. An admin will check it; your current listing stays live until then.');
    return null;
  };

  const withdraw = async () => {
    const { error } = await supabase.rpc('withdraw_listing', { p_kind: item.kind, p_id: item.id });
    if (error) return setProblem(friendlyError(error).replace('your listing was not sent', 'the listing was not withdrawn'));
    await onDone('Your listing has been withdrawn and is no longer shown on the site.');
  };

  return (
    <div className="card border-green p-6 sm:p-8">
      <button type="button" className="text-sm text-green underline" onClick={onCancel}>← Back to my listings</button>
      <h1 className="mt-3 text-3xl leading-snug">Update: {titleOf(item, vocab)}</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Every field from the original form can be edited.
        {live && ' Your current listing stays live until an admin approves the change.'}
      </p>
      {item.kind === 'dataset' ? (
        <DatasetForm
          mode="owner"
          initial={fromDataset(values as unknown as AdminDataset, email)}
          liveLevels={item.listing.access_levels as string[]}
          submitLabel={label}
          onSave={save}
          onCancel={onCancel}
        />
      ) : (
        <ProfileForm
          mode="owner"
          initial={fromProfile(values as unknown as AdminProfile, email)}
          submitLabel={label}
          onSave={save}
          onCancel={onCancel}
        />
      )}

      <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          No longer able to share this {item.kind === 'dataset' ? 'dataset' : 'profile'}? Withdrawing takes the listing down
          straight away; no review needed.
        </p>
        {confirmWithdraw ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn-danger" onClick={withdraw}>Yes, withdraw it</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmWithdraw(false)}>Keep it</button>
          </div>
        ) : (
          <button type="button" className="btn-danger shrink-0" onClick={() => setConfirmWithdraw(true)}>Withdraw listing</button>
        )}
      </div>
      {problem && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{problem}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MyResources() {
  const { vocab } = useVocab();
  const [rows, setRows] = useState<MyResource[] | null>(null);
  const { session } = useSession();

  useEffect(() => {
    if (!session) return;
    supabase.from('resources').select('id, title, category, status, review_note, created_at')
      .eq('shared_by', session.user.id).order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as MyResource[]) ?? []));
  }, [session]);

  const STATUS: Record<MyResource['status'], [string, string]> = {
    pending: ['Waiting for review', 'bg-controlled text-controlled-ink'],
    approved: ['Shared with members', 'bg-open text-open-ink'],
    rejected: ['Not approved', 'bg-collab text-collab-ink'],
    removed: ['Removed', 'bg-collab text-collab-ink'],
  };

  return (
    <>
      <h1 className="text-4xl">Resources I’ve shared</h1>
      <p className="mt-2 text-muted">Each resource is checked by an admin before other members see it.</p>
      {!rows || !vocab ? (
        <p className="mt-6 text-muted" role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card mt-6 p-6">
          <p className="text-sm text-muted">You haven't shared anything yet.</p>
          <a href={withBase('/resources/?share=1')} className="btn-secondary mt-4">Share a resource</a>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{r.title}</p>
                <p className="text-sm text-muted">{labelFor(vocab, 'resource_category', r.category)} · Shared {formatDate(r.created_at)}</p>
                {r.review_note && r.status !== 'approved' && <p className="mt-1 text-sm text-muted">Note from the admin: {r.review_note}</p>}
              </div>
              <span className={`badge shrink-0 ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MyMembership({ email }: { email: string }) {
  const [membership, setMembership] = useState<Membership | undefined>(undefined);
  useEffect(() => { loadMembership().then(setMembership); }, []);

  return (
    <>
      <h1 className="text-4xl">Membership</h1>
      {membership === undefined && <p className="mt-6 text-muted" role="status">Loading…</p>}
      {membership?.status === 'approved' && (
        <div className="card mt-6 p-6">
          <span className="badge bg-open text-open-ink">Member</span>
          <p className="mt-3">You're a member of the network. You can see and share resources.</p>
          <a href={withBase('/resources/')} className="btn-primary mt-4">Go to resources</a>
        </div>
      )}
      {membership?.status === 'pending' && (
        <div className="card mt-6 p-6">
          <span className="badge bg-controlled text-controlled-ink">Request under review</span>
          <p className="mt-3">Thanks for asking to join. An admin will review your request and email you at {email}.</p>
        </div>
      )}
      {(membership?.status === 'declined' || membership?.status === 'revoked') && (
        <div className="card mt-6 p-6">
          <p>Your membership isn't active. If you think this is a mistake, email {CONTACT_EMAIL}.</p>
        </div>
      )}
      {membership === null && (
        <div className="mt-6 max-w-2xl">
          <p className="mb-6 text-muted">You're not a member yet. Members can see recordings, templates and protocols shared across the network.</p>
          <MembershipForm lockedEmail={email} />
        </div>
      )}
    </>
  );
}
