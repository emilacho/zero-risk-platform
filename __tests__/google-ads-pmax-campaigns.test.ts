/**
 * Integration tests · GET /api/google-ads/pmax-campaigns (W17-T3 · W15-D-17).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/google-ads/pmax-campaigns/route'

const VALID_KEY = 'gads-pmax-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/google-ads/pmax-campaigns${qs}`, { method: 'GET', headers })
}

describe('GET /api/google-ads/pmax-campaigns', () => {
  it('happy path · returns 200 + campaigns + total_daily_budget_usd', async () => {
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.count).toBeGreaterThan(0)
    expect(body.campaigns[0]).toHaveProperty('optimization_score')
    expect(body.campaigns[0]).toHaveProperty('asset_group_count')
    expect(typeof body.total_daily_budget_usd).toBe('number')
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

  it('total_daily_budget_usd is sum of campaign budgets (consistency)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.campaigns.reduce((s: number, c: any) => s + c.budget_usd_daily, 0)
    expect(body.total_daily_budget_usd).toBe(sum)
  })

  it('every campaign has ENABLED|PAUSED|REMOVED status (enum guarantee)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    for (const c of body.campaigns) {
      expect(['ENABLED', 'PAUSED', 'REMOVED']).toContain(c.status)
    }
  })
})
