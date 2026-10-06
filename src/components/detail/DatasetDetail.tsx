import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { labelFor, loadVocab, type Vocab } from '../../lib/vocab';
import { accessLevel, consentLabel, formatDate, formatNumber, sortLevels, stateName } from '../../lib/listings';
import type { PublicDataset } from '../../lib/types';
import { withBase } from '../../lib/url';
import { NETWORK_NAME } from '../../../site.config.mjs';
import ContactForm from './ContactForm';
import { recordView } from '../../lib/views';

export default function DatasetDetail() {
  const [d, setD] = useState<PublicDataset | null>(null);
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [history, setHistory] = useState<{ id: string; happened_at: string; summary: string }[]>([]);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('slug') ?? '';
    Promise.all([loadVocab(), supabase.from('public_datasets').select('*').eq('slug', slug).maybeSingle()])
      .then(([v, { data, error }]) => {
        if (error) throw error;
        setVocab(v);
        if (!data) return setStatus('missing');
        setD(data as PublicDataset);
        recordView('dataset', (data as PublicDataset).id);
        supabase.from('public_listing_history').select('id, happened_at, summary')
          .eq('dataset_id', (data as PublicDataset).id).order('happened_at', { ascending: false })
          .then(({ data: h }) => setHistory(h ?? []));
        document.title = `${(data as PublicDataset).title} · ${NETWORK_NAME}`;
        setStatus('ready');
      })
      .catch(() => setStatus('failed'));
  }, []);

  if (status === 'loading') return <p className="py-16 text-muted" role="status">Loading dataset…</p>;
  if (status !== 'ready' || !d || !vocab) {
    return (
      <div className="py-12">
        <h1 className="text-4xl">{status === 'missing' ? 'Dataset not found' : 'The dataset could not load'}</h1>
        <p className="mt-4 text-lg text-[#33403a]">
          {status === 'missing'
            ? 'This listing may have been updated, withdrawn or removed.'
            : 'Check your internet connection and refresh the page.'}
        </p>
        <a href={withBase('/data/')} className="btn-primary mt-8">Browse the data directory</a>
      </div>
    );
  }

  const levels = sortLevels(d.access_levels);
  const shortTitle = d.title.split(':')[0];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <a href={withBase('/data/')}>Data directory</a> / {shortTitle}
      </nav>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        {levels.map((l) => {
          const a = accessLevel(l);
          return <span key={l} className={`badge ${a.badgeClass}`}>{a.badge}</span>;
        })}
        <span>
          Listed {formatDate(d.listed_at)}
          {d.last_reviewed_at && ` · Last reviewed ${formatDate(d.last_reviewed_at)}`}
        </span>
      </div>
      <h1 className="mt-3 max-w-4xl text-4xl leading-tight sm:text-5xl">{d.title}</h1>
      <p className="mt-3 text-muted">{d.lead_institution} · {stateName(d.state)}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-10">
          <section aria-labelledby="summary">
            <h2 id="summary" className="text-2xl">Summary</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-[#33403a]">{d.summary}</p>
          </section>

          <section aria-labelledby="about-data">
            <h2 id="about-data" className="text-2xl">About the data</h2>
            <dl className="card mt-4 divide-y divide-line text-sm">
              <Row label="Study design">{labelFor(vocab, 'study_design', d.study_design)}</Row>
              {d.years_collected && <Row label="Years collected">{d.years_collected}</Row>}
              {d.sample_size != null && <Row label="Sample size">{formatNumber(d.sample_size)} participants</Row>}
              {d.population && <Row label="Population">{d.population}</Row>}
              {d.age_range && <Row label="Age range">{d.age_range}</Row>}
              <Row label="Data types">
                <ul className="flex flex-wrap gap-2">
                  {d.data_types.filter((t) => t !== 'other').map((t) => <li key={t} className="tag">{labelFor(vocab, 'data_type', t)}</li>)}
                  {d.data_types.includes('other') && <li className="tag">{d.data_types_other || 'Other'}</li>}
                </ul>
              </Row>
              <Row label="Biospecimens">{d.biospecimens ? `Yes${d.biospecimens_details ? `: ${d.biospecimens_details}` : ''}` : 'No'}</Row>
              <Row label="Consent for secondary use">
                {consentLabel(d.consent_secondary_use)}
                {d.consent_secondary_use !== 'yes' && (
                  <span className="mt-1 block text-muted">Check with the custodian what reuse participants consented to.</span>
                )}
              </Row>
              {d.keywords.length > 0 && <Row label="Keywords">{d.keywords.join(', ')}</Row>}
            </dl>
          </section>

          <section aria-labelledby="access">
            <h2 id="access" className="text-2xl">How to access it</h2>
            <div className="mt-3 space-y-2 text-[#33403a]">
              {levels.map((l) => {
                const a = accessLevel(l);
                return <p key={l}><strong className="text-ink">{a.label}.</strong> {a.description}</p>;
              })}
              {d.access_notes && <p className="whitespace-pre-line">{d.access_notes}</p>}
            </div>
            {d.access_requirements.length > 0 && (
              <>
                <p className="mt-4 text-[#33403a]">Requests need:</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {d.access_requirements.map((r) => (
                    <li key={r} className="card flex items-start gap-3 p-4 text-sm">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      {labelFor(vocab, 'access_requirement', r)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby="links">
            <h2 id="links" className="text-2xl">Links</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-[#33403a]">
              <li>Trial registration: {d.trial_registration ?? 'not listed'}</li>
              <li>Key publication: {d.publication_url ? <ExternalLink href={d.publication_url} /> : 'not listed'}</li>
              <li>Repository: {d.repository_url ? <ExternalLink href={d.repository_url} /> : 'not deposited'}</li>
            </ul>
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="text-2xl">Listing history</h2>
            <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-2 text-sm text-[#33403a]">
              {history.map((h) => (
                <div key={h.id} className="contents">
                  <dt className="text-muted">{formatDate(h.happened_at)}</dt>
                  <dd>{h.summary}</dd>
                </div>
              ))}
              <dt className="text-muted">{formatDate(d.listed_at)}</dt>
              <dd>Listed</dd>
            </dl>
          </section>
        </div>

        <aside className="card p-6 lg:sticky lg:top-6" aria-labelledby="contact-heading">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Data custodian</p>
          <p className="mt-2 text-lg font-semibold">{d.contact_name}</p>
          <p className="text-sm text-muted">{d.contact_role}, {d.lead_institution}</p>
          <p className="mt-4 flex gap-2 rounded-lg bg-band p-3 text-xs leading-relaxed text-[#4a5550]">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            Your message is emailed to the custodian. Their address stays private; they reply to you directly.
          </p>
          <h2 id="contact-heading" className="mt-6 text-2xl">Contact the custodian</h2>
          <ContactForm
            targetType="dataset"
            targetId={d.id}
            recipient="the custodian"
            messageHint="Briefly describe your project and how you would use the data."
          />
          <div className="mt-6 space-y-1.5 border-t border-line pt-4 text-center text-sm">
            <a href={withBase('/account/')} className="block">Is this your dataset? Sign in to update it</a>
            <a href={withBase('/contact/')} className="block">Report a problem with this listing</a>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string }) {
  const text = href.replace(/^https?:\/\/(dx\.)?doi\.org\//, 'DOI ').replace(/^https?:\/\//, '');
  return <a href={href} rel="noopener noreferrer" target="_blank" className="break-all">{text}<span className="sr-only"> (opens in a new tab)</span></a>;
}
