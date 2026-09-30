import { useState, type SubmitEvent } from 'react';
import { EMAIL_RE } from '../forms/Fields';
import { sendSignInLink } from '../../lib/session';

// "Sign in" card: emails a one-time link that returns the person to `returnTo`.
export default function SignInCard({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter your email address, like name@example.edu.au');
    setBusy(true);
    const problem = await sendSignInLink(email, returnTo);
    setBusy(false);
    if (problem) setError(problem);
    else setSent(true);
  }

  return (
    <section aria-labelledby="sign-in-heading" className="card p-7 sm:p-8">
      <h2 id="sign-in-heading" className="text-3xl">Sign in</h2>
      {sent ? (
        <div role="status" className="mt-4 rounded-lg bg-open p-4 text-sm text-open-ink">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1">
            We've sent a sign-in link to {email.trim()}. Open it in this browser. It works once and expires after an hour.
          </p>
          <button type="button" className="mt-3 underline" onClick={() => setSent(false)}>Use a different email</button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="mt-3 space-y-4">
          <p className="text-sm text-muted">We'll email you a one-time sign-in link. There's no password to remember.</p>
          <div>
            <label htmlFor="sign-in-email" className="field-label">Email</label>
            <input
              id="sign-in-email" type="email" autoComplete="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined} aria-describedby={error ? 'sign-in-email-error' : undefined}
            />
            {error && <span id="sign-in-email-error" className="field-error">{error}</span>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          <p className="flex gap-2 rounded-lg bg-band p-3 text-sm text-[#4a5550]">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></svg>
            Listed a dataset or a profile? Sign in with the same email to update or withdraw it, even if you're not a member.
          </p>
        </form>
      )}
    </section>
  );
}
