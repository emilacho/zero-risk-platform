/**
 * Unit tests for src/lib/auth-middleware.ts (Wave 15 · CC#1).
 *
 * Covers requireSupabaseSession + requireSessionOrInternalKey.
 *
 * Tier 3 (HUMAN session) is the new addition. Tests verify:
 *  - missing token → 401 + E-AUTH-NO-SESSION
 *  - invalid token → 403 + E-AUTH-INVALID-TOKEN
 *  - Bearer token in Authorization header → calls supabase.getUser(token)
 *  - sb-*-auth-token cookie (JSON form) → extracts access_token
 *  - missing supabase env vars → 500 + E-AUTH-CONFIG
 *  - composite: internal-key wins fast-path, falls through to session otherwise
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock supabase ssr BEFORE importing the helper.
const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { requireSupabaseSession, requireSessionOrInternalKey } from '../src/lib/auth-middleware'

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  mockGetUser.mockReset()
})

afterEach(() => {
  if (ORIG_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL
  if (ORIG_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY
})

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { method: 'GET', headers })
}

describe('requireSupabaseSession · token sources', () => {
  it('401 when no Authorization header and no cookie', async () => {
    const r = await requireSupabaseSession(req())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(401)
      const body = await r.response.json()
      expect(body.code).toBe('E-AUTH-NO-SESSION')
    }
  })

  it('extracts token from Authorization Bearer header', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@x.com', user_metadata: { role: 'admin' } } },
      error: null,
    })
    const r = await requireSupabaseSession(req({ Authorization: 'Bearer my-jwt-123' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.userId).toBe('user-1')
      expect(r.email).toBe('a@x.com')
      expect(r.role).toBe('admin')
    }
    expect(mockGetUser).toHaveBeenCalledWith('my-jwt-123')
  })

  it('extracts token from lower-case authorization header', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: null, user_metadata: {} } },
      error: null,
    })
    const r = await requireSupabaseSession(req({ authorization: 'Bearer xyz' }))
    expect(r.ok).toBe(true)
  })

  it('extracts JSON cookie form (sb-*-auth-token)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-cookie', email: 'c@x.com', user_metadata: {} } },
      error: null,
    })
    const cookieValue = encodeURIComponent(JSON.stringify({ access_token: 'cookie-jwt', refresh_token: 'rt' }))
    const r = await requireSupabaseSession(
      req({ cookie: `sb-projref-auth-token=${cookieValue}` }),
    )
    expect(r.ok).toBe(true)
    expect(mockGetUser).toHaveBeenCalledWith('cookie-jwt')
  })

  it('falls back to raw cookie value when JSON parse fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-raw', email: null, user_metadata: {} } },
      error: null,
    })
    const r = await requireSupabaseSession(
      req({ cookie: 'sb-x-auth-token=raw-jwt-value' }),
    )
    expect(r.ok).toBe(true)
    expect(mockGetUser).toHaveBeenCalledWith('raw-jwt-value')
  })

  it('Authorization header takes precedence over cookie', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: null, user_metadata: {} } },
      error: null,
    })
    await requireSupabaseSession(
      req({
        Authorization: 'Bearer header-token',
        cookie: 'sb-x-auth-token=cookie-token',
      }),
    )
    expect(mockGetUser).toHaveBeenCalledWith('header-token')
  })
})

describe('requireSupabaseSession · validation', () => {
  it('403 + E-AUTH-INVALID-TOKEN when supabase rejects token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
    const r = await requireSupabaseSession(req({ Authorization: 'Bearer expired' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(403)
      const body = await r.response.json()
      expect(body.code).toBe('E-AUTH-INVALID-TOKEN')
      expect(body.detail).toContain('JWT expired')
    }
  })

  it('403 when supabase returns null user without error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const r = await requireSupabaseSession(req({ Authorization: 'Bearer x' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })
})

describe('requireSupabaseSession · misconfiguration', () => {
  it('500 + E-AUTH-CONFIG when SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const r = await requireSupabaseSession(req({ Authorization: 'Bearer x' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(500)
      const body = await r.response.json()
      expect(body.code).toBe('E-AUTH-CONFIG')
    }
  })

  it('500 + E-AUTH-CONFIG when SUPABASE_ANON_KEY is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const r = await requireSupabaseSession(req({ Authorization: 'Bearer x' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect((await r.response.json()).code).toBe('E-AUTH-CONFIG')
  })
})

describe('requireSessionOrInternalKey · composite', () => {
  it('fast-path: internal key match returns ok with role=internal', async () => {
    const r = await requireSessionOrInternalKey(
      req({ 'x-api-key': 'whatever' }),
      () => ({ ok: true }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.userId).toBe('internal-api')
      expect(r.role).toBe('internal')
    }
    // supabase.getUser should NOT be called
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('falls through to session when internal-key check fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })
    const r = await requireSessionOrInternalKey(
      req({ Authorization: 'Bearer jwt' }),
      () => ({ ok: false, reason: 'no key' }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.userId).toBe('u')
    expect(mockGetUser).toHaveBeenCalledWith('jwt')
  })

  it('returns session 401 when both fail', async () => {
    const r = await requireSessionOrInternalKey(
      req({}),
      () => ({ ok: false, reason: 'no key' }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(401)
  })
})
