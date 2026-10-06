// News and events: shared types, labels and dates.

export type NewsKind = 'news' | 'event' | 'recruitment' | 'opportunity';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  title: string;
  summary: string;
  url: string;
  organisation: string | null;
  scope: 'national' | 'international';
  location: string | null;
  is_online: boolean;
  starts_on: string | null;
  ends_on: string | null;
  closes_on: string | null;
  ethics_reference: string | null;
  ethics_committee: string | null;
  members_only: boolean;
  posted_at: string | null;
}

export const NEWS_KINDS: { code: NewsKind; label: string; plural: string; badgeClass: string }[] = [
  { code: 'news', label: 'News', plural: 'News and publications', badgeClass: 'bg-registered text-registered-ink' },
  { code: 'event', label: 'Event', plural: 'Events and conferences', badgeClass: 'bg-open text-open-ink' },
  { code: 'recruitment', label: 'Study recruitment', plural: 'Study recruitment', badgeClass: 'bg-controlled text-controlled-ink' },
  { code: 'opportunity', label: 'Opportunity', plural: 'Opportunities', badgeClass: 'bg-collab text-collab-ink' },
];

export const kindInfo = (code: string) => NEWS_KINDS.find((k) => k.code === code) ?? NEWS_KINDS[0];

const today = () => new Date().toISOString().slice(0, 10);

// Past events and closed calls move to the archive automatically. News stays
// current for 6 months after posting.
export function isCurrent(n: NewsItem): boolean {
  const t = today();
  if (n.kind === 'event') return (n.ends_on ?? n.starts_on ?? t) >= t;
  if (n.closes_on) return n.closes_on >= t;
  if (n.kind === 'news' && n.posted_at) {
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() - 6);
    return new Date(n.posted_at) >= sixMonths;
  }
  return true;
}

// The date that matters for ordering: when it happens, closes, or was posted.
export function keyDate(n: NewsItem): string {
  return (n.kind === 'event' ? n.starts_on : n.closes_on) ?? n.posted_at?.slice(0, 10) ?? '';
}

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export function whenText(n: NewsItem): string {
  if (n.kind === 'event' && n.starts_on) {
    return n.ends_on && n.ends_on !== n.starts_on ? `${fmt(n.starts_on)} to ${fmt(n.ends_on)}` : fmt(n.starts_on);
  }
  if (n.closes_on) return `Closes ${fmt(n.closes_on)}`;
  return n.posted_at ? `Posted ${fmt(n.posted_at.slice(0, 10))}` : '';
}
