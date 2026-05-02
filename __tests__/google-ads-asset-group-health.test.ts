/**
 * Integration tests · GET /api/google-ads/asset-group-health (W17-T3 · W15-D-15).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../src/app/api/google-ads/asset-group-health/route'

const VALID_KEY = 'gads-asg-test-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string, withKey = true): Request {
  const headers: Record<string, string> = {}
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request(`http://localhost/api/google-ads/asset-group-health${qs}`, { method: 'GET', headers })
}

describe('GET /api/google-ads/asset-group-health', () => {
  it('happy path · returns 200 + asset_groups + needs_refresh_count', async () => {
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.client_id).toBe('acme')
    expect(body.count).toBeGreaterThan(0)
    expect(Array.isArray(body.asset_groups)).toBe(true)
    expect(body.asset_groups[0]).toHaveProperty('ad_strength')
    expect(body.asset_groups[0]).toHaveProperty('needs_refresh')
    expect(typeof body.needs_refresh_count).toBe('number')
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

  it('needs_refresh_count derived consistently from asset_groups array', async () => {
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    const computed = body.asset_groups.filter((g: any) => g.needs_refresh).length
    expect(body.needs_refresh_count).toBe(computed)
  })

  it('preserves client_id in response (passthrough verification)', async () => {
    const res = await GET(req('?client_id=foo-bar-2026'))
    const body = await res.json()
    expect(body.client_id).toBe('foo-bar-2026')
  })
})
