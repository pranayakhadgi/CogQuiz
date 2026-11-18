import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_* values are inlined at BUILD time, so they must be set in the
// Vercel project (Production + Preview) before deploying, then redeployed.
// They must be referenced literally (not via process.env[name]) to be inlined.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set at build time.",
    );
  }
  // createBrowserClient returns a singleton in the browser.
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
