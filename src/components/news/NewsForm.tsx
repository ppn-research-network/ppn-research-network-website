import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { loadMembership, useSession, type Membership } from '../../lib/session';
import { NEWS_KINDS, type NewsKind } from '../../lib/news';
import { withBase } from '../../lib/url';
import { REVIEW_TIME } from '../../../site.config.mjs';
import { ErrorSummary, TextArea, TextField, friendlyError, lengthError, urlError, type Errors } from '../forms/Fields';
import SignInCard from '../account/SignInCard';

const HINTS: Record<NewsKind, string> = {
  news: 'A new publication, study result, report or network update.',
  event: 'A conference, seminar, workshop or webinar.',
  recruitment: 'A study looking for participants. Ethics approval details are required.',
  opportunity: 'A grant, scholarship, PhD place, fellowship or job.',
};

export default function NewsForm() {
  const { session, ready } = useSession();
  const [membership, setMembership] = useState<Membership | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!session) { setMembership(null); return; }
    loadMembership().then(setMembership);
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true));
  }, [ready, session]);

  if (!ready || membership === undefined) return <p className="min-h-[90vh] text-muted" role="status">Checking your membership…</p>;
  if (!session) {
    return (
      <div className="max-w-md">
        <p className="mb-6 text-[#33403a]">Sharing news and events is for network members. Sign in to continue.</p>
        <SignInCard returnTo="/news/submit/" />
      </div>
    );
  }
  if (membership?.status !== 'approved' && !isAdmin) {
    return (
      <div className="card max-w-2xl p-7">
        <p className="font-semibold">Sharing news and events is for network members</p>
        <p className="mt-2 text-muted">
          {membership?.status === 'pending'
            ? 'Your membership request is being reviewed. Once approved, you can share news and events here.'
            : 'Request membership to share news, events, study recruitment and opportunities with the network.'}
        </p>
        {membership?.status !== 'pending' && <a href={withBase('/account/?section=membership')} className="btn-primary mt-5">Request membership</a>}
      </div>
    );
  }
  return <Form isAdmin={isAdmin} />;
}

function Form({ isAdmin }: { isAdmin: boolean }) {
  const [v, setV] = useState({
    kind: '' as NewsKind | '', title: '', summary: '', url: '', organisation: '', scope: 'national', location: '', is_online: false,
    starts_on: '', ends_on: '', closes_on: '', ethics_reference: '', ethics_committee: '', members_only: false, confirms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof typeof v>(key: K) => (value: (typeof v)[K]) => setV((p) => ({ ...p, [key]: value }));

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem('');
    const e: Errors = {};
    const add = (k: string, m?: string) => { if (m) e[k] = m; };
    if (!v.kind) e.kind = 'Choose what you are sharing';
    add('title', lengthError(v.title, 5, 200, 'a title'));
    add('summary', lengthError(v.summary, 20, 1000, 'a short summary'));
    if (!v.url.trim()) e.url = 'Enter a link where people can find out more';
    else add('url', urlError(v.url));
    add('organisation', lengthError(v.organisation, 0, 200, ''));
    add('location', lengthError(v.location, 0, 200, ''));
    if (v.kind === 'event' && !v.starts_on) e.starts_on = 'Enter the date the event starts';
    if (v.kind === 'event' && v.ends_on && v.starts_on && v.ends_on < v.starts_on) e.ends_on = 'The end date must be on or after the start date';
    if (v.kind === 'recruitment') {
      add('ethics_reference', lengthError(v.ethics_reference, 2, 300, 'the ethics approval number'));
      add('ethics_committee', lengthError(v.ethics_committee, 2, 200, 'the approving ethics committee'));
    }
    if (!v.confirms) e.confirms = 'Tick the box to confirm';
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    const isEvent = v.kind === 'event';
    const { data, error } = await supabase.rpc('submit_news', {
      p: {
        kind: v.kind, title: v.title, summary: v.summary, url: v.url.trim(), organisation: v.organisation,
        scope: v.scope, location: v.location, is_online: v.is_online,
        starts_on: isEvent ? v.starts_on : null, ends_on: isEvent ? v.ends_on || null : null,
        closes_on: !isEvent ? v.closes_on || null : null,
        ethics_reference: v.ethics_reference, ethics_committee: v.ethics_committee, members_only: v.members_only,
      },
    });
    setBusy(false);
    if (error) return setProblem(friendlyError(error).replace('your listing was not sent', 'your post was not sent'));
    setDone(data as 'pending' | 'approved');
    window.scrollTo(0, 0);
  }

  if (done) {
    return (
      <div role="status" className="card max-w-2xl p-7">
        <p className="text-lg font-semibold">{done === 'approved' ? 'Posted' : 'Thanks, your post has been sent for review'}</p>
        <p className="mt-2 text-muted">
          {done === 'approved'
            ? 'As an admin, your post went live straight away.'
            : `An admin will check it within ${REVIEW_TIME}. We'll email you when it's live.`}
        </p>
        <a href={withBase('/news/')} className="btn-primary mt-5">Back to news and events</a>
      </div>
    );
  }

  const kind = v.kind;
  return (
    <form noValidate onSubmit={onSubmit} className="card relative max-w-3xl space-y-7 p-6 sm:p-8">
      <ErrorSummary ref={summaryRef} errors={errors} labels={{
        kind: 'Type', title: 'Title', summary: 'Summary', url: 'Link', organisation: 'Organisation', location: 'Location',
        starts_on: 'Start date', ends_on: 'End date', ethics_reference: 'Ethics approval number', ethics_committee: 'Ethics committee', confirms: 'Confirmation',
      }} />

      <fieldset id="f-kind" tabIndex={-1} aria-describedby={errors.kind ? 'f-kind-error' : undefined}>
        <legend className="field-label">What are you sharing?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {NEWS_KINDS.map((k) => (
            <label key={k.code} className={`choice rounded-lg border p-4 ${kind === k.code ? 'border-green bg-tag/60 ring-1 ring-green' : 'border-line bg-card'}`}>
              <input type="radio" name="kind" checked={kind === k.code} onChange={() => set('kind')(k.code)} />
              <span><span className="block font-semibold">{k.label}</span><span className="mt-0.5 block text-sm text-muted">{HINTS[k.code]}</span></span>
            </label>
          ))}
        </div>
        {errors.kind && <span id="f-kind-error" className="field-error">{errors.kind}</span>}
      </fieldset>

      <TextField name="title" label="Title" required value={v.title} onChange={set('title')} error={errors.title} maxLength={200} />
      <TextArea name="summary" label="Short summary" required maxLength={1000} rows={4}
        hint={kind === 'recruitment' ? 'Who you are looking for and what taking part involves. Don’t ask people to send personal details here; link to the study’s own page.' : 'Two or three sentences.'}
        value={v.summary} onChange={set('summary')} error={errors.summary} />
      <TextField name="url" label="Link for more information" type="url" required placeholder="https://" value={v.url} onChange={set('url')} error={errors.url} />
      <TextField name="organisation" label="Organisation or host" value={v.organisation} onChange={set('organisation')} error={errors.organisation} />

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset>
          <legend className="field-label">National or international?</legend>
          <div className="mt-3 flex gap-6">
            <label className="choice"><input type="radio" name="scope" checked={v.scope === 'national'} onChange={() => set('scope')('national')} /> National</label>
            <label className="choice"><input type="radio" name="scope" checked={v.scope === 'international'} onChange={() => set('scope')('international')} /> International</label>
          </div>
        </fieldset>
        <TextField name="location" label="Location" placeholder="e.g. Melbourne, or leave blank" value={v.location} onChange={set('location')} error={errors.location} />
      </div>
      <label className="choice"><input type="checkbox" checked={v.is_online} onChange={(e) => set('is_online')(e.target.checked)} /> Online, or available online</label>

      {kind === 'event' ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <DateField name="starts_on" label="Starts" required value={v.starts_on} onChange={set('starts_on')} error={errors.starts_on} />
          <DateField name="ends_on" label="Ends" value={v.ends_on} onChange={set('ends_on')} error={errors.ends_on} />
        </div>
      ) : kind && kind !== 'news' ? (
        <DateField name="closes_on" label="Closing date" hint="After this date it moves to the archive." value={v.closes_on} onChange={set('closes_on')} />
      ) : null}

      {kind === 'recruitment' && (
        <section aria-labelledby="ethics-heading" className="space-y-5 rounded-xl bg-band p-5">
          <h2 id="ethics-heading" className="font-sans text-sm font-semibold">Ethics approval (shown on the post)</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="ethics_reference" label="Approval number" required placeholder="e.g. 2026/123" value={v.ethics_reference} onChange={set('ethics_reference')} error={errors.ethics_reference} />
            <TextField name="ethics_committee" label="Approving committee" required placeholder="e.g. University HREC" value={v.ethics_committee} onChange={set('ethics_committee')} error={errors.ethics_committee} />
          </div>
        </section>
      )}

      <label className="choice text-sm">
        <input type="checkbox" checked={v.members_only} onChange={(e) => set('members_only')(e.target.checked)} />
        <span>Members only: show this to signed-in members, not the public</span>
      </label>

      <div>
        <label className="choice rounded-lg border border-line bg-paper p-4 text-sm">
          <input id="f-confirms" type="checkbox" checked={v.confirms} onChange={(e) => set('confirms')(e.target.checked)}
            aria-invalid={errors.confirms ? true : undefined} aria-describedby={errors.confirms ? 'f-confirms-error' : undefined} />
          <span>
            The information is accurate and I have permission to share it.
            {kind === 'recruitment' && ' The study has current ethics approval, and people will apply through the study’s own page, not through this network.'}
          </span>
        </label>
        {errors.confirms && <span id="f-confirms-error" className="field-error">{errors.confirms}</span>}
      </div>

      {problem && <p role="alert" className="rounded-lg border-2 border-danger bg-card p-3 text-sm font-semibold text-danger">{problem}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Sending…' : isAdmin ? 'Post now' : 'Send for review'}</button>
        <a href={withBase('/news/')} className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}

function DateField({ name, label, hint, required, value, onChange, error }: {
  name: string; label: string; hint?: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="field-label">{label}{!required && <span className="font-normal text-muted"> (optional)</span>}</label>
      {hint && <span id={`f-${name}-hint`} className="field-hint">{hint}</span>}
      <input id={`f-${name}`} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `f-${name}-hint` : '', error ? `f-${name}-error` : ''].filter(Boolean).join(' ') || undefined} />
      {error && <span id={`f-${name}-error`} className="field-error">{error}</span>}
    </div>
  );
}
