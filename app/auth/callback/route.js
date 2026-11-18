import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { setGoogleTokenCookies } from "@/app/auth/google-tokens";

// OAuth + email-confirmation landing route.
// Supabase redirects here with ?code=... after Google sign-in or email confirmation
// (or ?token_hash=...&type=... if the email template links here directly).
// NOTE: https://<your-domain>/auth/callback must be listed under
// Supabase -> Authentication -> URL Configuration -> Redirect URLs.

const EMAIL_OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

// Only allow same-origin relative paths. Rejects "//evil.com", "/\evil.com",
// "/%5Cevil.com"-style tricks and anything that resolves to another origin.
function safeRedirectPath(next, origin) {
  if (!next || typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) {
    return "/dashboard";
  }
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeRedirectPath(searchParams.get("next"), origin);
  const fail = (reason) =>
    NextResponse.redirect(new URL(`/login?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`, origin));

  // Provider / Supabase reported an error (e.g. user cancelled Google consent,
  // or this redirect URL is not on the Supabase allow-list).
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    console.error("OAuth callback provider error:", providerError);
    return fail("provider_error");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    console.error("OAuth callback config error:", e.message);
    return fail("server_misconfigured");
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Most common cause in prod: the PKCE code-verifier cookie is missing because
      // sign-in started on a different domain (e.g. localhost or a preview URL)
      // than the one Supabase redirected back to.
      console.error("OAuth callback exchange error:", error.message);
      return fail("exchange_failed");
    }
    setGoogleTokenCookies(await cookies(), data?.session);
    return NextResponse.redirect(new URL(next, origin));
  }

  if (tokenHash && EMAIL_OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("Email confirmation error:", error.message);
      return fail("otp_failed");
    }
    return NextResponse.redirect(new URL(next, origin));
  }

  return fail("missing_code");
}
