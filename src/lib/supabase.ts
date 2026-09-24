import { createClient } from "@supabase/supabase-js";

let browserClient: any = null;

/**
 * Client-safe Supabase instance using Publishable key (replaces legacy anon key).
 * Reuses a single shared WebSocket connection across components.
 * Safe to use in React components, hooks, and Realtime WebSocket subscriptions.
 */
export function createBrowserSupabaseClient() {
  if (typeof window !== "undefined" && browserClient) {
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && publishableKey) {
    const client = createClient(url, publishableKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    if (typeof window !== "undefined") {
      browserClient = client;
    }
    return client;
  }
  return null;
}
