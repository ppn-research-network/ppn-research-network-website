import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { withBase } from './url';

// The signed-in person (or null), kept up to date as they sign in and out.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, email: session?.user.email?.toLowerCase() ?? '' };
}

// Emails a one-time sign-in link that brings the person back to `returnTo`.
// Anyone can get a link; what they can see depends on their email
// (listing owner, member, admin), which the database checks.
export async function sendSignInLink(email: string, returnTo: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + withBase(returnTo) },
  });
  if (!error) return null;
  if (error.status === 429) return 'Too many sign-in emails have been sent. Please wait a few minutes and try again.';
  return 'We could not send a sign-in link just now. Please try again shortly.';
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = withBase('/');
}

export type Membership = { status: 'pending' | 'approved' | 'declined' | 'revoked'; full_name: string } | null;

// The signed-in person's own membership row, if any (the database only
// returns their own).
export async function loadMembership(): Promise<Membership> {
  const { data } = await supabase.from('members').select('status, full_name').maybeSingle();
  return (data as Membership) ?? null;
}
