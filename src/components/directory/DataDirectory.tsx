import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { filterOptions, labelFor, loadVocab, type FilterOption, type Vocab } from '../../lib/vocab';
import { ACCESS_LEVELS, STATES, accessBadge, formatNumber, stateName } from '../../lib/listings';
import type { PublicDataset } from '../../lib/types';
import { withBase } from '../../lib/url';
import { SearchBar, Checkbox, FilterHeading, useUrlState, matchesSearch, LoadError, Loading } from './common';

const PAGE = 10;

type Sort = 'recent' | 'title' | 'size';

export default function DataDirectory() {
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [rows, setRows] = useState<PublicDataset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const [state, update, clear] = useUrlState({
    q: '',
    type: [] as string[],     // data type filter keys
    bio: false as boolean,    // biospecimens available
    access: [] as string[],
    design: [] as string[],   // study design filter keys
    where: '',                // state or territory
    sort: 'recent' as Sort,
  });

  useEffect(() => {
    Promise.all([loadVocab(), supabase.from('public_datasets').select('*')])
      .then(([v, { data, error }]) => {
        if (error) throw error;
        setVocab(v);
        setRows(data as PublicDataset[]);
      })
      .catch(() => setFailed(true));
  }, []);

  const typeOptions = useMemo(() => (vocab ? filterOptions(vocab, 'data_type') : []), [vocab]);
  const designOptions = useMemo(() => (vocab ? filterOptions(vocab, 'study_design') : []), [vocab]);

  const results = useMemo(() => {
    if (!rows || !vocab) return [];
    const codesFor = (options: FilterOption[], keys: string[]) =>
      options.filter((o) => keys.includes(o.key)).flatMap((o) => o.codes);
    const typeCodes = codesFor(typeOptions, state.type);
    const designCodes = codesFor(designOptions, state.design);

    const filtered = rows.filter((d) => {
      if (typeCodes.length && !d.data_types.some((t) => typeCodes.includes(t))) return false;
      if (state.bio && !d.biospecimens) return false;
      if (state.access.length && !d.access_levels.some((a) => state.access.includes(a))) return false;
      if (designCodes.length && !designCodes.includes(d.study_design)) return false;
      if (state.where && d.state !== state.where) return false;
      return matchesSearch(state.q, [
        d.title, d.summary, d.keywords.join(' '), d.lead_institution, d.state, stateName(d.state),
        d.population, d.age_range, d.data_types_other, d.biospecimens_details, d.contact_name, d.contact_role,
        d.data_types.map((t) => labelFor(vocab, 'data_type', t)).join(' '),
        labelFor(vocab, 'study_design', d.study_design),
        d.access_levels.map((a) => ACCESS_LEVELS.find((l) => l.code === a)?.badge).join(' '),
      ]);
    });

    return filtered.sort((a, b) => {
      if (state.sort === 'title') return a.title.localeCompare(b.title);
      if (state.sort === 'size') return (b.sample_size ?? 0) - (a.sample_size ?? 0);
      return (b.listed_at ?? '').localeCompare(a.listed_at ?? '');
    });
  }, [rows, vocab, state, typeOptions, designOptions]);

  useEffect(() => setShown(PAGE), [state]);

  const toggleIn = (key: 'type' | 'access' | 'design', value: string, on: boolean) =>
    update({ [key]: on ? [...state[key], value] : state[key].filter((x) => x !== value) });

  const filterCount = state.type.length + state.access.length + state.design.length + (state.bio ? 1 : 0) + (state.where ? 1 : 0);

  return (
    <>
      <SearchBar
        value={state.q}
        onChange={(q) => update({ q })}
        placeholder="Search titles, keywords, institutions or methods"
        mobilePlaceholder="Search datasets"
        resultsId="results"
      />

      <div className="mt-4 flex gap-3 lg:hidden">
        <button
          type="button"
          className="btn-secondary flex-1"
          aria-expanded={showFilters}
          aria-controls="data-filters"
          onClick={() => setShowFilters(!showFilters)}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filters{filterCount > 0 && ` (${filterCount})`}
        </button>
        <SortSelect value={state.sort} onChange={(sort) => update({ sort })} className="flex-1" />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[13rem_1fr]">
        <aside
          id="data-filters"
          aria-label="Filters"
          className={`${showFilters ? 'block' : 'hidden'} space-y-7 rounded-xl border border-line bg-card p-5 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
        >
          {vocab && (
            <>
              <fieldset>
                <FilterHeading>Data type</FilterHeading>
                <div className="space-y-2.5">
                  {typeOptions.map((o) => (
                    <Checkbox key={o.key} label={o.label} checked={state.type.includes(o.key)} onChange={(on) => toggleIn('type', o.key, on)} />
                  ))}
                  <Checkbox label="Biospecimens available" checked={state.bio} onChange={(bio) => update({ bio })} />
                </div>
              </fieldset>
              <fieldset>
                <FilterHeading>Access level</FilterHeading>
                <div className="space-y-2.5">
                  {ACCESS_LEVELS.map((a) => (
                    <Checkbox key={a.code} label={a.label} checked={state.access.includes(a.code)} onChange={(on) => toggleIn('access', a.code, on)} />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <FilterHeading>Study design</FilterHeading>
                <div className="space-y-2.5">
                  {designOptions.map((o) => (
                    <Checkbox key={o.key} label={o.label} checked={state.design.includes(o.key)} onChange={(on) => toggleIn('design', o.key, on)} />
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="filter-state" className="mb-3 block text-xs font-semibold tracking-widest text-muted uppercase">State or territory</label>
                <select id="filter-state" className="input !mt-0 !min-h-9 !py-1 text-sm" value={state.where} onChange={(e) => update({ where: e.target.value })}>
                  <option value="">All of Australia</option>
                  {STATES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
              {filterCount > 0 && (
                <button type="button" className="text-sm font-semibold text-green underline" onClick={clear}>Clear all filters</button>
              )}
            </>
          )}
        </aside>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p id="results" tabIndex={-1} className="text-sm text-muted" role="status" aria-live="polite">
              {rows && vocab && (
                <><strong className="text-ink">{results.length}</strong> {results.length === 1 ? 'dataset' : 'datasets'}</>
              )}
            </p>
            <SortSelect value={state.sort} onChange={(sort) => update({ sort })} className="hidden lg:flex" />
          </div>

          {failed && <LoadError what="datasets" />}
          {!failed && (!rows || !vocab) && <Loading what="datasets" />}

          {rows && vocab && results.length === 0 && (
            <div className="card mt-4 p-8 text-center">
              <p className="font-semibold">No datasets match your search.</p>
              <p className="mt-2 text-sm text-muted">Try fewer words or remove a filter.</p>
              <button type="button" className="btn-secondary mt-5" onClick={clear}>Clear search and filters</button>
            </div>
          )}

          <ul className="mt-4 space-y-4">
            {vocab && results.slice(0, shown).map((d) => <DatasetCard key={d.id} d={d} vocab={vocab} />)}
          </ul>

          {results.length > shown && (
            <div className="mt-6 text-center">
              <button type="button" className="font-semibold text-green underline" onClick={() => setShown(shown + PAGE)}>
                Show more datasets
              </button>
            </div>
          )}

          <a href={withBase('/submit/')} className="btn-primary mt-8 w-full sm:hidden">Submit a dataset</a>
        </div>
      </div>
    </>
  );
}

function SortSelect({ value, onChange, className = '' }: { value: Sort; onChange: (s: Sort) => void; className?: string }) {
  return (
    <label className={`items-center gap-2 text-sm text-muted ${className}`}>
      <span className="sr-only lg:not-sr-only">Sort by</span>
      <select className="input !mt-0 !min-h-11 w-full !py-1 text-sm lg:!min-h-8 lg:w-auto" value={value} onChange={(e) => onChange(e.target.value as Sort)}>
        <option value="recent">Recently added</option>
        <option value="title">Title A–Z</option>
        <option value="size">Largest sample</option>
      </select>
    </label>
  );
}

function DatasetCard({ d, vocab }: { d: PublicDataset; vocab: Vocab }) {
  const badge = accessBadge(d.access_levels);
  const tags = [...d.data_types.map((t) => labelFor(vocab, 'data_type', t)), ...(d.biospecimens ? ['Biospecimens'] : [])];
  const href = withBase(`/data/dataset/?slug=${encodeURIComponent(d.slug)}`);

  return (
    <li className="card relative p-5 hover:border-green sm:p-6">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl leading-snug">
            <a href={href} className="text-ink no-underline after:absolute after:inset-0 hover:underline">{d.title}</a>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {d.lead_institution} · {d.state}
            {d.sample_size != null && <span className="sm:hidden"> · n = {formatNumber(d.sample_size)}</span>}
          </p>
        </div>
        <span className={`badge shrink-0 self-start ${badge.className}`}>{badge.text}</span>
      </div>
      <p className="mt-3 hidden text-sm leading-relaxed text-[#33403a] sm:block">{d.summary}</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Data available">
        {tags.map((t, i) => <li key={t} className={`tag ${i >= 2 ? 'hidden sm:inline-flex' : ''}`}>{t}</li>)}
        {tags.length > 2 && <li className="tag sm:hidden">+{tags.length - 2} more</li>}
      </ul>
      <div className="mt-4 hidden items-center justify-between gap-4 border-t border-line pt-4 text-sm text-muted sm:flex">
        <p className="flex flex-wrap gap-x-6">
          <span>{labelFor(vocab, 'study_design', d.study_design)}</span>
          {d.sample_size != null && <span>n = {formatNumber(d.sample_size)}</span>}
          {d.years_collected && <span>{d.years_collected}</span>}
        </p>
        <span aria-hidden="true" className="font-semibold whitespace-nowrap text-green underline">View dataset →</span>
      </div>
    </li>
  );
}
