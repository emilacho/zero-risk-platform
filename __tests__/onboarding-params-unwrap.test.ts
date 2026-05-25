/**
 * Sprint 8D Finding 3 · /api/onboarding params unwrap unit tests.
 *
 * Locks the contract · POST /api/onboarding accepts BOTH top-level (legacy
 * direct callers · MC UI · CLI smokes) AND `params.*` nested (L1 Master
 * Journey Orchestrator dispatch convention). Top-level wins when both
 * present (backward-compat) · `params.*` resolves only when top-level
 * absent.
 *
 * Smoke-mode short-circuit verified · Smoke Test Co / smoke-* client_id
 * / x-smoke-test header all bypass OnboardingOrchestrator and echo back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: () => ({ ok: true }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({}),
}))

vi.mock('@/lib/onboarding-orchestrator', () => ({
  OnboardingOrchestrator: vi.fn().mockImplementation(() => ({
    startOnboarding: vi.fn(async (input: unknown) => ({ ok: true, success: true, session_id: 'sess-1', received: input })),
  })),
}))

vi.mock('@/lib/input-validator', () => ({
  validateObject: <T>(raw: unknown) => ({ ok: true, data: raw as T }),
}))

beforeEach(() => {
  process.env.INTERNAL_API_KEY = 'test-internal-key'
})

afterEach(() => {
  vi.clearAllMocks()
})

function jsonReq(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/onboarding', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-internal-key',
    },
    body: JSON.stringify(body),
  })
}

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/onboarding/route')
}

describe('POST /api/onboarding · params unwrap (Sprint 8D Finding 3)', () => {
  it('accepts top-level companyName + websiteUrl (legacy callers)', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonReq({
        companyName: 'Top Level Co',
        websiteUrl: 'https://top-level.example',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { received?: { companyName: string; websiteUrl: string } }
    expect(body.received?.companyName).toBe('Top Level Co')
    expect(body.received?.websiteUrl).toBe('https://top-level.example')
  })

  it('accepts nested params.companyName + params.websiteUrl (L1 dispatch)', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonReq({
        journey: 'ONBOARD',
        client_id: 'uuid-x',
        params: {
          companyName: 'Nested Co',
          websiteUrl: 'https://nested.example',
          industry: 'Tech',
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { received?: { companyName: string; websiteUrl: string; industry: string } }
    expect(body.received?.companyName).toBe('Nested Co')
    expect(body.received?.websiteUrl).toBe('https://nested.example')
    expect(body.received?.industry).toBe('Tech')
  })

  it('top-level wins when both layouts present (backward-compat priority)', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonReq({
        companyName: 'Top Wins',
        websiteUrl: 'https://top.example',
        params: {
          companyName: 'Nested Loses',
          websiteUrl: 'https://nested.example',
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { received?: { companyName: string; websiteUrl: string } }
    expect(body.received?.companyName).toBe('Top Wins')
    expect(body.received?.websiteUrl).toBe('https://top.example')
  })

  it('snake_case under params.* resolves (workflow-generated payloads)', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonReq({
        params: {
          company_name: 'Snake Co',
          website_url: 'https://snake.example',
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { received?: { companyName: string; websiteUrl: string } }
    expect(body.received?.companyName).toBe('Snake Co')
    expect(body.received?.websiteUrl).toBe('https://snake.example')
  })

  it('soft-degrades to missing_required_fields when both layouts absent', async () => {
    const { POST } = await loadRoute()
    const res = await POST(jsonReq({ journey: 'ONBOARD' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('missing_required_fields')
  })

  it('smoke short-circuit · params.companyName matching smoke pattern bypasses orchestrator', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonReq({
        params: {
          companyName: 'Smoke Test Co',
          websiteUrl: 'https://smoke.example',
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fallback_mode?: boolean; note?: string; session_id?: string }
    expect(body.fallback_mode).toBe(true)
    expect(body.note).toContain('Smoke-mode short-circuit')
    expect(body.session_id).toMatch(/^onboarding-smoke-/)
  })
})
