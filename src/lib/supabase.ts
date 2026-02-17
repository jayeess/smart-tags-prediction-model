import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ── Supabase Client ─────────────────────────────────────── */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

/**
 * Returns the Supabase client if credentials are configured.
 * Returns null if VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing,
 * which means the app falls back to localStorage-only mode.
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

/** Check if Supabase is configured (env vars present) */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

/** Quick connectivity test — tries a lightweight query */
export async function testSupabaseConnection(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("analysis_history")
      .select("id", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
}
