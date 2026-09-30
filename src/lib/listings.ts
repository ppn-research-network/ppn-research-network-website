// Fixed options that the database enforces with check constraints, and small
// display helpers shared by the directories, detail pages and admin.
// (Editable pick-lists live in the vocab_terms table instead; see vocab.ts.)
import { labelFor, type Vocab } from './vocab';

export const STATES = [
  { code: 'ACT', label: 'Australian Capital Territory' },
  { code: 'NSW', label: 'New South Wales' },
  { code: 'NT', label: 'Northern Territory' },
  { code: 'QLD', label: 'Queensland' },
  { code: 'SA', label: 'South Australia' },
  { code: 'TAS', label: 'Tasmania' },
  { code: 'VIC', label: 'Victoria' },
  { code: 'WA', label: 'Western Australia' },
] as const;

export function stateName(code: string): string {
  return STATES.find((s) => s.code === code)?.label ?? code;
}

export type AccessLevel = 'open' | 'registered' | 'controlled' | 'collaboration';

// Ordered from most to least open.
export const ACCESS_LEVELS: {
  code: AccessLevel;
  label: string;
  badge: string;
  description: string;
  badgeClass: string;
}[] = [
  {
    code: 'open',
    label: 'Open',
    badge: 'Open access',
    description: 'Anyone can download it from a public repository.',
    badgeClass: 'bg-open text-open-ink',
  },
  {
    code: 'registered',
    label: 'Registered',
    badge: 'Registered access',
    description: 'Available once users register or agree to terms.',
    badgeClass: 'bg-registered text-registered-ink',
  },
  {
    code: 'controlled',
    label: 'Controlled',
    badge: 'Controlled access',
    description: 'Available on request, after an application is approved.',
    badgeClass: 'bg-controlled text-controlled-ink',
  },
  {
    code: 'collaboration',
    label: 'Collaboration only',
    badge: 'Collaboration only',
    description: 'Shared as part of a collaboration with the study team.',
    badgeClass: 'bg-collab text-collab-ink',
  },
];

export function accessLevel(code: string) {
  return ACCESS_LEVELS.find((a) => a.code === code) ?? ACCESS_LEVELS[3];
}

// Levels in most-to-least-open order.
export function sortLevels(levels: string[]): string[] {
  const order = ACCESS_LEVELS.map((a) => a.code as string);
  return [...levels].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// One badge for a dataset: its level, or "Mixed access" when it offers several.
export function accessBadge(levels: string[]): { text: string; className: string } {
  if (levels.length === 1) {
    const a = accessLevel(levels[0]);
    return { text: a.badge, className: a.badgeClass };
  }
  return { text: 'Mixed access', className: 'bg-card text-ink ring-1 ring-line' };
}

export const CONSENT_OPTIONS = [
  { code: 'yes', label: 'Yes' },
  { code: 'partly', label: 'Partly' },
  { code: 'unsure', label: 'Unsure' },
] as const;

export function consentLabel(code: string): string {
  return CONSENT_OPTIONS.find((c) => c.code === code)?.label ?? code;
}

// "Dr Priya Nair" from the stored title code and name.
export function displayName(vocab: Vocab, honorific: string | null, fullName: string): string {
  return honorific ? `${labelFor(vocab, 'honorific', honorific)} ${fullName}` : fullName;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatNumber(n: number | null | undefined): string {
  return n == null ? '' : n.toLocaleString('en-AU');
}
