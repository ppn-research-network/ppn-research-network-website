import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { labelFor, loadVocab, type Vocab } from '../../lib/vocab';
import { displayName, formatDate, initials, stateName } from '../../lib/listings';
import type { PublicProfile } from '../../lib/types';
import { withBase } from '../../lib/url';
import { NETWORK_NAME } from '../../../site.config.mjs';
import { openToText, tintFor } from '../directory/SkillsDirectory';
import ContactForm from './ContactForm';
import { recordView } from '../../lib/views';

export default function ProfileDetail() {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('slug') ?? '';
    Promise.all([loadVocab(), supabase.from('public_profiles').select('*').eq('slug', slug).maybeSingle()])
      .then(([v, { data, error }]) => {
        if (error) throw error;
        setVocab(v);
        if (!data) return setStatus('missing');
        const profile = data as PublicProfile;
        setP(profile);
        recordView('profile', profile.id);
        document.title = `${displayName(v, profile.honorific, profile.full_name)} · ${NETWORK_NAME}`;
        setStatus('ready');
      })
      .catch(() => setStatus('failed'));
  }, []);

  if (status === 'loading') return <p className="py-16 text-muted" role="status">Loading profile…</p>;
  if (status !== 'ready' || !p || !vocab) {
    return (
      <div className="py-12">
        <h1 className="text-4xl">{status === 'missing' ? 'Profile not found' : 'The profile could not load'}</h1>
        <p className="mt-4 text-lg text-[#33403a]">
          {status === 'missing' ? 'This profile may have been updated or removed.' : 'Check your internet connection and refresh the page.'}
        </p>
        <a href={withBase('/skills/')} className="btn-primary mt-8">Browse the skills directory</a>
      </div>
    );
  }

  const name = displayName(vocab, p.honorific, p.full_name);
  const firstName = p.full_name.split(/\s+/)[0];
  const tint = tintFor(vocab, p.discipline);
  const openTo = openToText(vocab, p.open_to);

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <a href={withBase('/skills/')}>Skills directory</a> / {name}
      </nav>

      <div className="mt-8 flex items-start gap-5">
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${tint.avatar}`} aria-hidden="true">
          {initials(p.full_name)}
        </span>
        <div>
          <h1 className="text-4xl leading-tight sm:text-5xl">{name}</h1>
          <p className="mt-2 text-muted">{p.role} · {p.institution} · {stateName(p.state)}</p>
          <p className={`mt-2 text-sm font-semibold ${tint.text}`}>
            {labelFor(vocab, 'discipline', p.discipline)} · {labelFor(vocab, 'career_stage', p.career_stage)}
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-10">
          <section aria-labelledby="about">
            <h2 id="about" className="text-2xl">About</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-[#33403a]">{p.bio}</p>
          </section>

          {p.skills.length > 0 && (
            <section aria-labelledby="skills">
              <h2 id="skills" className="text-2xl">Skills and methods</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.skills.map((s) => <li key={s} className="tag !text-sm">{s}</li>)}
              </ul>
            </section>
          )}

          {((p.life_stages ?? []).length > 0 || (p.health_statuses ?? []).length > 0) && (
            <section aria-labelledby="populations">
              <h2 id="populations" className="text-2xl">Populations I work with</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...(p.life_stages ?? []).map((c) => labelFor(vocab, 'life_stage', c)), ...(p.health_statuses ?? []).map((c) => labelFor(vocab, 'health_status', c))]
                  .map((t) => <li key={t} className="tag !text-sm">{t}</li>)}
              </ul>
            </section>
          )}

          {(p.looking_for.length > 0 || p.open_to.length > 0) && (
            <section aria-labelledby="connect">
              <h2 id="connect" className="text-2xl">Looking to connect</h2>
              <dl className="card mt-4 divide-y divide-line text-sm">
                {p.looking_for.length > 0 && (
                  <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                    <dt className="text-muted">Looking for</dt>
                    <dd>{p.looking_for.map((c) => labelFor(vocab, 'looking_for', c)).join(', ')}</dd>
                  </div>
                )}
                {p.open_to.length > 0 && (
                  <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                    <dt className="text-muted">Open to</dt>
                    <dd>{p.open_to.map((c) => labelFor(vocab, 'open_to', c)).join(', ')}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {(p.orcid || p.profile_url) && (
            <section aria-labelledby="links">
              <h2 id="links" className="text-2xl">Links</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.orcid && (
                  <li>ORCID: <a href={`https://orcid.org/${p.orcid}`} rel="noopener noreferrer" target="_blank">{p.orcid}<span className="sr-only"> (opens in a new tab)</span></a></li>
                )}
                {p.profile_url && (
                  <li>Profile: <a href={p.profile_url} rel="noopener noreferrer" target="_blank" className="break-all">{p.profile_url.replace(/^https?:\/\//, '')}<span className="sr-only"> (opens in a new tab)</span></a></li>
                )}
              </ul>
            </section>
          )}

          <p className="text-sm text-muted">Listed {formatDate(p.listed_at)}</p>
        </div>

        <aside className="card p-6 lg:sticky lg:top-6" aria-labelledby="contact-heading">
          <h2 id="contact-heading" className="text-2xl">Get in touch</h2>
          {openTo && <p className="mt-1 text-sm text-muted">{openTo}</p>}
          <p className="mt-4 flex gap-2 rounded-lg bg-band p-3 text-xs leading-relaxed text-[#4a5550]">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            Your message is emailed to {firstName}. Their address stays private; they reply to you directly.
          </p>
          <ContactForm
            targetType="profile"
            targetId={p.id}
            recipient={firstName}
            messageHint="Say who you are and what you'd like to discuss."
            openTo={p.open_to}
          />
          <div className="mt-6 space-y-1.5 border-t border-line pt-4 text-center text-sm">
            <a href={withBase('/account/')} className="block">Is this your profile? Sign in to update it</a>
            <a href={withBase('/contact/')} className="block">Report a problem with this profile</a>
          </div>
        </aside>
      </div>
    </>
  );
}
