import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// OAuth + email-confirmation landing route.
// Supabase redirects here with ?code=... after Google sign-in or email confirmation.
// NOTE: this URL (https://<your-domain>/auth/callback) must be listed under
// Supabase → Authentication → URL Configuration → Redirect URLs.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
    console.error("OAuth callback error:", error.message);
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
}
