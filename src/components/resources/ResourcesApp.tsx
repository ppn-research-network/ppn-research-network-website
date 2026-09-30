import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { loadMembership, useSession, type Membership } from '../../lib/session';
import { activeTerms, labelFor, useVocab, type Vocab } from '../../lib/vocab';
import { formatDate } from '../../lib/listings';
import { withBase } from '../../lib/url';
import { CONTACT_EMAIL, REVIEW_TIME } from '../../../site.config.mjs';
import { matchesSearch } from '../directory/common';
import {
  ErrorSummary, SelectField, TextArea, TextField, friendlyError, lengthError, urlError, type Errors,
} from '../forms/Fields';
import SignInCard from '../account/SignInCard';
import MembershipForm from '../account/MembershipForm';

interface Resource {
  id: string;
  title: string;
  category: string;
  kind: 'link' | 'file';
  url: string | null;
  file_path: string | null;
  file_type: 'pdf' | 'docx' | 'xlsx' | null;
  description: string | null;
  licence: string | null;
  presenter: string | null;
  event_date: string | null;
  duration: string | null;
  shared_by_name: string;
  created_at: string;
  updated_at: string;
}

// Nothing here is in the website files: resources load from the database only
// after an approved member signs in.
export default function ResourcesApp() {
  const { session, ready, email } = useSession();
  const [membership, setMembership] = useState<Membership | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    if (!session) setMembership(null);
    else loadMembership().then(setMembership);
  }, [ready, session]);

  if (!ready || membership === undefined) return <p className="min-h-[90vh] text-muted" role="status">Checking your membership…</p>;
  if (!session) return <Gate />;
  if (membership?.status === 'approved') return <Library />;
  return <NotYet email={email} membership={membership} />;
}

function Lock({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

function MembersOnlyBadge() {
  return <span className="badge bg-controlled text-controlled-ink"><Lock /> Members only</span>;
}

// Signed out: the mockup's "Resources are for network members" page.
function Gate() {
  return (
    <>
      <MembersOnlyBadge />
      <h1 className="mt-3 text-4xl sm:text-5xl">Resources are for network members</h1>
      <p className="mt-4 max-w-3xl text-lg text-[#33403a]">
        Members can watch workshop and webinar recordings and download templates and protocols shared by other members.
        The data and skills directories stay open to everyone.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <SignInCard returnTo="/resources/" />
        <MembershipForm />
      </div>
    </>
  );
}

function NotYet({ email, membership }: { email: string; membership: Membership }) {
  return (
    <>
      <MembersOnlyBadge />
      <h1 className="mt-3 text-4xl sm:text-5xl">Resources are for network members</h1>
      {membership?.status === 'pending' ? (
        <div className="card mt-8 max-w-2xl p-7">
          <p className="font-semibold">Your membership request is being reviewed</p>
          <p className="mt-2 text-muted">An admin will review it within {REVIEW_TIME}. Once approved, the resources will appear here.</p>
        </div>
      ) : membership ? (
        <div className="card mt-8 max-w-2xl p-7">
          <p>Your membership isn't active. If you think this is a mistake, email {CONTACT_EMAIL}.</p>
        </div>
      ) : (
        <div className="mt-8 max-w-2xl">
          <p className="mb-6 text-lg text-[#33403a]">You're signed in as {email}, but you're not a member yet. Request membership below.</p>
          <MembershipForm lockedEmail={email} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The library, for members
// ---------------------------------------------------------------------------

const DOCUMENT_GROUP = ['consent', 'agreements'];
const TINTS = ['bg-green', 'bg-[#7a3b12]', 'bg-[#1f3d6b]'];

function Library() {
  const { vocab } = useVocab();
  const [rows, setRows] = useState<Resource[] | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sharing, setSharing] = useState(() => new URLSearchParams(window.location.search).get('share') === '1');
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    supabase.from('resources').select('*').eq('status', 'approved').order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as Resource[]) ?? []));
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (!category || r.category === category)
    && matchesSearch(q, [r.title, r.description, r.presenter, r.shared_by_name, vocab ? labelFor(vocab, 'resource_category', r.category) : ''])), [rows, q, category, vocab]);

  if (!vocab || !rows) return <p className="min-h-[90vh] text-muted" role="status">Loading resources…</p>;

  if (sharing) {
    return <ShareForm vocab={vocab} onCancel={() => setSharing(false)} onDone={() => { setSharing(false); setThanks(true); window.scrollTo(0, 0); }} />;
  }

  const categories = activeTerms(vocab, 'resource_category');
  const recordings = shown.filter((r) => r.category === 'recording');
  const documents = shown.filter((r) => DOCUMENT_GROUP.includes(r.category));
  const others = categories.filter((c) => c.code !== 'recording' && !DOCUMENT_GROUP.includes(c.code));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <MembersOnlyBadge />
          <h1 className="mt-3 text-4xl sm:text-5xl">Resources</h1>
          <p className="mt-4 max-w-2xl text-lg text-[#33403a]">
            Recordings, templates and protocols shared by network members. Please keep them within the network.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setSharing(true)}>Share a resource</button>
      </div>

      {thanks && (
        <p role="status" className="mt-6 rounded-lg bg-open p-4 text-sm font-semibold text-open-ink">
          Thanks for sharing. An admin will check it before other members can see it.
        </p>
      )}

      <form role="search" className="mt-8 flex items-center gap-2 rounded-xl border border-line bg-card p-1.5 pl-4 shadow-sm" onSubmit={(e) => e.preventDefault()}>
        <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search resources</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recordings, templates and protocols"
            className="min-h-10 w-full bg-transparent outline-none placeholder:text-muted" />
        </label>
      </form>

      <nav aria-label="Resource type" className="mt-5">
        <ul className="flex flex-wrap gap-2">
          {[{ code: '', label: 'All' }, ...categories].map((c) => (
            <li key={c.code || 'all'}>
              <button type="button" aria-pressed={category === c.code} onClick={() => setCategory(c.code)}
                className={`min-h-10 rounded-full border px-4 text-sm ${category === c.code ? 'border-green bg-green font-semibold text-white' : 'border-line bg-card hover:border-green'}`}>
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 && (
        <div className="card mt-8 p-8 text-center">
          <p className="font-semibold">{rows.length === 0 ? 'No resources have been shared yet' : 'Nothing matches your search'}</p>
          <p className="mt-2 text-sm text-muted">{rows.length === 0 ? 'Be the first: share a recording, template or protocol.' : 'Try fewer words or another category.'}</p>
        </div>
      )}

      {recordings.length > 0 && (
        <section aria-labelledby="recordings" className="mt-12">
          <h2 id="recordings" className="text-3xl">{labelFor(vocab, 'resource_category', 'recording')}</h2>
          <ul className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {recordings.map((r, i) => (
              <li key={r.id} className="card relative overflow-hidden hover:border-green">
                <div className={`relative flex aspect-video items-center justify-center ${TINTS[i % TINTS.length]}`} aria-hidden="true">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink shadow">
                    <svg className="ml-1 h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
                  </span>
                  {r.duration && <span className="absolute right-3 bottom-3 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{r.duration}</span>}
                </div>
                <div className="p-5">
                  <h3 className="font-sans text-base leading-snug font-semibold">
                    <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer" className="text-ink no-underline after:absolute after:inset-0 hover:underline">
                      {r.title}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {[r.presenter ?? r.shared_by_name, r.event_date && `Recorded ${formatDate(r.event_date)}`].filter(Boolean).join(' · ')}
                  </p>
                  {r.licence && <p className="mt-1 text-xs text-muted">Conditions: {r.licence}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {documents.length > 0 && (
        <section aria-labelledby="documents" className="mt-12">
          <h2 id="documents" className="text-3xl">Templates and documents</h2>
          <p className="mt-4 flex gap-3 rounded-lg bg-controlled p-4 text-sm text-controlled-ink">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>
            Blank templates only. Never upload a completed consent form or anything that could identify a participant. Check
            every template against your own institution's requirements.
          </p>
          <ResourceList rows={documents} vocab={vocab} showCategory />
        </section>
      )}

      {others.map((c) => {
        const list = shown.filter((r) => r.category === c.code);
        if (list.length === 0) return null;
        return (
          <section key={c.code} aria-labelledby={`cat-${c.code}`} className="mt-12">
            <h2 id={`cat-${c.code}`} className="text-3xl">{c.label}</h2>
            <ResourceList rows={list} vocab={vocab} />
          </section>
        );
      })}
    </>
  );
}

function ResourceList({ rows, vocab, showCategory = false }: { rows: Resource[]; vocab: Vocab; showCategory?: boolean }) {
  return (
    <ul className="mt-5 divide-y divide-line rounded-xl border border-line bg-card">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
          <span className={`w-14 shrink-0 rounded px-2 py-1 text-center text-xs font-semibold uppercase ${r.kind === 'link' ? 'bg-tag text-green' : r.file_type === 'pdf' ? 'bg-controlled text-controlled-ink' : 'bg-registered text-registered-ink'}`}>
            {r.kind === 'link' ? 'Link' : r.file_type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{r.title}</p>
            {r.description && <p className="mt-0.5 text-sm text-[#33403a]">{r.description}</p>}
            {r.licence && <p className="mt-0.5 text-sm text-[#33403a]"><span className="font-semibold">Licence or conditions:</span> {r.licence}</p>}
            <p className="mt-0.5 text-sm text-muted">
              {[showCategory && labelFor(vocab, 'resource_category', r.category), r.kind === 'link' && 'External link',
                `Shared by ${r.shared_by_name}`, `${r.kind === 'link' ? 'Added' : 'Updated'} ${formatDate(r.updated_at).replace(/^\d+ /, '')}`]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          {r.kind === 'link'
            ? <a href={r.url ?? '#'} target="_blank" rel="noopener noreferrer" className="btn-secondary !min-h-9 shrink-0 !py-1">Open link<span className="sr-only"> (opens in a new tab)</span></a>
            : <DownloadButton r={r} />}
        </li>
      ))}
    </ul>
  );
}

// Makes a link that works for one minute, so files can't be shared by URL.
function DownloadButton({ r }: { r: Resource }) {
  const [problem, setProblem] = useState('');
  const download = async () => {
    setProblem('');
    const name = `${r.title.replace(/[^\w\s-]/g, '').trim().slice(0, 80)}.${r.file_type}`;
    const { data, error } = await supabase.storage.from('resources').createSignedUrl(r.file_path!, 60, { download: name });
    if (error || !data) return setProblem('The download could not start. Please try again.');
    window.location.href = data.signedUrl;
  };
  return (
    <div className="shrink-0 text-right">
      <button type="button" className="btn-secondary !min-h-9 !py-1" onClick={download}>Download</button>
      {problem && <p role="alert" className="mt-1 text-xs text-danger">{problem}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share a resource
// ---------------------------------------------------------------------------

const FILE_TYPES: Record<string, 'pdf' | 'docx' | 'xlsx'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const MAX_BYTES = 10 * 1024 * 1024;

function ShareForm({ vocab, onCancel, onDone }: { vocab: Vocab; onCancel: () => void; onDone: () => void }) {
  const [v, setV] = useState({ title: '', category: '', how: 'file' as 'file' | 'link', url: '', description: '', licence: '', presenter: '', event_date: '', duration: '', confirms: false });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof typeof v>(key: K) => (value: (typeof v)[K]) => setV((p) => ({ ...p, [key]: value }));
  const isRecording = v.category === 'recording';
  const how = isRecording ? 'link' : v.how;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem('');
    const e: Errors = {};
    const add = (k: string, m?: string) => { if (m) e[k] = m; };
    add('title', lengthError(v.title, 5, 200, 'a title'));
    if (!v.category) e.category = 'Choose a type';
    if (how === 'link') {
      if (!v.url.trim()) e.url = 'Enter the web address';
      else add('url', urlError(v.url));
    } else if (!file) {
      e.file = 'Choose a PDF, Word or Excel file';
    } else if (!FILE_TYPES[file.type]) {
      e.file = 'Only PDF, Word (.docx) and Excel (.xlsx) files can be shared';
    } else if (file.size > MAX_BYTES) {
      e.file = 'Files must be 10 MB or smaller';
    }
    add('description', lengthError(v.description, 0, 600, ''));
    add('licence', lengthError(v.licence, 0, 300, ''));
    if (!v.confirms) e.confirms = 'Tick the box to confirm you may share this';
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setBusy(true);
    let file_path: string | null = null;
    if (how === 'file' && file) {
      const { data: userData } = await supabase.auth.getUser();
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-80);
      file_path = `uploads/${userData.user?.id}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from('resources').upload(file_path, file, { contentType: file.type });
      if (up.error) {
        setBusy(false);
        return setProblem('The file could not be uploaded. Check it is a PDF, Word or Excel file under 10 MB and try again.');
      }
    }
    const { error } = await supabase.rpc('share_resource', {
      p: {
        title: v.title, category: v.category,
        url: how === 'link' ? v.url.trim() : null,
        file_path, file_type: file ? FILE_TYPES[file.type] : null, file_size: file?.size ?? null,
        description: v.description, licence: v.licence, presenter: isRecording ? v.presenter : null,
        event_date: isRecording && v.event_date ? v.event_date : null, duration: isRecording ? v.duration : null,
        confirms_rights: v.confirms,
      },
    });
    setBusy(false);
    if (error) return setProblem(friendlyError(error).replace('your listing was not sent', 'your resource was not shared'));
    onDone();
  }

  return (
    <div className="card mx-auto max-w-3xl p-6 sm:p-8">
      <button type="button" className="text-sm text-green underline" onClick={onCancel}>← Back to resources</button>
      <h1 className="mt-3 text-3xl">Share a resource</h1>
      <p className="mt-2 text-sm text-muted">An admin checks every resource before other members see it. It stays your work, credited to you.</p>
      <form noValidate onSubmit={onSubmit} className="relative mt-8 space-y-6">
        <ErrorSummary ref={summaryRef} errors={errors} labels={{ title: 'Title', category: 'Type', url: 'Web address', file: 'File', description: 'Description', licence: 'Licence or conditions', confirms: 'Permission' }} />
        <TextField name="title" label="Title" required value={v.title} onChange={set('title')} error={errors.title} maxLength={200} />
        <SelectField name="category" label="Type" required options={activeTerms(vocab, 'resource_category')} value={v.category} onChange={set('category')} error={errors.category} />

        {!isRecording && (
          <fieldset>
            <legend className="field-label">What are you sharing?</legend>
            <div className="mt-3 flex flex-wrap gap-6">
              <label className="choice"><input type="radio" name="how" checked={v.how === 'file'} onChange={() => set('how')('file')} /> A file</label>
              <label className="choice"><input type="radio" name="how" checked={v.how === 'link'} onChange={() => set('how')('link')} /> A link, such as protocols.io</label>
            </div>
          </fieldset>
        )}

        {how === 'link' ? (
          <TextField name="url" label={isRecording ? 'Link to the recording' : 'Web address'} type="url" required placeholder="https://"
            hint={isRecording ? 'An unlisted YouTube or Vimeo link, or your institution’s video platform. Anyone with the link can watch, so use a platform that checks sign-in for sensitive recordings.' : undefined}
            value={v.url} onChange={set('url')} error={errors.url} />
        ) : (
          <div>
            <label htmlFor="f-file" className="field-label">File</label>
            <span id="f-file-hint" className="field-hint">PDF, Word (.docx) or Excel (.xlsx), up to 10 MB.</span>
            <input id="f-file" type="file" accept=".pdf,.docx,.xlsx" className="input !py-2"
              aria-describedby={`f-file-hint${errors.file ? ' f-file-error' : ''}`} aria-invalid={errors.file ? true : undefined}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {errors.file && <span id="f-file-error" className="field-error">{errors.file}</span>}
          </div>
        )}

        {isRecording && (
          <div className="grid gap-6 sm:grid-cols-3">
            <TextField name="presenter" label="Presenter" value={v.presenter} onChange={set('presenter')} />
            <div>
              <label htmlFor="f-event_date" className="field-label">Date recorded <span className="font-normal text-muted">(optional)</span></label>
              <input id="f-event_date" type="date" className="input" value={v.event_date} onChange={(e) => set('event_date')(e.target.value)} />
            </div>
            <TextField name="duration" label="Length" placeholder="e.g. 58 min" value={v.duration} onChange={set('duration')} />
          </div>
        )}

        <TextArea name="description" label="Short description" maxLength={600} rows={3} value={v.description} onChange={set('description')} error={errors.description} />
        <TextField
          name="licence" label="Licence or conditions of use"
          hint="For example: CC BY 4.0, or “Adapt freely; please acknowledge the study team”. Leave blank if there are none."
          value={v.licence} onChange={set('licence')} error={errors.licence} maxLength={300}
        />

        <div>
          <label className="choice rounded-lg border border-line bg-paper p-4 text-sm">
            <input id="f-confirms" type="checkbox" checked={v.confirms} onChange={(e) => set('confirms')(e.target.checked)}
              aria-invalid={errors.confirms ? true : undefined} aria-describedby={errors.confirms ? 'f-confirms-error' : undefined} />
            <span>
              I have permission to share this with network members. It is a blank template or contains nothing that could
              identify a participant, and it remains the work of its authors.
            </span>
          </label>
          {errors.confirms && <span id="f-confirms-error" className="field-error">{errors.confirms}</span>}
        </div>

        {problem && <p role="alert" className="rounded-lg border-2 border-danger bg-card p-3 text-sm font-semibold text-danger">{problem}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Sharing…' : 'Share for review'}</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
        <p className="text-xs text-muted">See the <a href={withBase('/code-of-conduct/')}>member code of conduct</a>.</p>
      </form>
    </div>
  );
}
