import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Editable pick-lists from the vocab_terms table. Admins change these in the
// Supabase dashboard; the site always loads them fresh.

export type VocabList =
  | 'study_design'
  | 'data_type'
  | 'access_requirement'
  | 'discipline'
  | 'career_stage'
  | 'looking_for'
  | 'open_to';

export interface VocabTerm {
  list: VocabList;
  code: string;
  label: string;
  filter_group: string | null;
  sort_order: number;
  active: boolean;
}

export type Vocab = Record<VocabList, VocabTerm[]>;

const EMPTY: Vocab = {
  study_design: [],
  data_type: [],
  access_requirement: [],
  discipline: [],
  career_stage: [],
  looking_for: [],
  open_to: [],
};

export async function loadVocab(): Promise<Vocab> {
  const { data, error } = await supabase
    .from('vocab_terms')
    .select('list, code, label, filter_group, sort_order, active')
    .order('sort_order');
  if (error) throw error;

  const vocab: Vocab = structuredClone(EMPTY);
  for (const term of data as VocabTerm[]) vocab[term.list]?.push(term);
  return vocab;
}

// Only options that should appear in forms and filters.
export function activeTerms(vocab: Vocab, list: VocabList): VocabTerm[] {
  return vocab[list].filter((t) => t.active);
}

// Label for a stored code, including hidden (inactive) options.
export function labelFor(vocab: Vocab, list: VocabList, code: string): string {
  return vocab[list].find((t) => t.code === code)?.label ?? code;
}

export function useVocab() {
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadVocab().then(setVocab).catch(() => setFailed(true));
  }, []);

  return { vocab, failed };
}
