import { createClient } from '@supabase/supabase-js';

// Browser client using the public (publishable) key only. Everything it can do
// is limited by the database's security rules; see supabase/README.md.
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
