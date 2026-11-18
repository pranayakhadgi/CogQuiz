// Google OAuth tokens returned by Supabase (`provider_token` / `provider_refresh_token`)
// are only present on the session object right after the OAuth code exchange.
// Supabase does NOT persist them, so after the next session refresh they are gone.
// We keep them in httpOnly cookies scoped to the calendar API so the calendar
// route keeps working for the life of the login.

export const GOOGLE_ACCESS_COOKIE = "cq_g_at";
export const GOOGLE_REFRESH_COOKIE = "cq_g_rt";

const baseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/calendar",
};

export function setGoogleTokenCookies(cookieStore, session) {
  if (!session) return;
  if (session.provider_token) {
    // Google access tokens live ~1h; expire the cookie slightly earlier.
    cookieStore.set(GOOGLE_ACCESS_COOKIE, session.provider_token, {
      ...baseOptions,
      maxAge: 55 * 60,
    });
  }
  if (session.provider_refresh_token) {
    cookieStore.set(GOOGLE_REFRESH_COOKIE, session.provider_refresh_token, {
      ...baseOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export function clearGoogleTokenCookies(cookieStore) {
  for (const name of [GOOGLE_ACCESS_COOKIE, GOOGLE_REFRESH_COOKIE]) {
    cookieStore.set(name, "", { ...baseOptions, maxAge: 0 });
  }
}
