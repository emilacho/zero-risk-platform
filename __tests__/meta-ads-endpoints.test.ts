/**
 * meta-ads-endpoints.test.ts · Sprint #7 Brazo 3 baseline build
 *
 * Contract tests · Meta Graph v21 mocked + Supabase service-role mocked.
 *
 *   POST /api/meta-ads/campaigns/create
 *     1. 401 when auth fails
 *     2. 503 when META env not configured
 *     3. 400 when client_id missing
 *     4. 400 when campaign required fields missing
 *     5. 400 when creatives[] empty
 *     6. 200 happy path · 4-call chain (campaign → adset → creative → ad) · status=PAUSED
 *     7. 502 when campaign call fails
 *     8. 502 when adset call fails (campaign already persisted)
 *     9. meta_ads_campaigns + meta_ads_creatives inserts captured
 *
 *   POST /api/meta-ads/insights/sync
 *     1. 401 auth fails
 *     2. 503 not_configured
 *     3. 502 on Meta upstream failure
 *     4. 200 happy path · upsert called with normalized rows
 *     5. snapshot_date defaults to yesterday UTC
 *     6. actions extracted into leads/purchases/revenue
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockInsertCapture = vi.fn()
const mockUpsertCapture = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mockInsertCapture(table, row)
        return Promise.resolve({ data: null, error: null })
      },
      upsert: (rows: Record<string, unknown>[], opts?: Record<string, unknown>) => {
        mockUpsertCapture(table, rows, opts)
        return Promise.resolve({ data: null, error: null, count: rows.length })
      },
    }),
  }),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockInsertCapture.mockReset()
  mockUpsertCapture.mockReset()
  originalFetch = globalThis.fetch
  vi.stubEnv('META_ACCESS_TOKEN', 'test-meta-token')
  vi.stubEnv('META_AD_ACCOUNT_ID', 'act_1234567890')
  vi.stubEnv('META_FB_PAGE_ID', '101000000000000')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

const buildPost = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const validCreatePayload = () => ({
  client_id: 'naufrago',
  campaign: {
    name: 'Naufrago Launch',
    objective: 'OUTCOME_TRAFFIC',
    daily_budget_cents: 1000,
  },
  adset: {
    targeting: { geo_locations: { countries: ['EC'] } },
    optimization_goal: 'LINK_CLICKS',
  },
  creatives: [
    { title: 'V1', body: 'Body 1', call_to_action_type: 'LEARN_MORE', link_url: 'https://naufrago.example' },
    { title: 'V2', body: 'Body 2', call_to_action_type: 'LEARN_MORE', link_url: 'https://naufrago.example' },
  ],
})

const okJsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

// ============================================================================
// POST /api/meta-ads/campaigns/create
// ============================================================================

describe('POST /api/meta-ads/campaigns/create', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', validCreatePayload()))
    expect(res.status).toBe(401)
  })

  it('returns 503 when META env not configured', async () => {
    vi.unstubAllEnvs()
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', validCreatePayload()))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('not_configured')
    expect(json.missing).toContain('META_ACCESS_TOKEN')
  })

  it('returns 400 when client_id missing', async () => {
    const payload = validCreatePayload() as Record<string, unknown>
    delete payload.client_id
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', payload))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-META-ADS-CLIENT')
  })

  it('returns 400 when campaign required fields missing', async () => {
    const payload = validCreatePayload() as { campaign: Record<string, unknown> }
    delete payload.campaign.objective
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', payload))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-META-ADS-CAMPAIGN')
  })

  it('returns 400 when creatives[] empty', async () => {
    const payload = { ...validCreatePayload(), creatives: [] }
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', payload))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-META-ADS-CREATIVES')
  })

  it('happy path · 4-call chain · status PAUSED · returns all IDs', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    setMockFetch(async (url, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : null
      calls.push({ url: String(url), body })
      if (url.includes('/campaigns?access_token')) {
        return okJsonResponse({ id: 'CAMP_001' })
      }
      if (url.includes('/adsets?access_token')) {
        return okJsonResponse({ id: 'ADSET_001' })
      }
      if (url.includes('/adcreatives?access_token')) {
        const n = calls.filter(c => c.url.includes('/adcreatives')).length
        return okJsonResponse({ id: `CREATIVE_00${n}` })
      }
      if (url.includes('/ads?access_token')) {
        const n = calls.filter(c => c.url.includes('/ads?access_token')).length
        return okJsonResponse({ id: `AD_00${n}` })
      }
      return okJsonResponse({ error: 'unmocked' })
    })
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', validCreatePayload()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.status).toBe('PAUSED')
    expect(json.campaign_id).toBe('CAMP_001')
    expect(json.adset_id).toBe('ADSET_001')
    expect(json.creative_ids).toEqual(['CREATIVE_001', 'CREATIVE_002'])
    expect(json.ad_ids).toEqual(['AD_001', 'AD_002'])
    // Verify 4-call chain happened
    expect(calls.filter(c => c.url.includes('/campaigns?')).length).toBe(1)
    expect(calls.filter(c => c.url.includes('/adsets?')).length).toBe(1)
    expect(calls.filter(c => c.url.includes('/adcreatives?')).length).toBe(2)
    expect(calls.filter(c => c.url.includes('/ads?')).length).toBe(2)
    // Verify campaign request body has status=PAUSED
    const campaignCall = calls.find(c => c.url.includes('/campaigns?'))!
    expect((campaignCall.body as { status: string }).status).toBe('PAUSED')
  })

  it('returns 502 when campaign call fails', async () => {
    setMockFetch(async () => new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 400 }))
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', validCreatePayload()))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('meta_campaign_failed')
    expect(json.step).toBe('campaign')
  })

  it('returns 502 when adset fails · campaign already persisted', async () => {
    setMockFetch(async (url) => {
      if (url.includes('/campaigns?')) return okJsonResponse({ id: 'CAMP_002' })
      if (url.includes('/adsets?')) {
        return new Response(JSON.stringify({ error: { message: 'invalid targeting' } }), { status: 400 })
      }
      return okJsonResponse({ id: 'unused' })
    })
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    const res = await POST(buildPost('/api/meta-ads/campaigns/create', validCreatePayload()))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('meta_adset_failed')
    expect(json.campaign_id).toBe('CAMP_002')
    // Campaign row was persisted before adset failed
    expect(mockInsertCapture).toHaveBeenCalledWith(
      'meta_ads_campaigns',
      expect.objectContaining({ campaign_id: 'CAMP_002', status: 'PAUSED' })
    )
  })

  it('persists campaign + creative rows to supabase', async () => {
    setMockFetch(async (url) => {
      if (url.includes('/campaigns?')) return okJsonResponse({ id: 'CAMP_003' })
      if (url.includes('/adsets?')) return okJsonResponse({ id: 'ADSET_003' })
      if (url.includes('/adcreatives?')) return okJsonResponse({ id: 'CREATIVE_X' })
      if (url.includes('/ads?')) return okJsonResponse({ id: 'AD_X' })
      return okJsonResponse({ id: 'fallback' })
    })
    const payload = { ...validCreatePayload(), creatives: [validCreatePayload().creatives[0]] }
    const { POST } = await import('../src/app/api/meta-ads/campaigns/create/route')
    await POST(buildPost('/api/meta-ads/campaigns/create', payload))
    const campaignInsert = mockInsertCapture.mock.calls.find(([t]) => t === 'meta_ads_campaigns')
    const creativeInsert = mockInsertCapture.mock.calls.find(([t]) => t === 'meta_ads_creatives')
    expect(campaignInsert).toBeDefined()
    expect(creativeInsert).toBeDefined()
    expect(creativeInsert![1]).toMatchObject({
      creative_id: 'CREATIVE_X',
      campaign_id: 'CAMP_003',
      client_id: 'naufrago',
    })
  })
})

// ============================================================================
// POST /api/meta-ads/insights/sync
// ============================================================================

describe('POST /api/meta-ads/insights/sync', () => {
  it('returns 401 when auth fails', async () => {
    mockAuth.mockReturnValue({ ok: false, reason: 'missing key' })
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    const res = await POST(buildPost('/api/meta-ads/insights/sync', {}))
    expect(res.status).toBe(401)
  })

  it('returns 503 when META env not configured', async () => {
    vi.unstubAllEnvs()
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    const res = await POST(buildPost('/api/meta-ads/insights/sync', {}))
    expect(res.status).toBe(503)
  })

  it('returns 502 on Meta upstream failure', async () => {
    setMockFetch(async () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 }))
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    const res = await POST(buildPost('/api/meta-ads/insights/sync', { snapshot_date: '2026-05-16', client_id: 'naufrago' }))
    expect(res.status).toBe(502)
  })

  it('happy path · upserts normalized rows', async () => {
    const fakeInsight = {
      data: [
        {
          campaign_id: 'C1',
          adset_id: 'AS1',
          ad_id: 'AD1',
          impressions: '1000',
          clicks: '50',
          spend: '12.34',
          cpc: '0.246',
          ctr: '5.0',
          reach: '800',
          frequency: '1.25',
          actions: [
            { action_type: 'lead', value: '5' },
            { action_type: 'purchase', value: '2' },
          ],
          action_values: [{ action_type: 'purchase', value: '99.50' }],
          cost_per_action_type: [{ action_type: 'purchase', value: '6.17' }],
          purchase_roas: [{ value: '8.06' }],
        },
      ],
    }
    setMockFetch(async () => okJsonResponse(fakeInsight))
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    const res = await POST(buildPost('/api/meta-ads/insights/sync', { snapshot_date: '2026-05-16', client_id: 'naufrago' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.snapshot_date).toBe('2026-05-16')
    expect(json.rows).toBe(1)
    expect(mockUpsertCapture).toHaveBeenCalledTimes(1)
    const [table, rows, opts] = mockUpsertCapture.mock.calls[0]
    expect(table).toBe('meta_ads_insights_daily')
    expect(opts).toMatchObject({ onConflict: 'ad_id,snapshot_date' })
    expect(rows[0]).toMatchObject({
      client_id: 'naufrago',
      ad_id: 'AD1',
      snapshot_date: '2026-05-16',
      impressions: 1000,
      clicks: 50,
      spend: 12.34,
      leads: 5,
      purchases: 2,
      revenue: 99.5,
      cpa: 6.17,
      roas: 8.06,
    })
  })

  it('snapshot_date defaults to yesterday UTC when omitted', async () => {
    setMockFetch(async () => okJsonResponse({ data: [] }))
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    const res = await POST(buildPost('/api/meta-ads/insights/sync', {}))
    const json = await res.json()
    const expected = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
    expect(json.snapshot_date).toBe(expected)
  })

  it('extracts lead + purchase + revenue actions correctly', async () => {
    const fakeInsight = {
      data: [
        {
          ad_id: 'AD2',
          impressions: '500',
          clicks: '20',
          spend: '5.00',
          ctr: '4.0',
          cpc: '0.25',
          reach: '400',
          frequency: '1.25',
          actions: [{ action_type: 'lead', value: '3' }],
          action_values: [],
        },
      ],
    }
    setMockFetch(async () => okJsonResponse(fakeInsight))
    const { POST } = await import('../src/app/api/meta-ads/insights/sync/route')
    await POST(buildPost('/api/meta-ads/insights/sync', { snapshot_date: '2026-05-16' }))
    const [, rows] = mockUpsertCapture.mock.calls[0]
    expect(rows[0].leads).toBe(3)
    expect(rows[0].purchases).toBe(0)
    expect(rows[0].revenue).toBe(0)
    expect(rows[0].roas).toBeNull()
  })
})
