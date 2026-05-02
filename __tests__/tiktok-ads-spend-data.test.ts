/**
 * Integration tests · GET /api/tiktok-ads/spend-data (W17-T3 · W15-D-34).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/tiktok-ads/spend-data/route'

const VALID_KEY = 'tiktok-spend-test-key-1234567890abcd'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/tiktok-ads/spend-data${qs}`, { method: 'GET', headers })
}

describe('GET /api/tiktok-ads/spend-data', () => {
  it('happy path · returns 200 + totals + breakdown', async () => {
    const res = await GET(req('?client_id=acme&since_days=7'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.platform).toBe('tiktok-ads')
    expect(body.since_days).toBe(7)
    expect(typeof body.total_spend_usd).toBe('number')
    expect(typeof body.total_video_views).toBe('number')
    expect(Array.isArray(body.breakdown)).toBe(true)
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

  it('total_spend_usd matches sum of breakdown spend (consistency)', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.breakdown.reduce((s: number, x: any) => s + x.spend_usd, 0)
    expect(body.total_spend_usd).toBe(sum)
  })

  it('total_video_views matches sum of breakdown video_views', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const sum = body.breakdown.reduce((s: number, x: any) => s + x.video_views, 0)
    expect(body.total_video_views).toBe(sum)
  })
})
