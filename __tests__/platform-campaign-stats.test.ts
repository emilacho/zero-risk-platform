/**
 * Integration tests · GET /api/[platform]/campaign-stats (W17-T3 · W15-D-01).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/[platform]/campaign-stats/route'

const VALID_KEY = 'platform-stats-test-key-1234567890ab'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(platform: string, qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/${platform}/campaign-stats${qs}`, { method: 'GET', headers })
}

describe('GET /api/[platform]/campaign-stats', () => {
  it('happy path · tiktok-ads · returns 200 + count + campaigns array', async () => {
    const res = await GET(req('tiktok-ads', '?client_id=acme&since_days=7'), { params: { platform: 'tiktok-ads' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.platform).toBe('tiktok-ads')
    expect(body.client_id).toBe('acme')
    expect(body.since_days).toBe(7)
    expect(body.count).toBeGreaterThan(0)
    expect(Array.isArray(body.campaigns)).toBe(true)
    expect(body.campaigns[0]).toHaveProperty('campaign_id')
    expect(body.campaigns[0]).toHaveProperty('roas')
  })

  it('400 + E-INPUT-MISSING · client_id absent', async () => {
    const res = await GET(req('linkedin-ads', ''), { params: { platform: 'linkedin-ads' } })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-MISSING')
  })

  it('404 + E-INPUT-INVALID · unknown platform', async () => {
    const res = await GET(req('myspace-ads', '?client_id=acme'), { params: { platform: 'myspace-ads' } })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await GET(req('tiktok-ads', '?client_id=acme', false), { params: { platform: 'tiktok-ads' } })
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('clamps since_days to [1, 365] range', async () => {
    const res = await GET(req('tiktok-ads', '?client_id=acme&since_days=99999'), { params: { platform: 'tiktok-ads' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.since_days).toBe(365)
  })
})
