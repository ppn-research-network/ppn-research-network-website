import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isCurrent, keyDate, type NewsItem } from '../../lib/news';
import { withBase } from '../../lib/url';
import { NewsCard } from './NewsList';

// Home page: the next three current items. Renders nothing until something is posted.
export default function LatestNews() {
  const [rows, setRows] = useState<NewsItem[]>([]);

  useEffect(() => {
    supabase.from('listed_news').select('*').eq('members_only', false)
      .then(({ data }) => setRows(((data as NewsItem[]) ?? []).filter(isCurrent).sort((a, b) => keyDate(a).localeCompare(keyDate(b))).slice(0, 3)));
  }, []);

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="news-heading" className="mx-auto max-w-6xl px-5 pt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="news-heading" className="text-3xl">Latest news and events</h2>
        <a href={withBase('/news/')} className="text-sm font-semibold">See all news and events <span aria-hidden="true">→</span></a>
      </div>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {rows.map((n) => <NewsCard key={n.id} n={n} compact />)}
      </ul>
    </section>
  );
}
