import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { activeTerms, labelFor, loadVocab, type Vocab } from '../../lib/vocab';
import { STATES, displayName, initials, stateName } from '../../lib/listings';
import type { PublicProfile } from '../../lib/types';
import { withBase } from '../../lib/url';
import { SearchBar, LoadError, Loading, matchesSearch, useUrlState } from './common';

const PAGE = 12;

// Avatar and discipline colours, cycling through the palette by discipline.
const TINTS = [
  { avatar: 'bg-controlled text-controlled-ink', text: 'text-controlled-ink' },
  { avatar: 'bg-registered text-registered-ink', text: 'text-registered-ink' },
  { avatar: 'bg-open text-open-ink', text: 'text-open-ink' },
  { avatar: 'bg-collab text-collab-ink', text: 'text-collab-ink' },
];

export function tintFor(vocab: Vocab, discipline: string) {
  const i = vocab.discipline.findIndex((t) => t.code === discipline);
  return TINTS[Math.max(i, 0) % TINTS.length];
}

// "Open to collaboration, advice"
export function openToText(vocab: Vocab, codes: string[]): string {
  if (codes.length === 0) return '';
  const labels = codes.map((c) => labelFor(vocab, 'open_to', c).toLowerCase());
  return `Open to ${labels.join(', ')}`;
}

export default function SkillsDirectory() {
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [rows, setRows] = useState<PublicProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const [state, update] = useUrlState({
    q: '',
    discipline: '',
    where: '',
    open: '',
    stage: '',
  });

  useEffect(() => {
    Promise.all([loadVocab(), supabase.from('public_profiles').select('*').order('listed_at', { ascending: false })])
      .then(([v, { data, error }]) => {
        if (error) throw error;
        setVocab(v);
        setRows(data as PublicProfile[]);
      })
      .catch(() => setFailed(true));
  }, []);

  const results = useMemo(() => {
    if (!rows || !vocab) return [];
    return rows.filter((p) => {
      if (state.discipline && p.discipline !== state.discipline) return false;
      if (state.where && p.state !== state.where) return false;
      if (state.open && !p.open_to.includes(state.open)) return false;
      if (state.stage && p.career_stage !== state.stage) return false;
      return matchesSearch(state.q, [
        displayName(vocab, p.honorific, p.full_name), p.role, p.institution, p.state, stateName(p.state), p.bio,
        p.skills.join(' '),
        labelFor(vocab, 'discipline', p.discipline),
        labelFor(vocab, 'career_stage', p.career_stage),
        p.looking_for.map((c) => labelFor(vocab, 'looking_for', c)).join(' '),
      ]);
    });
  }, [rows, vocab, state]);

  useEffect(() => setShown(PAGE), [state]);

  return (
    <>
      <SearchBar
        value={state.q}
        onChange={(q) => update({ q })}
        placeholder="Search by skill, method or name, such as “shotgun metagenomics”"
        mobilePlaceholder="Search people"
        resultsId="results"
      />

      {vocab && (
        <nav aria-label="Discipline" className="mt-5">
          <ul className="flex flex-wrap gap-2">
            {[{ code: '', label: 'All disciplines' }, ...activeTerms(vocab, 'discipline')].map((d) => {
              const on = state.discipline === d.code;
              return (
                <li key={d.code || 'all'}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => update({ discipline: d.code })}
                    className={`min-h-10 rounded-full border px-4 text-sm ${on ? 'border-green bg-green font-semibold text-white' : 'border-line bg-card text-ink hover:border-green'}`}
                  >
                    {d.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="results" tabIndex={-1} className="text-sm text-muted" role="status" aria-live="polite">
          {rows && vocab && <><strong className="text-ink">{results.length}</strong> {results.length === 1 ? 'person' : 'people'}</>}
        </p>
        {vocab && (
          <div className="grid grid-cols-3 gap-2 text-sm text-muted sm:flex sm:items-center sm:gap-4">
            <SmallSelect label="State" value={state.where} onChange={(where) => update({ where })}
              options={[{ code: '', label: 'All' }, ...STATES.map((s) => ({ code: s.code, label: s.code }))]} />
            <SmallSelect label="Open to" value={state.open} onChange={(open) => update({ open })}
              options={[{ code: '', label: 'Anything' }, ...activeTerms(vocab, 'open_to')]} />
            <SmallSelect label="Career stage" value={state.stage} onChange={(stage) => update({ stage })}
              options={[{ code: '', label: 'Any' }, ...activeTerms(vocab, 'career_stage')]} />
          </div>
        )}
      </div>

      {failed && <LoadError what="profiles" />}
      {!failed && (!rows || !vocab) && <Loading what="profiles" />}

      {rows && vocab && results.length === 0 && (
        <div className="card mt-4 p-8 text-center">
          <p className="font-semibold">No one matches your search yet.</p>
          <p className="mt-2 text-sm text-muted">Try fewer words, another discipline or a different filter.</p>
        </div>
      )}

      <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {vocab && results.slice(0, shown).map((p) => <ProfileCard key={p.id} p={p} vocab={vocab} />)}
      </ul>

      {results.length > shown && (
        <div className="mt-6 text-center">
          <button type="button" className="font-semibold text-green underline" onClick={() => setShown(shown + PAGE)}>
            Show more people
          </button>
        </div>
      )}

      <a href={withBase('/submit/profile/')} className="btn-primary mt-8 w-full sm:hidden">Join the directory</a>
    </>
  );
}

function SmallSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { code: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-xs sm:text-sm">{label}</span>
      <select className="input !mt-0 !min-h-10 !py-1 text-sm sm:!min-h-8 sm:w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ProfileCard({ p, vocab }: { p: PublicProfile; vocab: Vocab }) {
  const tint = tintFor(vocab, p.discipline);
  const href = withBase(`/skills/profile/?slug=${encodeURIComponent(p.slug)}`);
  const openTo = openToText(vocab, p.open_to);
  return (
    <li className="card relative flex flex-col p-5 hover:border-green sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tint.avatar}`} aria-hidden="true">
          {initials(p.full_name)}
        </span>
        <div>
          <h2 className="font-sans text-lg leading-snug font-semibold">
            <a href={href} className="text-ink no-underline after:absolute after:inset-0 hover:underline">
              {displayName(vocab, p.honorific, p.full_name)}
            </a>
          </h2>
          <p className="text-sm text-muted">{p.role} · {p.institution} · {p.state}</p>
        </div>
      </div>
      <p className={`mt-4 text-sm font-semibold ${tint.text}`}>{labelFor(vocab, 'discipline', p.discipline)}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#33403a]">{p.bio}</p>
      {p.skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Skills">
          {p.skills.slice(0, 5).map((s) => <li key={s} className="tag">{s}</li>)}
          {p.skills.length > 5 && <li className="tag">+{p.skills.length - 5} more</li>}
        </ul>
      )}
      <div className="flex-1" />
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm text-muted">
        <span>{openTo}</span>
        <span aria-hidden="true" className="font-semibold whitespace-nowrap text-green underline">Get in touch →</span>
      </div>
    </li>
  );
}
