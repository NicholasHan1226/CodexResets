import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Lazily create the Supabase client via dynamic import.
 * Keeps vendor-supabase (~57KB gzip) off the first-paint critical path —
 * it loads in parallel with the first data fetch instead of blocking render.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return Promise.reject(
        new Error(
          "Supabase environment variables not configured. " +
          "Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set."
        )
      );
    }
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl, supabaseAnonKey)
    );
  }
  return clientPromise;
}
