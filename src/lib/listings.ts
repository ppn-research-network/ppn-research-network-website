// Fixed options that the database enforces with check constraints.
// (Editable pick-lists live in the vocab_terms table instead; see vocab.ts.)

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

export type AccessLevel = 'open' | 'registered' | 'controlled' | 'collaboration';

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
    description: 'Requires an application and approval, such as by a data access committee.',
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

export const CONSENT_OPTIONS = [
  { code: 'yes', label: 'Yes' },
  { code: 'partly', label: 'Partly' },
  { code: 'unsure', label: 'Unsure' },
] as const;

export const HONORIFICS = ['Dr', 'A/Prof', 'Prof'] as const;
