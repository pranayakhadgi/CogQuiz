import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    // Fail gracefully if env vars are missing
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const { pathname } = request.nextUrl

    if (user && (pathname === '/login' || pathname === '/signup')) {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
      // Copy cookies over to the redirect response
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, { ...cookie })
      })
      return redirectResponse
    }

    if (!user && (pathname === '/dashboard' || pathname === '/upload' || pathname === '/quiz')) {
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, { ...cookie })
      })
      return redirectResponse
    }
  } catch (error) {
    console.error('Middleware auth error:', error)
  }

  return response
}

export const config = {
  matcher: ['/dashboard', '/upload', '/quiz', '/login', '/signup']
}
