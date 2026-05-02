/**
 * Integration tests · GET /api/google-ads/spend-data (W17-T3 · W15-D-18).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/google-ads/spend-data/route'

const VALID_KEY = 'gads-spend-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/google-ads/spend-data${qs}`, { method: 'GET', headers })
}

describe('GET /api/google-ads/spend-data', () => {
  it('happy path · returns 200 + totals + per-type breakdown', async () => {
    const res = await GET(req('?client_id=acme&since_days=7'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.platform).toBe('google-ads')
    expect(body.client_id).toBe('acme')
    expect(body.since_days).toBe(7)
    expect(typeof body.total_spend_usd).toBe('number')
    expect(Array.isArray(body.breakdown)).toBe(true)
    expect(body.breakdown.length).toBeGreaterThan(0)
  })

  it('400 + E-INPUT-MISSING · client_id absent', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-MISSING')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('?client_id=acme', false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('total_spend_usd is sum of breakdown spend (consistency guarantee)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.breakdown.reduce((s: number, x: any) => s + x.spend_usd, 0)
    expect(body.total_spend_usd).toBe(sum)
  })

  it('default since_days is 1 when query param absent', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.since_days).toBe(1)
  })
})
