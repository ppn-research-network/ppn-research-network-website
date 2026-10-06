import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { NEWS_KINDS, isCurrent, keyDate, kindInfo, whenText, type NewsItem } from '../../lib/news';
import { withBase } from '../../lib/url';
import { LoadError, Loading, matchesSearch, useUrlState } from '../directory/common';

// The News and events page. Members also see members-only items (the database
// decides, through the listed_news view).
export default function NewsList() {
  const { ready, session } = useSession();
  const [rows, setRows] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, update] = useUrlState({ q: '', kind: '', scope: '', archive: false as boolean });

  useEffect(() => {
    if (!ready) return;
    supabase.from('listed_news').select('*')
      .then(({ data, error }) => (error ? setFailed(true) : setRows(data as NewsItem[])));
  }, [ready, session]);

  const shown = useMemo(() => {
    const list = (rows ?? []).filter((n) =>
      isCurrent(n) !== state.archive
      && (!state.kind || n.kind === state.kind)
      && (!state.scope || n.scope === state.scope)
      && matchesSearch(state.q, [n.title, n.summary, n.organisation, n.location, kindInfo(n.kind).label]));
    // Current: soonest first. Archive: most recent first.
    return list.sort((a, b) => (state.archive ? keyDate(b).localeCompare(keyDate(a)) : keyDate(a).localeCompare(keyDate(b))));
  }, [rows, state]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search news and events</span>
          <input
            type="search" value={state.q} onChange={(e) => update({ q: e.target.value })}
            placeholder="Search news, events and opportunities"
            className="input !mt-0"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Where</span>
          <select className="input !mt-0 !min-h-11 w-auto !py-1 text-sm" value={state.scope} onChange={(e) => update({ scope: e.target.value })}>
            <option value="">National and international</option>
            <option value="national">National</option>
            <option value="international">International</option>
          </select>
        </label>
      </div>

      <nav aria-label="Type" className="mt-5">
        <ul className="flex flex-wrap gap-2">
          {[{ code: '', plural: 'Everything' }, ...NEWS_KINDS].map((k) => (
            <li key={k.code || 'all'}>
              <button type="button" aria-pressed={state.kind === k.code} onClick={() => update({ kind: k.code })}
                className={`min-h-10 rounded-full border px-4 text-sm ${state.kind === k.code ? 'border-green bg-green font-semibold text-white' : 'border-line bg-card hover:border-green'}`}>
                {k.plural}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted" role="status" aria-live="polite">
          {rows && <><strong className="text-ink">{shown.length}</strong> {state.archive ? 'in the archive' : shown.length === 1 ? 'current item' : 'current items'}</>}
        </p>
        <button type="button" className="font-semibold text-green underline" onClick={() => update({ archive: !state.archive })}>
          {state.archive ? 'Show current items' : 'Show past events and closed calls'}
        </button>
      </div>

      {failed && <LoadError what="news" />}
      {!failed && !rows && <Loading what="news" />}
      {rows && shown.length === 0 && (
        <div className="card mt-4 p-8 text-center">
          <p className="font-semibold">{rows.length === 0 ? 'Nothing has been posted yet' : 'Nothing matches'}</p>
          <p className="mt-2 text-sm text-muted">Members can share news, events, study recruitment and opportunities.</p>
        </div>
      )}

      <ul className="mt-4 space-y-4">
        {shown.map((n) => <NewsCard key={n.id} n={n} />)}
      </ul>
    </>
  );
}

export function NewsCard({ n, compact = false }: { n: NewsItem; compact?: boolean }) {
  const k = kindInfo(n.kind);
  const where = [n.is_online ? 'Online' : null, n.location].filter(Boolean).join(' · ');
  return (
    <li className={`card relative flex flex-col p-5 hover:border-green ${compact ? '' : 'sm:p-6'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${k.badgeClass}`}>{k.label}</span>
        <span className="badge bg-paper text-muted ring-1 ring-line">{n.scope === 'international' ? 'International' : 'National'}</span>
        {n.members_only && (
          <span className="badge bg-controlled text-controlled-ink">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            Members only
          </span>
        )}
      </div>
      <h3 className={`mt-3 leading-snug ${compact ? 'text-lg' : 'text-xl'}`}>
        <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-ink no-underline after:absolute after:inset-0 hover:underline">
          {n.title}<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </h3>
      <p className="mt-1 text-sm font-semibold text-green">{whenText(n)}</p>
      {(n.organisation || where) && <p className="mt-1 text-sm text-muted">{[n.organisation, where].filter(Boolean).join(' · ')}</p>}
      {!compact && <p className="mt-3 text-sm leading-relaxed text-[#33403a]">{n.summary}</p>}
      {!compact && n.kind === 'recruitment' && n.ethics_reference && (
        <p className="mt-2 text-xs text-muted">Ethics approval: {n.ethics_committee}, {n.ethics_reference}</p>
      )}
      <p aria-hidden="true" className="mt-auto pt-3 text-sm font-semibold text-green underline">
        More information <span className="no-underline">↗</span>
        <span className="ml-1 font-normal text-muted no-underline">{new URL(n.url).hostname.replace(/^www\./, '')}</span>
      </p>
    </li>
  );
}

// Link shown above the list.
export function ShareNewsLink() {
  return <a href={withBase('/news/submit/')} className="btn-primary">Share news or an event</a>;
}
