/**
 * Unit tests for src/lib/internal-auth.ts (Wave 14 · CC#1).
 *
 * Covers checkInternalKey + requireInternalKey. The latter is a wrapper that
 * runs the handler only when auth passes. Auth uses crypto.timingSafeEqual,
 * so equal-length comparison must succeed even with adversarial inputs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkInternalKey, requireInternalKey } from '../src/lib/internal-auth'

const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = 'super-secret-32-chars-1234567890abc'
})

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers,
  })
}

describe('checkInternalKey', () => {
  it('passes when x-api-key matches env var', () => {
    const r = req({ 'x-api-key': 'super-secret-32-chars-1234567890abc' })
    expect(checkInternalKey(r)).toEqual({ ok: true })
  })

  it('fails when env var is not configured', () => {
    delete process.env.INTERNAL_API_KEY
    const r = req({ 'x-api-key': 'whatever' })
    const result = checkInternalKey(r)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/not configured/i)
  })

  it('fails when header is missing', () => {
    const r = req({})
    const result = checkInternalKey(r)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/missing/i)
  })

  it('fails when header has different length than expected', () => {
    const r = req({ 'x-api-key': 'short' })
    const result = checkInternalKey(r)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/invalid/i)
  })

  it('fails when header has same length but wrong value', () => {
    const r = req({ 'x-api-key': 'wrong-secret-32-chars-1234567890abc' })
    const result = checkInternalKey(r)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/invalid/i)
  })

  it('does not throw when comparing different-length buffers', () => {
    const r = req({ 'x-api-key': 'a' })
    expect(() => checkInternalKey(r)).not.toThrow()
  })
})

describe('requireInternalKey wrapper', () => {
  it('runs the handler when auth passes', async () => {
    const handler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    const wrapped = requireInternalKey(handler)
    const r = req({ 'x-api-key': 'super-secret-32-chars-1234567890abc' })
    const res = await wrapped(r, { params: {} })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 401 without calling handler when auth fails', async () => {
    let called = false
    const handler = async () => {
      called = true
      return new Response('should not run', { status: 200 })
    }
    const wrapped = requireInternalKey(handler)
    const r = req({})  // missing key
    const res = await wrapped(r, { params: {} })
    expect(res.status).toBe(401)
    expect(called).toBe(false)
  })

  it('401 response includes structured error envelope', async () => {
    const handler = async () => new Response('ok', { status: 200 })
    const wrapped = requireInternalKey(handler)
    const r = req({})
    const res = await wrapped(r, { params: {} })
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
    expect(body).toHaveProperty('detail')
  })

  it('passes ctx.params through to the handler unchanged', async () => {
    let capturedParams: Record<string, string> | null = null
    const handler = async (_req: Request, ctx: { params: Record<string, string> }) => {
      capturedParams = ctx.params
      return new Response('ok', { status: 200 })
    }
    const wrapped = requireInternalKey(handler)
    const r = req({ 'x-api-key': 'super-secret-32-chars-1234567890abc' })
    await wrapped(r, { params: { id: '42', client: 'acme' } })
    expect(capturedParams).toEqual({ id: '42', client: 'acme' })
  })
})
