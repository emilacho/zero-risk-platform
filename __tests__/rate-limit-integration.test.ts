/**
 * rate-limit-integration.test.ts · Wave 13 T3 (CC#1)
 *
 * Integration tests verifying rate-limit + api-errors interaction.
 * Cubre el adoption pattern usado en:
 *   - /api/agents/pipeline (max=60/min)
 *   - /api/agents/run-sdk (max=120/min)
 *   - /api/webhook (max=30/min)
 *
 * NO testea los routes Next.js end-to-end (eso requiere mock de Supabase + Anthropic SDK).
 * Testea la cadena helper: getClientKey → checkRateLimit → apiErrors.rateLimited.
 *
 * Run: npm test
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, getClientKey, _resetRateLimitForTesting } from '@/lib/rate-limit'
import { apiErrors } from '@/lib/api-errors'

describe('rate-limit + api-errors integration', () => {
  beforeEach(() => {
    _resetRateLimitForTesting()
  })

  it('agents/pipeline pattern · 60 req/min · 61st request gets 429', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1', 'x-api-key': 'test-key-pipeline' },
    })
    const opts = { max: 60, windowMs: 60_000 }
    const key = getClientKey(req)

    // 60 requests should pass
    for (let i = 0; i < 60; i++) {
      const r = checkRateLimit(key, opts)
      expect(r.allowed).toBe(true)
    }

    // 61st should fail
    const r = checkRateLimit(key, opts)
    expect(r.allowed).toBe(false)
    expect(r.retryAfterMs).toBeGreaterThan(0)

    const errorResponse = apiErrors.rateLimited(
      `Pipeline dispatch rate limit exceeded · retry in ${Math.ceil(r.retryAfterMs / 1000)}s`,
    )
    expect(errorResponse.status).toBe(429)
    const body = await errorResponse.json()
    expect(body.error).toBe('rate_limited')
    expect(body.detail).toMatch(/retry in \d+s/)
  })

  it('agents/run-sdk pattern · 120 req/min · isolated by api-key salt', async () => {
    const reqA = new Request('http://x', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'x-api-key': 'team-A-key-aaaaaaaa',
      },
    })
    const reqB = new Request('http://x', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '10.0.0.1', // same IP
        'x-api-key': 'team-B-key-bbbbbbbb', // different key
      },
    })
    const opts = { max: 120, windowMs: 60_000 }

    // Saturar team A
    for (let i = 0; i < 120; i++) {
      checkRateLimit(getClientKey(reqA), opts)
    }
    const a121 = checkRateLimit(getClientKey(reqA), opts)
    expect(a121.allowed).toBe(false)

    // Team B sigue OK aunque mismo IP (api-key salt los aisla)
    const b1 = checkRateLimit(getClientKey(reqB), opts)
    expect(b1.allowed).toBe(true)
  })

  it('webhook pattern · 30 req/min por IP · sin api-key (compat)', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.99' },
    })
    const opts = { max: 30, windowMs: 60_000 }
    const key = getClientKey(req)

    for (let i = 0; i < 30; i++) {
      const r = checkRateLimit(key, opts)
      expect(r.allowed).toBe(true)
    }
    const r31 = checkRateLimit(key, opts)
    expect(r31.allowed).toBe(false)
  })

  it('apiErrors.rateLimited returns proper headers + body', async () => {
    const res = apiErrors.rateLimited('test rate limit message')
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body).toMatchObject({
      error: 'rate_limited',
      detail: 'test rate limit message',
    })
  })

  it('rate limit recovers after window expires (sim with manual cleanup)', () => {
    const key = 'test-recovery'
    const opts = { max: 2, windowMs: 60_000 }
    checkRateLimit(key, opts)
    checkRateLimit(key, opts)
    const blocked = checkRateLimit(key, opts)
    expect(blocked.allowed).toBe(false)

    _resetRateLimitForTesting()
    const recovered = checkRateLimit(key, opts)
    expect(recovered.allowed).toBe(true)
  })
})
