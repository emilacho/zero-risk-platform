// Zero Risk V2 — Auth Middleware
// Protects /dashboard/* routes — redirects to /login if no session
// Uses Supabase SSR for cookie-based auth verification

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured, allow through (dev mode)
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Update request cookies
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        // Create fresh response with updated request
        supabaseResponse = NextResponse.next({ request })
        // Set cookies on the response
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Refresh session (important for token rotation)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes: /dashboard and all sub-routes
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard')
  const isLoginPage = request.nextUrl.pathname === '/login'

  // No user + protected route → redirect to login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // User exists + on login page → redirect to dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Match dashboard and login routes, skip static files and APIs
    '/dashboard/:path*',
    '/login',
  ],
}
