/**
 * dashboard-endpoints.test.ts · CC#2 [DISPATCH-CC2-DASHBOARD-BACKEND-WIRING]
 *
 * Smoke-level contract tests for the 6 dashboard endpoints + realtime config:
 *   1. GET /api/dashboard/agents         · list + 30d stats roll-up
 *   2. GET /api/dashboard/agents/[slug]  · detail · invocations + files + timeline
 *   3. GET /api/dashboard/clients        · list + invocation/spend counts
 *   4. GET /api/dashboard/clients/[id]   · detail · agents worked + Storage files + journeys
 *   5. GET /api/dashboard/metrics        · global KPIs
 *   6. GET /api/dashboard/activity       · recent invocations feed
 *   7. GET /api/dashboard/realtime       · Supabase Realtime config
 *
 * Each test asserts 200 + top-level response shape. Deeper behaviour tested
 * via downstream integration (Vercel preview smoke against live data).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Row {
  [k: string]: unknown
}
interface QueryState {
  table: string
  rows: Row[]
  count: number | null
}

// Stateful holder · each test overrides what each .from('table') returns.
let nextResults: Record<string, { data: Row[]; count?: number | null }> = {}

function makeQuery(table: string) {
  const state: QueryState = {
    table,
    rows: nextResults[table]?.data ?? [],
    count: nextResults[table]?.count ?? null,
  }
  // Chainable proxy · every chain method returns self · terminal awaits
  // resolve to { data, count, error }.
  const chain: Record<string, (...args: unknown[]) => unknown> & PromiseLike<unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () =>
      Promise.resolve({ data: state.rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: state.rows[0] ?? null, error: null }),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: state.rows, count: state.count, error: null }).then(onFulfilled),
  } as Record<string, (...args: unknown[]) => unknown> & PromiseLike<unknown>
  return chain
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => makeQuery(table),
    storage: {
      from: () => ({
        list: () =>
          Promise.resolve({
            data: [{ name: 'hero.png', id: 'abc', updated_at: '2026-05-16T00:00:00Z' }],
            error: null,
          }),
      }),
    },
  }),
}))

beforeEach(() => {
  nextResults = {}
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

const buildReq = (path: string) => new Request(`http://localhost:3000${path}`)

describe('GET /api/dashboard/agents', () => {
  it('returns 200 + agents list with stats_30d shape', async () => {
    nextResults = {
      agents: {
        data: [
          {
            id: 'a1',
            name: 'brand_strategist',
            display_name: 'Brand Strategist',
            role: 'empleado',
            model: 'claude-opus-4-6',
            status: 'active',
            identity_content: 'x'.repeat(500),
            identity_source: 'registry:brand-strategist',
          },
        ],
      },
      agent_invocations: {
        data: [
          {
            agent_id: 'brand_strategist',
            cost_usd: 0.5,
            tokens_input: 100,
            tokens_output: 200,
            ended_at: '2026-05-16T10:00:00Z',
          },
        ],
      },
    }
    const { GET } = await import('../src/app/api/dashboard/agents/route')
    const res = await GET(buildReq('/api/dashboard/agents'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(1)
    expect(json.agents[0].name).toBe('brand_strategist')
    expect(json.agents[0].stats_30d.sessions).toBe(1)
    expect(json.agents[0].stats_30d.cost_usd).toBeCloseTo(0.5)
    expect(json.agents[0].identity_chars).toBe(500)
  })
})

describe('GET /api/dashboard/agents/[slug]', () => {
  it('returns 200 + agent detail with timeline_30d', async () => {
    nextResults = {
      agents: {
        data: [
          {
            id: 'a1',
            name: 'brand_strategist',
            display_name: 'Brand Strategist',
            role: 'empleado',
            model: 'claude-opus-4-6',
            status: 'active',
            identity_content: 'x'.repeat(500),
            identity_source: 'registry:brand-strategist',
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-16T00:00:00Z',
          },
        ],
      },
      agent_invocations: {
        data: [
          {
            id: 'inv-1',
            session_id: 's-1',
            agent_id: 'brand_strategist',
            agent_name: 'Brand Strategist',
            client_id: 'c-1',
            model: 'claude-opus-4-6',
            started_at: '2026-05-16T10:00:00Z',
            ended_at: '2026-05-16T10:00:05Z',
            duration_ms: 5000,
            cost_usd: 0.5,
            tokens_input: 100,
            tokens_output: 200,
            status: 'completed',
            metadata: {},
          },
        ],
      },
      agent_image_generations: { data: [] },
    }
    const { GET } = await import('../src/app/api/dashboard/agents/[slug]/route')
    const res = await GET(buildReq('/api/dashboard/agents/brand-strategist'), {
      params: Promise.resolve({ slug: 'brand-strategist' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.agent.name).toBe('brand_strategist')
    expect(json.invocations).toHaveLength(1)
    expect(json.timeline_30d).toHaveLength(1)
    expect(json.timeline_30d[0].sessions).toBe(1)
  })

  it('returns 404 when agent not found', async () => {
    nextResults = { agents: { data: [] } }
    const { GET } = await import('../src/app/api/dashboard/agents/[slug]/route')
    const res = await GET(buildReq('/api/dashboard/agents/nonexistent'), {
      params: Promise.resolve({ slug: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/dashboard/clients', () => {
  it('returns 200 + clients list with stats', async () => {
    nextResults = {
      clients: {
        data: [
          {
            id: 'c-1',
            name: 'Náufrago',
            slug: 'naufrago',
            website_url: null,
            domain: 'naufrago.ec',
            industry: 'ghost-kitchen',
            market: 'EC',
            country: 'EC',
            language: 'es',
            status: 'active',
            logo_url: null,
            brand_colors: ['#0D5C6B'],
            created_at: '2026-05-15T00:00:00Z',
            updated_at: '2026-05-16T00:00:00Z',
          },
        ],
      },
      agent_invocations: {
        data: [
          { client_id: 'c-1', agent_id: 'brand_strategist', cost_usd: 0.5 },
          { client_id: 'c-1', agent_id: 'creative-director', cost_usd: 0.3 },
        ],
      },
    }
    const { GET } = await import('../src/app/api/dashboard/clients/route')
    const res = await GET(buildReq('/api/dashboard/clients'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(1)
    expect(json.clients[0].slug).toBe('naufrago')
    expect(json.clients[0].stats.invocations).toBe(2)
    expect(json.clients[0].stats.agents_touched).toBe(2)
    expect(json.clients[0].stats.total_spend_usd).toBeCloseTo(0.8)
  })
})

describe('GET /api/dashboard/clients/[id]', () => {
  it('returns 200 + client detail with agents_worked + files', async () => {
    nextResults = {
      clients: {
        data: [
          {
            id: 'c-1',
            name: 'Náufrago',
            slug: 'naufrago',
            domain: 'naufrago.ec',
            industry: 'ghost-kitchen',
            country: 'EC',
            status: 'active',
            brand_colors: ['#0D5C6B'],
          },
        ],
      },
      agent_invocations: {
        data: [
          {
            id: 'inv-1',
            agent_id: 'brand_strategist',
            agent_name: 'Brand Strategist',
            model: 'claude-opus-4-6',
            cost_usd: 0.5,
            tokens_input: 100,
            tokens_output: 200,
            started_at: '2026-05-16T10:00:00Z',
            ended_at: '2026-05-16T10:00:05Z',
            status: 'completed',
            metadata: {},
          },
        ],
      },
      client_journey_state: { data: [] },
    }
    const { GET } = await import('../src/app/api/dashboard/clients/[id]/route')
    const res = await GET(buildReq('/api/dashboard/clients/c-1'), {
      params: Promise.resolve({ id: 'c-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.client.slug).toBe('naufrago')
    expect(json.agents_worked).toHaveLength(1)
    expect(json.agents_worked[0].sessions).toBe(1)
    expect(json.files).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'hero.png' })]))
  })

  it('returns 404 when client not found', async () => {
    nextResults = { clients: { data: [] } }
    const { GET } = await import('../src/app/api/dashboard/clients/[id]/route')
    const res = await GET(buildReq('/api/dashboard/clients/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/dashboard/metrics', () => {
  it('returns 200 + totals shape with workflows_n8n field', async () => {
    nextResults = {
      agents: { data: [], count: 54 },
      clients: { data: [], count: 3 },
      agent_invocations: {
        data: [{ cost_usd: 1.5, started_at: '2026-05-16T00:00:00Z' }],
      },
      agent_image_generations: {
        data: [{ cost_usd: 0.04, created_at: '2026-05-16T00:00:00Z' }],
      },
    }
    // n8n fetch will fail in test env (no N8N_BASE_URL) → workflows_n8n returns null
    const { GET } = await import('../src/app/api/dashboard/metrics/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.totals).toHaveProperty('agents_total')
    expect(json.totals).toHaveProperty('clients_total')
    expect(json.totals).toHaveProperty('spend_usd_total')
    expect(json.totals).toHaveProperty('spend_usd_30d')
    expect(json.totals).toHaveProperty('workflows_n8n')
  })
})

describe('GET /api/dashboard/activity', () => {
  it('returns 200 + activity feed shape', async () => {
    nextResults = {
      agent_invocations: {
        data: [
          {
            id: 'inv-1',
            session_id: 's-1',
            agent_id: 'brand_strategist',
            agent_name: 'Brand Strategist',
            client_id: 'c-1',
            model: 'claude-opus-4-6',
            cost_usd: 0.5,
            duration_ms: 5000,
            status: 'completed',
            started_at: '2026-05-16T10:00:00Z',
            ended_at: '2026-05-16T10:00:05Z',
          },
        ],
      },
    }
    const { GET } = await import('../src/app/api/dashboard/activity/route')
    const res = await GET(buildReq('/api/dashboard/activity?limit=10'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(1)
    expect(json.activity[0].id).toBe('inv-1')
    expect(json.filters.limit).toBe(10)
  })

  it('respects limit clamp', async () => {
    nextResults = { agent_invocations: { data: [] } }
    const { GET } = await import('../src/app/api/dashboard/activity/route')
    const res = await GET(buildReq('/api/dashboard/activity?limit=99999'))
    const json = await res.json()
    expect(json.filters.limit).toBe(200) // clamped to max
  })
})

describe('GET /api/dashboard/realtime', () => {
  it('returns 200 + supabase_url + anon_key + channels map', async () => {
    const { GET } = await import('../src/app/api/dashboard/realtime/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.supabase_url).toBe('https://test.supabase.co')
    expect(json.anon_key).toBe('test-anon-key')
    expect(json.channels).toHaveProperty('agent_invocations')
    expect(json.channels).toHaveProperty('agent_image_generations')
    expect(json.channels).toHaveProperty('clients')
    expect(json.channels.agent_invocations.events).toContain('INSERT')
  })

  it('returns 500 when supabase env not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const { GET } = await import('../src/app/api/dashboard/realtime/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
