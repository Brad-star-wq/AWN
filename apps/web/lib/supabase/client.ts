'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for the browser (Client Components). Used for Realtime
 * subscriptions — the live attribution queue (Phase D). Reads the public anon
 * key; all privileged reads/writes still go through Server Actions + the engine.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
