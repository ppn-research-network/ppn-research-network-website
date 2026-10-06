import { useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useVocab, activeTerms } from '../../lib/vocab';
import { withBase } from '../../lib/url';
import { MEMBERSHIP_ELIGIBILITY, MEMBERSHIP_INVITATION, REVIEW_TIME } from '../../../site.config.mjs';
import {
  EMAIL_RE, ErrorSummary, Honeypot, SelectField, TextArea, TextField, friendlyError, lengthError, type Errors,
} from '../forms/Fields';

// "Request membership" form. `lockedEmail` is used when the person is already
// signed in, so the request matches the email they sign in with.
export default function MembershipForm({ lockedEmail }: { lockedEmail?: string }) {
  const { vocab } = useVocab();
  const [v, setV] = useState({
    full_name: '', email: lockedEmail ?? '', institution: '', country: 'Australia', role: '', reason: '',
    agreed_code: false, website: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof typeof v>(key: K) => (value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem('');
    const e: Errors = {};
    const add = (k: string, m?: string) => { if (m) e[k] = m; };
    add('full_name', lengthError(v.full_name, 2, 120, 'your name'));
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter your work email, like name@example.edu.au';
    add('institution', lengthError(v.institution, 2, 200, 'your institution or organisation'));
    add('country', lengthError(v.country, 2, 80, 'your country'));
    if (!v.role) e.role = 'Choose your role';
    add('reason', lengthError(v.reason, 0, 1000, ''));
    if (!v.agreed_code) e.agreed_code = 'Tick the box to agree to the member code of conduct';
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('request_membership', {
      p_details: { ...v, email: v.email.trim(), website: undefined },
      p_website: v.website,
    });
    setBusy(false);
    if (error) setProblem(friendlyError(error).replace('your listing was not sent', 'your request was not sent'));
    else setDone(true);
  }

  return (
    <section aria-labelledby="membership-heading" className="card p-7 sm:p-8">
      <h2 id="membership-heading" className="text-3xl">Request membership</h2>
      {done ? (
        <div role="status" className="mt-4 rounded-lg bg-open p-4 text-sm text-open-ink">
          <p className="font-semibold">Thanks, we've received your request</p>
          <p className="mt-1">
            An admin will review it within {REVIEW_TIME}. Once approved, sign in with {v.email.trim()} to see the resources.
          </p>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="relative mt-3 space-y-5">
          <p className="text-sm text-muted">{MEMBERSHIP_INVITATION}</p>
          <p className="text-sm text-muted">{MEMBERSHIP_ELIGIBILITY} An admin approves each request.</p>
          <ErrorSummary ref={summaryRef} errors={errors} labels={{ full_name: 'Name', email: 'Work email', institution: 'Institution', country: 'Country', role: 'Role', reason: 'How you will use the network', agreed_code: 'Code of conduct' }} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="full_name" label="Name" required autoComplete="name" value={v.full_name} onChange={set('full_name')} error={errors.full_name} />
            {lockedEmail ? (
              <div>
                <span className="field-label">Work email</span>
                <p className="input !flex items-center bg-band text-muted">{lockedEmail}</p>
              </div>
            ) : (
              <TextField name="email" label="Work email" type="email" required autoComplete="email" value={v.email} onChange={set('email')} error={errors.email} />
            )}
            <TextField name="institution" label="Institution or organisation" required autoComplete="organization" value={v.institution} onChange={set('institution')} error={errors.institution} />
            <SelectField name="role" label="Role" required options={vocab ? activeTerms(vocab, 'member_role') : []} value={v.role} onChange={set('role')} error={errors.role} />
            <TextField name="country" label="Country" required autoComplete="country-name" value={v.country} onChange={set('country')} error={errors.country} />
          </div>
          <TextArea name="reason" label="How will you use the network?" maxLength={1000} rows={3} value={v.reason} onChange={set('reason')} error={errors.reason} />
          <div>
            <label className="choice text-sm">
              <input id="f-agreed_code" type="checkbox" checked={v.agreed_code} onChange={(e) => set('agreed_code')(e.target.checked)}
                aria-invalid={errors.agreed_code ? true : undefined} aria-describedby={errors.agreed_code ? 'f-agreed_code-error' : undefined} />
              <span>
                I agree to the <a href={withBase('/code-of-conduct/')} target="_blank" rel="noopener">member code of conduct<span className="sr-only"> (opens in a new tab)</span></a>,
                including not sharing members-only resources outside the network.
              </span>
            </label>
            {errors.agreed_code && <span id="f-agreed_code-error" className="field-error">{errors.agreed_code}</span>}
          </div>
          <Honeypot value={v.website} onChange={set('website')} />
          {problem && <p role="alert" className="rounded-lg border-2 border-danger bg-card p-3 text-sm font-semibold text-danger">{problem}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Request membership'}</button>
        </form>
      )}
    </section>
  );
}
