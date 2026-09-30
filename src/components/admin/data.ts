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
  status: 'queued' | 'sent' | 'failed' | 'blocked' | 'skipped';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface Member {
  id: string;
  email: string;
  full_name: string;
  institution: string;
  country: string;
  role: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'declined' | 'revoked';
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

export interface Revision {
  id: string;
  dataset_id: string | null;
  profile_id: string | null;
  proposed: Record<string, unknown>;
  ethics_reference: string | null;
  owner_note: string | null;
  status: 'pending' | 'question' | 'approved' | 'declined' | 'cancelled';
  admin_note: string | null;
  submitted_email: string;
  submitted_at: string;
}

export interface AdminResource {
  id: string;
  title: string;
  category: string;
  kind: 'link' | 'file';
  url: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  presenter: string | null;
  event_date: string | null;
  duration: string | null;
  shared_by_name: string;
  shared_by_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  review_note: string | null;
  created_at: string;
}

export interface AdminData {
  datasets: AdminDataset[];
  profiles: AdminProfile[];
  datasetEmails: Record<string, string>;
  profileEmails: Record<string, string>;
  requests: ContactRequest[];
  members: Member[];
  revisions: Revision[];
  resources: AdminResource[];
}

export function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [d, dc, p, pc, r, m, rv, rs] = await Promise.all([
      supabase.from('datasets').select('*').order('submitted_at', { ascending: false }),
      supabase.from('dataset_contacts').select('dataset_id, email'),
      supabase.from('profiles').select('*').order('submitted_at', { ascending: false }),
      supabase.from('profile_contacts').select('profile_id, email'),
      supabase.from('contact_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('members').select('*').order('requested_at', { ascending: false }),
      supabase.from('listing_revisions').select('*').in('status', ['pending', 'question']).order('submitted_at'),
      supabase.from('resources').select('*').order('created_at', { ascending: false }),
    ]);
    const failed = [d, dc, p, pc, r, m, rv, rs].find((x) => x.error);
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
      members: m.data as Member[],
      revisions: rv.data as Revision[],
      resources: rs.data as AdminResource[],
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

// Generic admin update on the newer tables, reporting a refused change.
async function updateRow(tableName: 'members' | 'listing_revisions' | 'resources', id: string, changes: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.from(tableName).update(changes).eq('id', id).select('id');
  if (error) return error.message;
  return data?.length ? null : 'The change was not saved. Check you are still signed in as an admin.';
}

export const setMemberStatus = (id: string, status: Member['status'], note?: string) =>
  updateRow('members', id, { status, ...(note !== undefined ? { review_note: note.trim() || null } : {}) });

export const setRevisionStatus = (id: string, status: 'declined' | 'question', note: string) =>
  updateRow('listing_revisions', id, { status, admin_note: note.trim() });

export async function approveRevision(id: string, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('approve_revision', { p_revision_id: id, p_note: note });
  return error ? error.message : null;
}

export const setResourceStatus = (id: string, status: AdminResource['status'], note?: string) =>
  updateRow('resources', id, { status, ...(note !== undefined ? { review_note: note.trim() || null } : {}) });
