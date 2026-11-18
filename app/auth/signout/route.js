import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { clearGoogleTokenCookies } from "@/app/auth/google-tokens";

// Server-side sign-out: revokes the Supabase session, clears the auth cookies
// and the httpOnly Google token cookies (which client JS cannot delete).
export async function POST() {
  const cookieStore = await cookies();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("signout error:", error.message);
  } catch (e) {
    console.error("signout error:", e.message);
  }
  clearGoogleTokenCookies(cookieStore);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
