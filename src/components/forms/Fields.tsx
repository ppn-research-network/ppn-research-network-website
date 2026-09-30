import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { CONTACT_EMAIL } from '../../../site.config.mjs';
import { supabase } from '../../lib/supabase';
import { withBase } from '../../lib/url';

// Shared building blocks for the submission forms. Every control has a
// visible label, optional hint, and an error message linked by aria-describedby.

export type Errors = Record<string, string>;

const fieldId = (name: string) => `f-${name}`;

function describedBy(name: string, hint?: ReactNode, error?: string) {
  return [hint ? `${fieldId(name)}-hint` : null, error ? `${fieldId(name)}-error` : null]
    .filter(Boolean)
    .join(' ') || undefined;
}

function Hint({ name, children }: { name: string; children?: ReactNode }) {
  return children ? <span id={`${fieldId(name)}-hint`} className="field-hint">{children}</span> : null;
}

function FieldError({ name, error }: { name: string; error?: string }) {
  return error ? <span id={`${fieldId(name)}-error`} className="field-error">{error}</span> : null;
}

function Label({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={fieldId(name)} className="field-label">
      {label}
      {!required && <span className="font-normal text-muted"> (optional)</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------

export function Section({ step, total, title, intro, children }: {
  step: number;
  total: number;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${step}`} className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <p className="eyebrow">Step {step} of {total}</p>
      <h2 id={`step-${step}`} className="mt-1 text-2xl">{title}</h2>
      {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

export function TextField({ name, label, hint, value, onChange, error, required, type = 'text', placeholder, inputMode, autoComplete, maxLength }: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'url' | 'number';
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'url';
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <Label name={name} label={label} required={required} />
      <Hint name={name}>{hint}</Hint>
      <input
        id={fieldId(name)}
        name={name}
        type={type === 'number' ? 'text' : type}
        inputMode={inputMode ?? (type === 'number' ? 'numeric' : undefined)}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete ?? 'off'}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError name={name} error={error} />
    </div>
  );
}

// Terms already used in approved listings, to suggest while typing.
function useUsedTerms(source: 'keywords' | 'skills') {
  const [terms, setTerms] = useState<string[]>([]);
  useEffect(() => {
    const query = source === 'keywords'
      ? supabase.from('public_datasets').select('keywords')
      : supabase.from('public_profiles').select('skills');
    query.then(({ data }) => {
      const seen = new Map<string, string>();
      for (const row of (data ?? []) as Record<string, string[]>[]) {
        for (const t of row[source] ?? []) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
      }
      setTerms([...seen.values()].sort((a, b) => a.localeCompare(b)));
    });
  }, [source]);
  return terms;
}

// Free-text, comma-separated terms, with suggestions from terms others have
// already used. People can always type their own.
export function TagField({ source, name, label, hint, value, onChange, error }: {
  source: 'keywords' | 'skills';
  name: string;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const used = useUsedTerms(source);
  const parts = value.split(',');
  const current = parts[parts.length - 1].trim().toLowerCase();
  const chosen = new Set(parts.slice(0, -1).map((p) => p.trim().toLowerCase()));
  const suggestions = current.length >= 2
    ? used.filter((t) => t.toLowerCase().includes(current) && !chosen.has(t.toLowerCase()) && t.toLowerCase() !== current).slice(0, 6)
    : [];

  const pick = (term: string) => {
    const kept = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
    onChange([...kept, term].join(', ') + ', ');
    document.getElementById(fieldId(name))?.focus();
  };

  return (
    <div>
      <TextField name={name} label={label} hint={hint} value={value} onChange={onChange} error={error} />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-xs text-muted">Already used by others:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => pick(s)} className="tag cursor-pointer hover:ring-1 hover:ring-green">
              <span className="sr-only">Use </span>{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TextArea({ name, label, hint, value, onChange, error, required, maxLength, placeholder, rows = 4 }: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <Label name={name} label={label} required={required} />
      <Hint name={name}>{hint}</Hint>
      <textarea
        id={fieldId(name)}
        name={name}
        className="input"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="mt-1 block text-right text-xs text-muted" aria-live="polite">
        {value.length} / {maxLength} characters
      </span>
      <FieldError name={name} error={error} />
    </div>
  );
}

export function SelectField({ name, label, hint, value, onChange, error, required, options, placeholder = 'Choose one' }: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  options: { code: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <Label name={name} label={label} required={required} />
      <Hint name={name}>{hint}</Hint>
      <select
        id={fieldId(name)}
        name={name}
        className="input"
        value={value}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      <FieldError name={name} error={error} />
    </div>
  );
}

export function CheckboxGroup({ name, legend, hint, values, onChange, error, required, options, columns = 2 }: {
  name: string;
  legend: string;
  hint?: ReactNode;
  values: string[];
  onChange: (v: string[]) => void;
  error?: string;
  required?: boolean;
  options: { code: string; label: string }[];
  columns?: 2 | 3;
}) {
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...values, code] : values.filter((v) => v !== code));
  return (
    <fieldset id={fieldId(name)} tabIndex={-1} aria-describedby={describedBy(name, hint, error)}>
      <legend className="field-label">
        {legend}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </legend>
      <Hint name={name}>{hint}</Hint>
      <div className={`mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
        {options.map((o) => (
          <label key={o.code} className="choice">
            <input type="checkbox" checked={values.includes(o.code)} onChange={(e) => toggle(o.code, e.target.checked)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <FieldError name={name} error={error} />
    </fieldset>
  );
}

export function RadioGroup({ name, legend, hint, value, onChange, error, required, options, inline = true }: {
  name: string;
  legend: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  options: { code: string; label: string }[];
  inline?: boolean;
}) {
  return (
    <fieldset id={fieldId(name)} tabIndex={-1} aria-describedby={describedBy(name, hint, error)}>
      <legend className="field-label">
        {legend}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </legend>
      <Hint name={name}>{hint}</Hint>
      <div className={`mt-3 flex gap-x-6 gap-y-3 ${inline ? 'flex-wrap' : 'flex-col'}`}>
        {options.map((o) => (
          <label key={o.code} className="choice">
            <input type="radio" name={name} value={o.code} checked={value === o.code} onChange={() => onChange(o.code)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <FieldError name={name} error={error} />
    </fieldset>
  );
}

// Tick boxes shown as cards with a description (access levels).
export function CheckboxCards({ name, legend, hint, values, onChange, error, options, marker }: {
  name: string;
  legend: string;
  hint?: ReactNode;
  values: string[];
  onChange: (v: string[]) => void;
  error?: string;
  options: { code: string; label: string; description: string }[];
  marker?: (code: string) => ReactNode;   // e.g. "(current)" on owner edits
}) {
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...values, code] : values.filter((v) => v !== code));
  return (
    <fieldset id={fieldId(name)} tabIndex={-1} aria-describedby={describedBy(name, hint, error)}>
      <legend className="field-label">{legend}</legend>
      <Hint name={name}>{hint}</Hint>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const on = values.includes(o.code);
          return (
            <label
              key={o.code}
              className={`choice rounded-lg border p-4 ${on ? 'border-green bg-tag/60 ring-1 ring-green' : 'border-line bg-card'}`}
            >
              <input type="checkbox" checked={on} onChange={(e) => toggle(o.code, e.target.checked)} />
              <span>
                <span className="block font-semibold">{o.label} {marker?.(o.code)}</span>
                <span className="mt-0.5 block text-sm text-muted">{o.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <FieldError name={name} error={error} />
    </fieldset>
  );
}

export function ConsentBox({ name, checked, onChange, error, children }: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="choice rounded-lg border border-line bg-paper p-4">
        <input
          id={fieldId(name)}
          type="checkbox"
          checked={checked}
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, undefined, error)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{children}</span>
      </label>
      <FieldError name={name} error={error} />
    </div>
  );
}

// Hidden spam trap. People never see or fill it; simple bots do.
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export const ErrorSummary = forwardRef<HTMLDivElement, { errors: Errors; labels: Record<string, string> }>(
  function ErrorSummary({ errors, labels }, ref) {
    const entries = Object.entries(errors);
    if (entries.length === 0) return null;
    return (
      <div ref={ref} tabIndex={-1} role="alert" className="rounded-lg border-2 border-danger bg-card p-5">
        <h2 className="font-sans text-base font-semibold text-danger">
          {entries.length === 1 ? 'There is 1 problem to fix' : `There are ${entries.length} problems to fix`}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {entries.map(([name, message]) => (
            <li key={name}>
              <a href={`#${fieldId(name)}`} className="text-danger">
                {labels[name] ? `${labels[name]}: ` : ''}{message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  },
);

export function PrivacyNotice({ what }: { what: 'dataset' | 'profile' }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      <strong className="font-semibold text-ink">Privacy.</strong>{' '}
      {what === 'dataset'
        ? 'We collect these details to list the dataset and pass on enquiries. Everything except the contact email is shown publicly once approved. '
        : 'We collect these details to list your profile and pass on messages. Everything except your email is shown publicly once approved. '}
      Your email is seen only by the network's admins and our email system, and is used to pass on messages and let you
      update or remove the listing. Read the <a href={withBase('/privacy/')}>privacy notice</a>, or contact{' '}
      {CONTACT_EMAIL} to update or remove your details at any time.
    </p>
  );
}

export function LoadFailed() {
  return (
    <div role="alert" className="card p-6">
      <p className="font-semibold">The form could not load.</p>
      <p className="mt-2 text-sm text-muted">
        Please check your internet connection and refresh the page. If it still doesn't work, email the admins at{' '}
        {CONTACT_EMAIL}.
      </p>
    </div>
  );
}

// Turns a database error into a message a person can act on.
export function friendlyError(error: { code?: string; message?: string }): string {
  if (error.code && ['22023', 'P0001', 'P0002'].includes(error.code) && error.message) return error.message;
  return `Something went wrong and your listing was not sent. Please try again, or email the admins at ${CONTACT_EMAIL}.`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function splitList(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];
}

export function lengthError(value: string, min: number, max: number, what: string): string | undefined {
  const len = value.trim().length;
  if (min > 0 && len === 0) return `Enter ${what}`;
  if (len > 0 && len < min) return `Use at least ${min} characters`;
  if (len > max) return `Use ${max} characters or fewer`;
  return undefined;
}

export function urlError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!/^https?:\/\/\S+\.\S+/.test(v)) return 'Enter a full web address starting with https://';
  if (v.length > 500) return 'Use 500 characters or fewer';
  return undefined;
}
