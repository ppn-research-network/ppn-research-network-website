import { createClient } from '@supabase/supabase-js';

// Browser client using the public (publishable) key only. Everything it can do
// is limited by the database's security rules; see supabase/README.md.
// Sessions are only created by signing in (admin now; owners and members in
// Phase 4b). Sign-in links must be opened in the browser that requested them.
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } },
);
