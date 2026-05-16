/**
 * Tests for POST /api/influencer/outreach · single-agent outreach plan
 * generator wiring the canonical-adopted `influencer-manager` agent
 * (slug 2 of 3-deferred-agents-resolved · 2026-05-16).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const checkInternalKey = vi.fn().mockReturnValue({ ok: true })
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (req: Request) => checkInternalKey(req),
}))

const supabaseStorageUpload = vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null })
const supabaseFromMaybeSingle = vi.fn().mockResolvedValue({ data: { slug: 'naufrago' }, error: null })

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: supabaseFromMaybeSingle,
    }),
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: supabaseStorageUpload,
    },
  }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  global.fetch = fetchMock as unknown as typeof fetch
  checkInternalKey.mockReturnValue({ ok: true })
  supabaseFromMaybeSingle.mockResolvedValue({ data: { slug: 'naufrago' }, error: null })
  supabaseStorageUpload.mockResolvedValue({ data: { path: 'x' }, error: null })
})

afterEach(() => {
  delete process.env.INTERNAL_API_KEY
  vi.restoreAllMocks()
})

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/influencer/outreach/route')
}

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/influencer/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/influencer/outreach · validation', () => {
  it('401 when auth fails', async () => {
    checkInternalKey.mockReturnValue({ ok: false, reason: 'missing-key' })
    const { POST } = await loadRoute()
    const res = await POST(jsonReq({ campaign_brief: 'x', targets: [{ handle: 'a' }] }))
    expect(res.status).toBe(401)
  })

  it('400 on missing campaign_brief', async () => {
    const { POST } = await loadRoute()
    const res = await POST(jsonReq({ targets: [{ handle: 'a' }] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { detail?: string }
    expect(body.detail).toContain('campaign_brief')
  })

  it('400 on empty targets array', async () => {
    const { POST } = await loadRoute()
    const res = await POST(jsonReq({ campaign_brief: 'x', targets: [] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { detail?: string }
    expect(body.detail).toContain('targets')
  })

  it('400 on targets exceeding 25 cap', async () => {
    const targets = Array.from({ length: 26 }, (_, i) => ({ handle: `h${i}` }))
    const { POST } = await loadRoute()
    const res = await POST(jsonReq({ campaign_brief: 'x', targets }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { detail?: string }
    expect(body.detail).toContain('25')
  })
})

describe('POST /api/influencer/outreach · happy path', () => {
  it('invokes influencer-manager agent · returns parsed plan', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        response: JSON.stringify({
          version: 'outreach-v1',
          campaign_summary: 'launch ceviche delivery',
          targets: [
            {
              handle: 'olonsurf',
              platform: 'instagram',
              qualification_score: 8,
              rationale: 'audience overlap',
              outreach_message_draft: 'Hola, somos Náufrago...',
              deliverable_proposed: '1 Reel · 1 Story',
              compensation_proposed_usd: 50,
              follow_up_window_days: 5,
              red_flags: [],
            },
          ],
          overall_strategy_notes: '',
          open_questions: [],
        }),
        cost_usd: 0.04,
        model: 'claude-sonnet-4-6',
        session_id: 's-1',
      }),
    } as Response)

    const { POST } = await loadRoute()
    const res = await POST(jsonReq({
      client_id: 'd69100b5',
      campaign_brief: 'launch ceviche delivery to surfers',
      targets: [{ handle: 'olonsurf', platform: 'instagram', notes: 'local surf shop' }],
      budget_per_collab_usd: 100,
    }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok?: boolean
      plan?: Record<string, unknown>
      targets_planned?: number
      cost_usd?: number
      model?: string
      client_id?: string
    }
    expect(body.ok).toBe(true)
    expect(body.targets_planned).toBe(1)
    expect(body.client_id).toBe('d69100b5')
    expect(body.cost_usd).toBeCloseTo(0.04, 6)
    expect(body.plan?.version).toBe('outreach-v1')
  })

  it('verifies agent invocation uses canonical slug `influencer-manager`', async () => {
    let agentCalled = ''
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      agentCalled = body.agent
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          response: JSON.stringify({ version: 'outreach-v1', targets: [] }),
          cost_usd: 0.01,
        }),
      } as Response
    })

    const { POST } = await loadRoute()
    await POST(jsonReq({
      campaign_brief: 'x',
      targets: [{ handle: 'a' }],
    }))
    expect(agentCalled).toBe('influencer-manager')
  })

  it('502 when agent returns success=false', async () => {
    fetchMock.mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ success: false, error: 'agent_runner_timeout' }),
    } as Response)

    const { POST } = await loadRoute()
    const res = await POST(jsonReq({
      campaign_brief: 'x',
      targets: [{ handle: 'a' }],
    }))
    expect(res.status).toBe(502)
    const body = (await res.json()) as { ok?: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('agent_runner_timeout')
  })
})
