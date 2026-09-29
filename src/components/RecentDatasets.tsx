import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadVocab, labelFor, type Vocab } from '../lib/vocab';
import { accessLevel } from '../lib/listings';
import { withBase } from '../lib/url';

interface RecentDataset {
  slug: string;
  title: string;
  lead_institution: string;
  state: string;
  study_design: string;
  access_level: string;
}

// Home page: the three most recently approved datasets. Renders nothing until
// at least one dataset has been approved.
export default function RecentDatasets() {
  const [rows, setRows] = useState<RecentDataset[]>([]);
  const [vocab, setVocab] = useState<Vocab | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from('public_datasets')
        .select('slug, title, lead_institution, state, study_design, access_level')
        .order('listed_at', { ascending: false })
        .limit(3),
      loadVocab(),
    ])
      .then(([{ data }, v]) => {
        setRows((data as RecentDataset[]) ?? []);
        setVocab(v);
      })
      .catch(() => setRows([]));
  }, []);

  if (!vocab || rows.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mx-auto max-w-6xl px-5 py-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="recent-heading" className="text-3xl">Recently added datasets</h2>
        <a href={withBase('/data/')} className="text-sm font-semibold">
          See all datasets <span aria-hidden="true">→</span>
        </a>
      </div>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {rows.map((d) => {
          const access = accessLevel(d.access_level);
          return (
            <li key={d.slug} className="card relative p-5 hover:border-green">
              <span className={`badge ${access.badgeClass}`}>{access.badge}</span>
              <h3 className="mt-3 text-xl leading-snug">
                <a
                  href={withBase(`/data/dataset/?slug=${encodeURIComponent(d.slug)}`)}
                  className="text-ink no-underline after:absolute after:inset-0 hover:underline"
                >
                  {d.title}
                </a>
              </h3>
              <p className="mt-3 text-sm text-muted">
                {d.lead_institution} · {d.state} · {labelFor(vocab, 'study_design', d.study_design)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
