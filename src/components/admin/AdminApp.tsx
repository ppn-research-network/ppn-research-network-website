import { useEffect, useState, type SubmitEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useVocab } from '../../lib/vocab';
import { withBase } from '../../lib/url';
import { NETWORK_NAME } from '../../../site.config.mjs';
import { EMAIL_RE } from '../forms/Fields';
import { useAdminData } from './data';
import Queue from './Queue';
import { AnnualReview, Published, Requests, dueForReview } from './Lists';

type Access = 'checking' | 'signed-out' | 'not-admin' | 'admin';

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access>('checking');

  useEffect(() => {
    const check = async (s: Session | null) => {
      setSession(s);
      if (!s) return setAccess('signed-out');
      const { data } = await supabase.rpc('is_admin');
      setAccess(data === true ? 'admin' : 'not-admin');
    };
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer so the auth library finishes its own work first.
      setTimeout(() => check(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (access === 'checking') return <Centered><p className="text-muted" role="status">Checking your sign-in…</p></Centered>;
  if (access === 'signed-out') return <SignIn />;
  if (access === 'not-admin') {
    return (
      <Centered>
        <h1 className="text-3xl">This account isn't an admin</h1>
        <p className="mt-3 text-muted">You're signed in as {session?.user.email}, which isn't on the admin list.</p>
        <button type="button" className="btn-secondary mt-6" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </Centered>
    );
  }
  return <Dashboard email={session?.user.email ?? ''} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
      <div className="card w-full max-w-md p-8">{children}</div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter your email address');
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,     // admins are added by hand; nobody can sign up here
        emailRedirectTo: window.location.origin + withBase('/admin/'),
      },
    });
    setBusy(false);
    // Don't reveal whether an address has an account: only a real problem
    // (such as too many attempts) is shown.
    if (e && e.status === 429) return setError('Too many sign-in attempts. Please wait a few minutes and try again.');
    setSent(true);
  }

  return (
    <Centered>
      <p className="font-serif text-lg">{NETWORK_NAME}</p>
      <p className="mt-1 text-xs tracking-widest text-muted uppercase">Admin</p>
      <h1 className="mt-6 text-3xl">Sign in</h1>
      {sent ? (
        <div role="status" className="mt-4 rounded-lg bg-open p-4 text-sm text-open-ink">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1">
            If {email.trim()} belongs to an admin, a sign-in link is on its way. Open it in this browser. The link works once
            and expires after an hour.
          </p>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="mt-4 space-y-4">
          <p className="text-sm text-muted">We'll email you a one-time sign-in link. There's no password.</p>
          <div>
            <label htmlFor="admin-email" className="field-label">Email</label>
            <input id="admin-email" type="email" autoComplete="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'admin-email-error' : undefined} />
            {error && <span id="admin-email-error" className="field-error">{error}</span>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
        </form>
      )}
      <a href={withBase('/')} className="mt-6 inline-block text-sm">← Back to the website</a>
    </Centered>
  );
}

type Tab = 'datasets' | 'profiles' | 'published' | 'requests' | 'annual';

function Dashboard({ email }: { email: string }) {
  const { data, error, reload } = useAdminData();
  const { vocab } = useVocab();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') as Tab) || 'datasets');

  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, '', `${window.location.pathname}?tab=${t}`);
    document.getElementById('admin-main')?.focus();
  };

  const counts = data && vocab ? {
    datasets: data.datasets.filter((d) => d.status === 'pending').length,
    profiles: data.profiles.filter((p) => p.status === 'pending').length,
    requests: data.requests.filter((r) => r.status === 'queued').length,
    annual: dueForReview(data, vocab).length,
  } : null;

  const tabs: { key: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { key: 'datasets', label: 'Pending datasets', count: counts?.datasets, urgent: true },
    { key: 'profiles', label: 'Pending profiles', count: counts?.profiles, urgent: true },
    { key: 'published', label: 'Published listings' },
    { key: 'requests', label: 'Contact requests', count: counts?.requests },
    { key: 'annual', label: 'Due for annual review', count: counts?.annual },
  ];

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col bg-footer text-white/80 lg:sticky lg:top-0 lg:h-screen">
        <div className="px-6 pt-6 pb-4">
          <a href={withBase('/')} className="font-serif text-lg leading-tight text-white no-underline">{NETWORK_NAME}</a>
          <p className="mt-1 text-xs tracking-widest uppercase">Admin</p>
        </div>
        <nav aria-label="Admin" className="px-3">
          <ul className="flex gap-1 overflow-x-auto pb-3 lg:block lg:space-y-1 lg:overflow-visible">
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <li key={t.key} className="shrink-0">
                  <button
                    type="button"
                    aria-current={on ? 'page' : undefined}
                    onClick={() => go(t.key)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm whitespace-nowrap ${on ? 'bg-white/10 font-semibold text-white' : 'hover:bg-white/5 hover:text-white'}`}
                  >
                    {t.label}
                    {t.count != null && t.count > 0 && (
                      <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${on && t.urgent ? 'bg-[#d9773f] text-white' : 'bg-white/15 text-white'}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto hidden px-6 py-6 text-sm lg:block">
          <p className="break-all">Signed in as {email}</p>
          <button type="button" className="mt-2 text-white underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <main id="admin-main" tabIndex={-1} className="min-w-0 px-5 py-8 outline-none sm:px-8 lg:px-10 lg:py-10">
        <div className="mb-6 flex items-center justify-between text-sm text-muted lg:hidden">
          <span className="break-all">Signed in as {email}</span>
          <button type="button" className="underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
        {error && <p role="alert" className="card p-6 text-danger">The dashboard could not load: {error}</p>}
        {!error && (!data || !vocab) && <p className="text-muted" role="status">Loading…</p>}
        {data && vocab && (
          <div className="max-w-6xl">
            {tab === 'datasets' && <Queue kind="dataset" data={data} vocab={vocab} reload={reload} />}
            {tab === 'profiles' && <Queue kind="profile" data={data} vocab={vocab} reload={reload} />}
            {tab === 'published' && <Published data={data} vocab={vocab} reload={reload} />}
            {tab === 'requests' && <Requests data={data} vocab={vocab} reload={reload} />}
            {tab === 'annual' && <AnnualReview data={data} vocab={vocab} reload={reload} />}
          </div>
        )}
      </main>
    </div>
  );
}
