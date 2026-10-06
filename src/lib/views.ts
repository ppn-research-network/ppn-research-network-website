import { supabase } from './supabase';

// Counts one view per listing per browser per day. Nothing about the visitor is
// sent or stored; automated browsers (robots, test tools) are skipped.
export function recordView(kind: 'dataset' | 'profile', id: string) {
  try {
    if (navigator.webdriver) return;
    const key = `viewed:${kind}:${id}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    // Storage blocked (e.g. private mode): still count, at most once per page load.
  }
  supabase.rpc('record_view', { p_kind: kind, p_id: id }).then(() => undefined);
}
