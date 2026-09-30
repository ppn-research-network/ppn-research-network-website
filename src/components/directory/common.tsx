import { useEffect, useState, type ReactNode } from 'react';
import { CONTACT_EMAIL } from '../../../site.config.mjs';

// Pieces shared by the data and skills directories.

// Results update as you type; the Search button takes you to the results.
export function SearchBar({ value, onChange, placeholder, mobilePlaceholder, resultsId }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mobilePlaceholder?: string;
  resultsId: string;
}) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => setNarrow(window.matchMedia('(max-width: 639px)').matches), []);
  return (
    <form
      role="search"
      className="flex items-center gap-2 rounded-xl border border-line bg-card p-1.5 pl-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); document.getElementById(resultsId)?.focus(); }}
    >
      <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={narrow && mobilePlaceholder ? mobilePlaceholder : placeholder}
          className="min-h-10 w-full bg-transparent outline-none placeholder:text-muted"
        />
      </label>
      <button type="submit" className="btn-primary hidden sm:inline-flex">Search</button>
    </form>
  );
}

export function FilterHeading({ children }: { children: ReactNode }) {
  return <legend className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{children}</legend>;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="choice text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="card mt-4 p-8 text-center text-muted" role="status">Loading {what}…</p>;
}

export function LoadError({ what }: { what: string }) {
  return (
    <div className="card mt-4 p-8 text-center" role="alert">
      <p className="font-semibold">The {what} could not load.</p>
      <p className="mt-2 text-sm text-muted">Check your internet connection and refresh the page. If it keeps happening, email {CONTACT_EMAIL}.</p>
    </div>
  );
}

// Every word typed must appear somewhere in the listing.
export function matchesSearch(q: string, fields: (string | null | undefined)[]): boolean {
  const words = q.toLowerCase().replace(/["“”]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}

// Search and filter state kept in the page address (e.g. ?q=cgm&access=open),
// so a filtered view can be bookmarked or shared.
type UrlValue = string | boolean | string[];

export function useUrlState<T extends Record<string, UrlValue>>(defaults: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaults;
    const params = new URLSearchParams(window.location.search);
    const initial = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = params.get(key);
      if (raw == null) continue;
      const d = defaults[key];
      initial[key] = (Array.isArray(d) ? raw.split(',').filter(Boolean) : typeof d === 'boolean' ? raw === '1' : raw) as T[typeof key];
    }
    return initial;
  });

  const write = (next: T) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === defaults[key] || (Array.isArray(value) && value.length === 0)) continue;
      if (Array.isArray(value)) params.set(key, value.join(','));
      else if (typeof value === 'boolean') { if (value) params.set(key, '1'); }
      else if (value) params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  };

  const update = (partial: Partial<T>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      write(next);
      return next;
    });
  };

  const clear = () => {
    setState((prev) => {
      const next = { ...defaults, sort: (prev as Record<string, UrlValue>).sort ?? defaults.sort } as T;
      write(next);
      return next;
    });
  };

  return [state, update, clear] as const;
}
