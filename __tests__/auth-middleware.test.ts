/**
 * auth-middleware.test.ts · Wave 13 (CC#1)
 *
 * Unit tests para `src/lib/auth-middleware.ts`.
 * Cubre 3 funciones · 12 casos:
 *   - requireInternalApiKey: 6 (happy x-api-key · happy x-internal-api-key alias ·
 *     happy x-internal-key alias · missing header · invalid key · server misconfig)
 *   - requireSupabaseSession: 2 (server misconfig · happy path skipped per env)
 *   - allowPublic: 4 (returns ok=true · tier=public · marker prefix warn · no prefix warn)
 *
 * Run: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  requireInternalApiKey,
  requireSupabaseSession,
  allowPublic,
} from '@/lib/auth-middleware'

const VALID_KEY = 'test-internal-key-1234567890abcdef-zr-w13'

describe('requireInternalApiKey()', () => {
  const originalKey = process.env.INTERNAL_API_KEY

  beforeEach(() => {
    process.env.INTERNAL_API_KEY = VALID_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = originalKey
  })

  it('accepts x-api-key header (legacy alias)', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(true)
    if (auth.ok) {
      expect(auth.tier).toBe('internal_api_key')
      expect(auth.userId).toBeNull()
    }
  })

  it('accepts x-internal-api-key header (W13 canonical)', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-internal-api-key': VALID_KEY },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(true)
  })

  it('accepts x-internal-key header (sprint-3 alias)', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-internal-key': VALID_KEY },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(true)
  })

  it('returns 401 when no key header present', async () => {
    const req = new Request('http://x', { method: 'POST' })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) {
      expect(auth.response.status).toBe(401)
      expect(auth.reason).toMatch(/Missing/i)
    }
  })

  it('returns 401 when key is invalid', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-key-xyz' },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) {
      expect(auth.response.status).toBe(401)
      expect(auth.reason).toMatch(/Invalid/i)
    }
  })

  it('returns 503 when INTERNAL_API_KEY env var missing (server misconfig)', async () => {
    delete process.env.INTERNAL_API_KEY
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-api-key': 'whatever' },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) {
      expect(auth.response.status).toBe(503)
    }
  })

  it('timing-safe compare rejects keys of different length', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY + 'extra' },
    })
    const auth = await requireInternalApiKey(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.response.status).toBe(401)
  })
})

describe('requireSupabaseSession()', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  })

  it('returns 503 when Supabase URL/key not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const req = new Request('http://x', { method: 'GET' })
    const auth = await requireSupabaseSession(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.response.status).toBe(503)
  })

  it('returns 401/503 when no session cookie present (env may or may not be set)', async () => {
    // Sin cookie context · Supabase auth.getUser fallará · devolver 401 o 503
    // (depending on Supabase URL availability)
    const req = new Request('http://x', { method: 'GET' })
    const auth = await requireSupabaseSession(req)
    expect(auth.ok).toBe(false)
    if (!auth.ok) {
      expect([401, 503]).toContain(auth.response.status)
    }
  })
})

describe('allowPublic()', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('returns ok=true with tier=public', () => {
    const r = allowPublic('@public-intentional: health probe · no PII')
    expect(r.ok).toBe(true)
    expect(r.tier).toBe('public')
    expect(r.userId).toBeNull()
  })

  it('does NOT warn when reason has correct @public-intentional: prefix', () => {
    allowPublic('@public-intentional: webhook receiver public by design')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('warns in non-production when reason lacks prefix (dev-time signal)', () => {
    // NODE_ENV es read-only en types · cast a Record<string, string> via env wrapper
    const env = process.env as Record<string, string | undefined>
    const originalEnv = env.NODE_ENV
    env.NODE_ENV = 'development'
    try {
      allowPublic('just a reason without prefix')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('@public-intentional:'),
      )
    } finally {
      if (originalEnv === undefined) env.NODE_ENV = undefined
      else env.NODE_ENV = originalEnv
    }
  })

  it('does NOT warn in production even with bad prefix (silent)', () => {
    const env = process.env as Record<string, string | undefined>
    const originalEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    try {
      allowPublic('no prefix')
      expect(consoleSpy).not.toHaveBeenCalled()
    } finally {
      if (originalEnv === undefined) env.NODE_ENV = undefined
      else env.NODE_ENV = originalEnv
    }
  })
})
