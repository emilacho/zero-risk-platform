/**
 * Edge-case integration tests for the 8 W17 ad-platform endpoints.
 *
 * These supplement the per-endpoint files (5 tests each, 40 total) with
 * cross-cutting concerns that the per-endpoint suites don't cover:
 *
 *   1. Auth detail paths (wrong-value vs wrong-length vs missing-env-var)
 *   2. Query-param parsing edge cases (NaN, lower-bound, empty)
 *   3. Response-shape invariants that hold across all 8 endpoints
 *
 * Scope: W17-T3 endpoints (D-01, D-15, D-16, D-17, D-18, D-20, D-33, D-34).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { GET as platformCampaignStats } from '../src/app/api/[platform]/campaign-stats/route'
import { GET as gadsAssetGroupHealth } from '../src/app/api/google-ads/asset-group-health/route'
import { GET as gadsCampaignPerformance } from '../src/app/api/google-ads/campaign-performance/route'
import { GET as gadsPmaxCampaigns } from '../src/app/api/google-ads/pmax-campaigns/route'
import { GET as gadsSpendData } from '../src/app/api/google-ads/spend-data/route'
import { GET as linkedinCampaigns } from '../src/app/api/linkedin-ads/campaigns/route'
import { GET as tiktokCampaigns } from '../src/app/api/tiktok-ads/campaigns/route'
import { GET as tiktokSpendData } from '../src/app/api/tiktok-ads/spend-data/route'

const VALID_KEY = 'edge-case-suite-key-1234567890abcdef'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => { process.env.INTERNAL_API_KEY = VALID_KEY })
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function authedReq(url: string): Request {
  return new Request(url, { method: 'GET', headers: { 'x-api-key': VALID_KEY } })
}

describe('ad-platforms · auth detail paths', () => {
  it('rejects x-api-key with wrong value but same length · 401 · timing-safe compare branch', async () => {
    const wrongKey = 'edge-case-suite-key-XXXXXXXXXXXXXXXX' // same length as VALID_KEY
    expect(wrongKey.length).toBe(VALID_KEY.length)
    const res = await gadsSpendData(new Request('http://localhost/api/google-ads/spend-data?client_id=acme', {
      method: 'GET', headers: { 'x-api-key': wrongKey },
    }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('E-AUTH-001')
    expect(body.detail).toMatch(/Invalid x-api-key/)
  })

  it('rejects x-api-key with wrong length · 401 · length-mismatch early return', async () => {
    const shortKey = 'too-short' // shorter than VALID_KEY
    expect(shortKey.length).toBeLessThan(VALID_KEY.length)
    const res = await tiktokCampaigns(new Request('http://localhost/api/tiktok-ads/campaigns?client_id=acme', {
      method: 'GET', headers: { 'x-api-key': shortKey },
    }))
    expect(res.status).toBe(401)
    expect((await res.json()).detail).toMatch(/Invalid x-api-key/)
  })

  it('rejects when INTERNAL_API_KEY env var is unset · 401 · server-misconfig branch', async () => {
    delete process.env.INTERNAL_API_KEY
    const res = await linkedinCampaigns(new Request('http://localhost/api/linkedin-ads/campaigns?client_id=acme', {
      method: 'GET', headers: { 'x-api-key': 'anything' },
    }))
    expect(res.status).toBe(401)
    expect((await res.json()).detail).toMatch(/INTERNAL_API_KEY env var not configured/)
  })
})

describe('ad-platforms · query-param edge cases', () => {
  it('platform-campaign-stats · since_days=0 falls back to default 7 (falsy-zero quirk in `parseInt(x) || 7`)', async () => {
    // Quirk: route.ts:91 reads `parseInt(raw||'7',10) || 7`. When raw="0",
    // parseInt is 0 → falsy → fallback to default 7 (not lower-clamped to 1).
    // This is the actual behavior; documenting it as a test-encoded contract.
    // If we ever want strict clamp [1,365] for explicit "0", change to `?? 7`.
    const res = await platformCampaignStats(
      authedReq('http://localhost/api/tiktok-ads/campaign-stats?client_id=acme&since_days=0'),
      { params: { platform: 'tiktok-ads' } },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).since_days).toBe(7)
  })

  it('platform-campaign-stats · since_days="-3" clamps to lower bound 1 (Math.max wins)', async () => {
    const res = await platformCampaignStats(
      authedReq('http://localhost/api/tiktok-ads/campaign-stats?client_id=acme&since_days=-3'),
      { params: { platform: 'tiktok-ads' } },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).since_days).toBe(1)
  })

  it('platform-campaign-stats · since_days="abc" parses NaN, falls back to default 7', async () => {
    const res = await platformCampaignStats(
      authedReq('http://localhost/api/tiktok-ads/campaign-stats?client_id=acme&since_days=abc'),
      { params: { platform: 'tiktok-ads' } },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).since_days).toBe(7)
  })

  it('google-ads/spend-data · since_days="-50" clamps to lower bound 1', async () => {
    const res = await gadsSpendData(authedReq('http://localhost/api/google-ads/spend-data?client_id=acme&since_days=-50'))
    expect(res.status).toBe(200)
    expect((await res.json()).since_days).toBe(1)
  })

  it('tiktok-ads/spend-data · since_days="9999" clamps to upper bound 365', async () => {
    const res = await tiktokSpendData(authedReq('http://localhost/api/tiktok-ads/spend-data?client_id=acme&since_days=9999'))
    expect(res.status).toBe(200)
    expect((await res.json()).since_days).toBe(365)
  })
})

describe('ad-platforms · response-shape invariants', () => {
  it('every endpoint returns ok:true on happy path with default params', async () => {
    const cases: Array<[string, Promise<Response>]> = [
      ['platform-campaign-stats', platformCampaignStats(authedReq('http://localhost/api/tiktok-ads/campaign-stats?client_id=acme'), { params: { platform: 'tiktok-ads' } })],
      ['gads-asset-group-health', gadsAssetGroupHealth(authedReq('http://localhost/api/google-ads/asset-group-health?client_id=acme'))],
      ['gads-campaign-performance', gadsCampaignPerformance(authedReq('http://localhost/api/google-ads/campaign-performance?client_id=acme'))],
      ['gads-pmax-campaigns', gadsPmaxCampaigns(authedReq('http://localhost/api/google-ads/pmax-campaigns?client_id=acme'))],
      ['gads-spend-data', gadsSpendData(authedReq('http://localhost/api/google-ads/spend-data?client_id=acme'))],
      ['linkedin-campaigns', linkedinCampaigns(authedReq('http://localhost/api/linkedin-ads/campaigns?client_id=acme'))],
      ['tiktok-campaigns', tiktokCampaigns(authedReq('http://localhost/api/tiktok-ads/campaigns?client_id=acme'))],
      ['tiktok-spend-data', tiktokSpendData(authedReq('http://localhost/api/tiktok-ads/spend-data?client_id=acme'))],
    ]
    for (const [name, p] of cases) {
      const res = await p
      expect(res.status, `${name} should return 200`).toBe(200)
      const body = await res.json()
      expect(body.ok, `${name} should return ok:true`).toBe(true)
      expect(body.client_id, `${name} should echo client_id`).toBe('acme')
    }
  })

  it('every endpoint returns E-AUTH-001 + 401 on missing x-api-key (no key, no env override)', async () => {
    const noKeyReq = (path: string) => new Request(`http://localhost${path}`, { method: 'GET' })
    const cases: Array<[string, Promise<Response>]> = [
      ['platform-campaign-stats', platformCampaignStats(noKeyReq('/api/tiktok-ads/campaign-stats?client_id=acme'), { params: { platform: 'tiktok-ads' } })],
      ['gads-asset-group-health', gadsAssetGroupHealth(noKeyReq('/api/google-ads/asset-group-health?client_id=acme'))],
      ['gads-campaign-performance', gadsCampaignPerformance(noKeyReq('/api/google-ads/campaign-performance?client_id=acme'))],
      ['gads-pmax-campaigns', gadsPmaxCampaigns(noKeyReq('/api/google-ads/pmax-campaigns?client_id=acme'))],
      ['gads-spend-data', gadsSpendData(noKeyReq('/api/google-ads/spend-data?client_id=acme'))],
      ['linkedin-campaigns', linkedinCampaigns(noKeyReq('/api/linkedin-ads/campaigns?client_id=acme'))],
      ['tiktok-campaigns', tiktokCampaigns(noKeyReq('/api/tiktok-ads/campaigns?client_id=acme'))],
      ['tiktok-spend-data', tiktokSpendData(noKeyReq('/api/tiktok-ads/spend-data?client_id=acme'))],
    ]
    for (const [name, p] of cases) {
      const res = await p
      expect(res.status, `${name} should return 401`).toBe(401)
      expect((await res.json()).code, `${name} should return E-AUTH-001`).toBe('E-AUTH-001')
    }
  })

  it('every endpoint returns E-INPUT-MISSING + 400 on missing client_id', async () => {
    const cases: Array<[string, Promise<Response>]> = [
      // platform-campaign-stats has its own platform-validation order (404 for unknown), but client_id missing on a valid platform → 400.
      ['platform-campaign-stats', platformCampaignStats(authedReq('http://localhost/api/tiktok-ads/campaign-stats'), { params: { platform: 'tiktok-ads' } })],
      ['gads-asset-group-health', gadsAssetGroupHealth(authedReq('http://localhost/api/google-ads/asset-group-health'))],
      ['gads-campaign-performance', gadsCampaignPerformance(authedReq('http://localhost/api/google-ads/campaign-performance'))],
      ['gads-pmax-campaigns', gadsPmaxCampaigns(authedReq('http://localhost/api/google-ads/pmax-campaigns'))],
      ['gads-spend-data', gadsSpendData(authedReq('http://localhost/api/google-ads/spend-data'))],
      ['linkedin-campaigns', linkedinCampaigns(authedReq('http://localhost/api/linkedin-ads/campaigns'))],
      ['tiktok-campaigns', tiktokCampaigns(authedReq('http://localhost/api/tiktok-ads/campaigns'))],
      ['tiktok-spend-data', tiktokSpendData(authedReq('http://localhost/api/tiktok-ads/spend-data'))],
    ]
    for (const [name, p] of cases) {
      const res = await p
      expect(res.status, `${name} should return 400`).toBe(400)
      expect((await res.json()).code, `${name} should return E-INPUT-MISSING`).toBe('E-INPUT-MISSING')
    }
  })
})
