import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { AdminDataset, AdminProfile, ListingStatus } from '../../lib/types';

// Everything the dashboard shows, loaded with the signed-in admin's rights.
// The database's security rules only return rows to admins.

export interface ContactRequest {
  id: string;
  dataset_id: string | null;
  profile_id: string | null;
  sender_name: string;
  sender_email: string;
  sender_institution: string | null;
  message: string;
  status: 'queued' | 'sent' | 'failed' | 'blocked';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface AdminData {
  datasets: AdminDataset[];
  profiles: AdminProfile[];
  datasetEmails: Record<string, string>;
  profileEmails: Record<string, string>;
  requests: ContactRequest[];
}

export function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [d, dc, p, pc, r] = await Promise.all([
      supabase.from('datasets').select('*').order('submitted_at', { ascending: false }),
      supabase.from('dataset_contacts').select('dataset_id, email'),
      supabase.from('profiles').select('*').order('submitted_at', { ascending: false }),
      supabase.from('profile_contacts').select('profile_id, email'),
      supabase.from('contact_requests').select('*').order('created_at', { ascending: false }),
    ]);
    const failed = [d, dc, p, pc, r].find((x) => x.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    setData({
      datasets: d.data as AdminDataset[],
      profiles: p.data as AdminProfile[],
      datasetEmails: Object.fromEntries((dc.data ?? []).map((x) => [x.dataset_id, x.email])),
      profileEmails: Object.fromEntries((pc.data ?? []).map((x) => [x.profile_id, x.email])),
      requests: r.data as ContactRequest[],
    });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { data, error, reload };
}

export type Kind = 'dataset' | 'profile';
const table = (kind: Kind) => (kind === 'dataset' ? 'datasets' : 'profiles');

// Updates must come back with the changed row; if nothing comes back the
// security rules refused, so we say so rather than failing silently.
async function updateListing(kind: Kind, id: string, changes: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.from(table(kind)).update(changes).eq('id', id).select('id');
  if (error) return error.message;
  if (!data?.length) return 'The change was not saved. Check you are still signed in as an admin.';
  return null;
}

export const setStatus = (kind: Kind, id: string, status: ListingStatus, note?: string) =>
  updateListing(kind, id, { status, ...(note !== undefined ? { review_note: note.trim() || null } : {}) });

export const markReviewed = (kind: Kind, id: string) =>
  updateListing(kind, id, { last_reviewed_at: new Date().toISOString() });

export async function saveListing(kind: Kind, id: string, listing: Record<string, unknown>, email: string): Promise<string | null> {
  const problem = await updateListing(kind, id, listing);
  if (problem) return problem;
  const contacts = kind === 'dataset' ? 'dataset_contacts' : 'profile_contacts';
  const key = kind === 'dataset' ? 'dataset_id' : 'profile_id';
  const { error } = await supabase.from(contacts).update({ email: email.toLowerCase() }).eq(key, id);
  return error ? error.message : null;
}

export async function setRequestStatus(id: string, status: ContactRequest['status']): Promise<string | null> {
  const { data, error } = await supabase.from('contact_requests').update({ status }).eq('id', id).select('id');
  if (error) return error.message;
  return data?.length ? null : 'The change was not saved.';
}
