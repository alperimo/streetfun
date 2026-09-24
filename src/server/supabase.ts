import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase instance using Secret key (replaces legacy service_role key).
 * Use strictly in API routes, background workers, and Helius webhooks.
 */
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && secretKey) {
    return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return null;
}
