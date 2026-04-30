import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Server-only Supabase client that bypasses Row Level Security.
 * Falls back to the anon client when SUPABASE_SERVICE_ROLE_KEY is not set
 * so local/dev environments without RLS keep working.
 *
 * NEVER import this in client components.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      if (!supabaseUrl) {
        throw new Error(
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL."
        );
      }
      const key = supabaseServiceRoleKey || supabaseAnonKey;
      if (!key) {
        throw new Error(
          "Supabase is not configured. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }
      _supabaseAdmin = createClient(supabaseUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return (_supabaseAdmin as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Check if Supabase is properly configured.
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}
