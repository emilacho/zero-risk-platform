/**
 * Integration tests · GET /api/google-ads/campaign-performance (W17-T3 · W15-D-16).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/google-ads/campaign-performance/route'

const VALID_KEY = 'gads-perf-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/google-ads/campaign-performance${qs}`, { method: 'GET', headers })
}

describe('GET /api/google-ads/campaign-performance', () => {
  it('happy path · returns 200 + campaigns + totals', async () => {
    const res = await GET(req('?client_id=acme&since_days=14'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.client_id).toBe('acme')
    expect(body.since_days).toBe(14)
    expect(body.count).toBeGreaterThan(0)
    expect(body.campaigns[0]).toHaveProperty('campaign_type')
    expect(body.campaigns[0]).toHaveProperty('roas')
    expect(typeof body.total_spend_usd).toBe('number')
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

  it('totals consistent with campaigns array (spend + conversions)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sumSpend = body.campaigns.reduce((s: number, c: any) => s + c.spend_usd, 0)
    const sumConv = body.campaigns.reduce((s: number, c: any) => s + c.conversions, 0)
    expect(body.total_spend_usd).toBe(sumSpend)
    expect(body.total_conversions).toBe(sumConv)
  })

  it('clamps since_days to [1, 365] range', async () => {
    const res = await GET(req('?client_id=acme&since_days=-5'))
    const body = await res.json()
    expect(body.since_days).toBe(1)
  })
})
