
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabaseClient = null;
let supabaseClientPromise = null;

export function hasInitializedSupabaseClient() {
  return !!supabaseClient;
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured) return null;
  if (supabaseClient) return supabaseClient;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        return supabaseClient;
      })
      .catch((error) => {
        supabaseClientPromise = null;
        throw error;
      });
  }
  return supabaseClientPromise;
}
