import { CONTACT_EMAIL } from '../../../site.config.mjs';
import { ACCESS_LEVELS } from '../../lib/listings';
import { TextArea, TextField } from './Fields';

// Owner edits: notes only the admins see.

export interface OwnerExtra {
  ethics: string;
  note: string;
}

// True when the proposed levels include one more open than any offered now.
export function moreOpen(proposed: string[], live: string[]): boolean {
  const rank = (levels: string[]) =>
    Math.min(...levels.map((l) => ACCESS_LEVELS.findIndex((a) => a.code === l)).filter((i) => i >= 0), 99);
  return proposed.length > 0 && rank(proposed) < rank(live);
}

export function OwnerNotes({ extra, onChange, needsEthics = false, error }: {
  extra: OwnerExtra;
  onChange: (e: OwnerExtra) => void;
  needsEthics?: boolean;
  error?: string;
}) {
  return (
    <section aria-labelledby="owner-notes" className="space-y-5 rounded-xl bg-band p-5 sm:p-6">
      <h2 id="owner-notes" className="flex items-center gap-2 font-sans text-sm font-semibold">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        For the admin only, not shown on the listing
      </h2>
      {needsEthics && (
        <TextField
          name="ethics" label="Ethics approval for this change" required
          hint="Needed when access becomes more open. Reference and date of the amendment."
          placeholder="e.g. HREC amendment 2026/123, approved 1 March 2026"
          value={extra.ethics} onChange={(ethics) => onChange({ ...extra, ethics })} error={error}
        />
      )}
      <TextArea
        name="owner_note" label="What changed?" maxLength={2000} rows={3}
        hint="A sentence or two helps the admin review your update quickly."
        value={extra.note} onChange={(note) => onChange({ ...extra, note })}
      />
    </section>
  );
}

export function ReadOnlyEmail({ email }: { email: string }) {
  return (
    <div>
      <span className="field-label">Email</span>
      <span className="field-hint">Never shown on the site. To change it, email the admins at {CONTACT_EMAIL}.</span>
      <p className="input !flex items-center bg-band text-muted">{email}</p>
    </div>
  );
}
