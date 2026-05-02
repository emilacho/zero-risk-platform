/**
 * Integration tests · GET /api/linkedin-ads/campaigns (W17-T3 · W15-D-20).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/linkedin-ads/campaigns/route'

const VALID_KEY = 'linkedin-camp-test-key-1234567890ab'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/linkedin-ads/campaigns${qs}`, { method: 'GET', headers })
}

describe('GET /api/linkedin-ads/campaigns', () => {
  it('happy path · returns 200 + campaigns + active_count', async () => {
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.platform).toBe('linkedin-ads')
    expect(body.client_id).toBe('acme')
    expect(body.count).toBeGreaterThan(0)
    expect(body.campaigns[0]).toHaveProperty('objective')
    expect(typeof body.active_count).toBe('number')
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

  it('total_daily_budget_usd is sum of campaign budgets', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.campaigns.reduce((s: number, c: any) => s + c.daily_budget_usd, 0)
    expect(body.total_daily_budget_usd).toBe(sum)
  })

  it('every campaign has a valid LinkedIn objective enum', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const allowed = ['BRAND_AWARENESS', 'WEBSITE_VISITS', 'LEAD_GENERATION', 'WEBSITE_CONVERSIONS']
    for (const c of body.campaigns) expect(allowed).toContain(c.objective)
  })
})
