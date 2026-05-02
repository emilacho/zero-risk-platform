/**
 * Auth middleware · Wave 15 · CC#1
 *
 * Three auth tiers for API routes:
 *  1. PUBLIC      · no auth · landing pages, health checks
 *  2. INTERNAL    · `x-api-key: $INTERNAL_API_KEY` header · n8n + service-to-service
 *  3. HUMAN       · Supabase session via cookie · MC dashboard UI users
 *
 * Tier 1 + 2 already exist in `internal-auth.ts`. This file adds tier 3 plus
 * a small dispatcher that lets a route accept multiple tiers (e.g. EITHER
 * internal-key OR human-session). Routes that need tier 3 (Mission Control
 * UI fetch) call:
 *
 *   const auth = await requireSupabaseSession(request)
 *   if (!auth.ok) return auth.response
 *   const userId = auth.userId
 *
 * Tier 3 returns:
 *   - 401 when no session cookie + no Authorization header
 *   - 403 when token is invalid / expired (failed Supabase verify)
 *   - 200 path: userId + email + role from auth.users
 *
 * The helper accepts EITHER a Supabase auth cookie (set by /auth/callback)
 * OR `Authorization: Bearer <jwt>` for SPA / fetch from MC backend on behalf
 * of a logged-in user.
 */
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------- Types ----------

export interface SessionAuthOk {
  ok: true
  userId: string
  email: string | null
  role: string | null
}
export interface AuthFail {
  ok: false
  response: NextResponse
}
export type SessionAuthResult = SessionAuthOk | AuthFail

// ---------- Cookie-aware Supabase client (read-only) ----------
//
// We can't use `next/headers` cookies() here because this helper runs from
// any request context (route handler with `request: Request`). We parse the
// cookie header from the request directly.

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.split('=')
    if (!rawName) continue
    const name = rawName.trim()
    if (!name) continue
    out[name] = decodeURIComponent(rest.join('=').trim())
  }
  return out
}

// ---------- requireSupabaseSession ----------

/**
 * Require a valid Supabase user session. Reads the JWT from either:
 *   - `Authorization: Bearer <token>` header (SPA / Mission Control backend)
 *   - sb-access-token / sb-refresh-token cookies (Next.js auth flow)
 *
 * Returns 401 if no token present at all, 403 if Supabase rejects the token.
 *
 * Note on tier overlap: this is INDEPENDENT from `checkInternalKey`. A route
 * that wants "EITHER internal-key OR human-session" should compose them
 * via `requireSessionOrInternalKey()` below.
 */
export async function requireSupabaseSession(request: Request): Promise<SessionAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'auth_not_configured',
          code: 'E-AUTH-CONFIG',
          detail: 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing',
        },
        { status: 500 },
      ),
    }
  }

  // 1. Extract token: Authorization header takes precedence.
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  let token: string | null = null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim()
  }

  // 2. Fallback: cookie-based session.
  const cookies = parseCookieHeader(request.headers.get('cookie'))
  if (!token) {
    // Supabase SSR sets `sb-<project-ref>-auth-token` (we accept any sb-*-auth-token).
    for (const [k, v] of Object.entries(cookies)) {
      if (k.startsWith('sb-') && k.endsWith('-auth-token') && v) {
        // Cookie value is JSON string OR sb1- prefixed token. Try parsing.
        try {
          const parsed = JSON.parse(v)
          if (parsed && typeof parsed === 'object' && parsed.access_token) {
            token = parsed.access_token
            break
          }
        } catch {
          token = v
          break
        }
      }
    }
  }

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized', code: 'E-AUTH-NO-SESSION', detail: 'No session cookie or bearer token' },
        { status: 401 },
      ),
    }
  }

  // 3. Verify token with Supabase. We use createServerClient configured to
  // read the bearer-auth header so getUser() validates the token.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }))
      },
      setAll() { /* noop in API-route context */ },
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'forbidden',
          code: 'E-AUTH-INVALID-TOKEN',
          detail: error?.message || 'Token validation failed',
        },
        { status: 403 },
      ),
    }
  }

  const user = data.user
  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    role: (user.user_metadata?.role as string | undefined) ?? null,
  }
}

// ---------- Composite: session OR internal-key ----------

/**
 * Accepts EITHER a valid Supabase session OR a valid internal API key.
 * Used by routes that may be called BOTH by the MC dashboard (logged-in
 * human) AND by an n8n workflow (service-to-service).
 *
 * Returns the same SessionAuthResult shape, but on internal-key path the
 * userId is "internal-api" and role is "internal".
 */
export async function requireSessionOrInternalKey(
  request: Request,
  checkInternalKey: (req: Request) => { ok: true } | { ok: false; reason: string },
): Promise<SessionAuthResult> {
  // Try internal key first (cheap, no network).
  const k = checkInternalKey(request)
  if (k.ok) {
    return { ok: true, userId: 'internal-api', email: null, role: 'internal' }
  }
  // Fall back to session.
  return requireSupabaseSession(request)
}
