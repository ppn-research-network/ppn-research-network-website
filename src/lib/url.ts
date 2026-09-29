// Builds a link that works whatever the site's base path is (see site.config.mjs).
// Always use this for internal links: withBase('/data') rather than '/data'.
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}
