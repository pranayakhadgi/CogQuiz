import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Next.js 16 renamed `middleware` to `proxy`. This runs on every matched request
// to (1) refresh the Supabase session cookies and (2) gate protected pages/APIs.

const PROTECTED_PAGES = ['/dashboard', '/upload', '/quiz', '/categories_deck']
const AUTH_PAGES = ['/login', '/signup']
// API routes that must stay reachable without a session.
const PUBLIC_API = ['/api/health']

const matches = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`)

export async function proxy(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('proxy: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set')
    return NextResponse.next({ request })
  }

  // Cookies Supabase asks us to write (refreshed tokens). Kept so they can be
  // applied, with their options, to whichever response we end up returning.
  let pendingCookies = []
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        pendingCookies = cookiesToSet
        // Update the request so Server Components / Route Handlers see the fresh tokens...
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // ...and rebuild the response from the updated request.
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const withSessionCookies = (res) => {
    pendingCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    // Never let a CDN cache a response that carries auth cookies.
    if (pendingCookies.length) res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  // IMPORTANT: getUser() validates the JWT with Supabase and refreshes it if needed.
  // Do not put logic between createServerClient and getUser.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch (error) {
    console.error('proxy auth error:', error)
  }

  const { pathname } = request.nextUrl

  if (user && AUTH_PAGES.some((p) => matches(pathname, p))) {
    return withSessionCookies(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  if (!user && PROTECTED_PAGES.some((p) => matches(pathname, p))) {
    return withSessionCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  if (!user && matches(pathname, '/api') && !PUBLIC_API.some((p) => matches(pathname, p))) {
    return withSessionCookies(NextResponse.json({ error: 'Not logged in' }, { status: 401 }))
  }

  return response
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets, the OAuth callback (it sets
    // the session itself) and the PDF upload route (excluded so the proxy never
    // buffers/truncates large multipart bodies; that route authenticates itself).
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
