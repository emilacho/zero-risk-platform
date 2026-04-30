/**
 * api-helpers.test.ts · Wave 12 (CC#1)
 *
 * Unit tests para los 3 helpers nuevos:
 *   - api-errors.ts        · standard error envelope
 *   - sentry-capture.ts    · Sentry wrapper (fail-open)
 *   - rate-limit.ts        · in-memory token bucket
 *
 * Run: npm test
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { apiError, apiErrors } from '@/lib/api-errors'
import {
  checkRateLimit,
  getClientKey,
  _resetRateLimitForTesting,
} from '@/lib/rate-limit'
import {
  captureRouteError,
  captureRouteWarning,
  addRouteBreadcrumb,
} from '@/lib/sentry-capture'

// ────────────────────────────────────────────────────────────────────
// api-errors
// ────────────────────────────────────────────────────────────────────

describe('apiError() · base helper', () => {
  it('returns NextResponse with canonical body shape', async () => {
    const res = apiError('validation_error', 400, 'Missing foo')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'validation_error', detail: 'Missing foo' })
  })

  it('clamps detail at 500 chars', async () => {
    const long = 'x'.repeat(600)
    const res = apiError('internal_error', 500, long)
    const body = await res.json()
    expect(body.detail.length).toBe(500)
  })

  it('includes error_code + hint when provided', async () => {
    const res = apiError('unprocessable', 422, 'bad', {
      error_code: 'E-WF-003-REQUIRED',
      hint: 'Add field foo',
    })
    const body = await res.json()
    expect(body.error_code).toBe('E-WF-003-REQUIRED')
    expect(body.hint).toBe('Add field foo')
  })
})

describe('apiErrors shortcuts', () => {
  it('validation() → 400', async () => {
    const res = apiErrors.validation('bad input')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('validation_error')
  })

  it('unauthorized() → 401', async () => {
    const res = apiErrors.unauthorized('no key')
    expect(res.status).toBe(401)
  })

  it('notFound() → 404', async () => {
    const res = apiErrors.notFound('client missing')
    expect(res.status).toBe(404)
  })

  it('conflict() → 409 with context', async () => {
    const res = apiErrors.conflict('dup journey', { existing_id: 'abc' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.context).toEqual({ existing_id: 'abc' })
  })

  it('gone() → 410', async () => {
    const res = apiErrors.gone('TTL expired')
    expect(res.status).toBe(410)
  })

  it('rateLimited() → 429', async () => {
    const res = apiErrors.rateLimited('too many')
    expect(res.status).toBe(429)
  })

  it('serviceUnavailable() → 503', async () => {
    const res = apiErrors.serviceUnavailable('table missing')
    expect(res.status).toBe(503)
  })
})

// ────────────────────────────────────────────────────────────────────
// rate-limit
// ────────────────────────────────────────────────────────────────────

describe('checkRateLimit()', () => {
  beforeEach(() => {
    _resetRateLimitForTesting()
  })

  it('allows requests under the cap', () => {
    const opts = { max: 3, windowMs: 60_000 }
    const r1 = checkRateLimit('client-A', opts)
    const r2 = checkRateLimit('client-A', opts)
    const r3 = checkRateLimit('client-A', opts)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
    expect(r3.current).toBe(3)
  })

  it('blocks the (max+1)-th request and reports retryAfterMs', () => {
    const opts = { max: 2, windowMs: 60_000 }
    checkRateLimit('client-B', opts)
    checkRateLimit('client-B', opts)
    const blocked = checkRateLimit('client-B', opts)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  it('isolates buckets per key', () => {
    const opts = { max: 1, windowMs: 60_000 }
    const a1 = checkRateLimit('client-A', opts)
    const a2 = checkRateLimit('client-A', opts)
    const b1 = checkRateLimit('client-B', opts)
    expect(a1.allowed).toBe(true)
    expect(a2.allowed).toBe(false)
    expect(b1.allowed).toBe(true)
  })
})

describe('getClientKey()', () => {
  it('uses x-forwarded-for first IP if present', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientKey(req)).toBe('1.2.3.4')
  })

  it('appends api-key salt (truncated) if present', () => {
    const req = new Request('http://x', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-api-key': 'supersecretapikeyvalue',
      },
    })
    expect(getClientKey(req)).toBe('1.2.3.4:ksupersec')
  })

  it('falls back to unknown-ip if no headers', () => {
    const req = new Request('http://x')
    expect(getClientKey(req)).toBe('unknown-ip')
  })
})

// ────────────────────────────────────────────────────────────────────
// sentry-capture (fail-open verification · no Sentry config en test env)
// ────────────────────────────────────────────────────────────────────

describe('sentry-capture · fail-open behavior', () => {
  it('captureRouteError does NOT throw when Sentry not configured', () => {
    const req = new Request('http://x', { method: 'POST' })
    expect(() =>
      captureRouteError(new Error('test'), req, { route: '/api/test' }),
    ).not.toThrow()
  })

  it('captureRouteWarning does NOT throw', () => {
    expect(() =>
      captureRouteWarning('test warning', { route: '/api/test' }),
    ).not.toThrow()
  })

  it('addRouteBreadcrumb does NOT throw', () => {
    expect(() => addRouteBreadcrumb('step 1', { route: '/api/test' })).not.toThrow()
  })

  it('captureRouteError handles non-Error values', () => {
    const req = new Request('http://x', { method: 'POST' })
    expect(() =>
      captureRouteError('string error', req, { route: '/api/test' }),
    ).not.toThrow()
    expect(() =>
      captureRouteError({ msg: 'object error' }, req, { route: '/api/test' }),
    ).not.toThrow()
  })

  it('captureRouteError accepts null request', () => {
    expect(() =>
      captureRouteError(new Error('test'), null, { route: '/api/cron' }),
    ).not.toThrow()
  })
})
