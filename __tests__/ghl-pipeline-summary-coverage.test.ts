/**
 * Coverage gap-fill · GET /api/ghl/pipeline-summary (W17-T2/T3).
 *
 * The base test (ghl-pipeline-summary.test.ts) only hits the table-missing
 * fallback. This file targets W17-T1 baseline gaps:
 *
 *  - Lines 93-106: stage aggregation when DB returns rows (Set dedup,
 *                  push, totals reduce).
 *  - Lines 115-118: catch-branch stub fallback.
 *  - Plus the optional `pipeline_id` filter which adds an extra .eq() to the chain.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The route's chain ends at: ...order().limit(20) THEN optionally .eq('ghl_pipeline_id', x)
// So `.limit(20)` must return a thenable that ALSO has an `.eq` method that
// returns the same thenable. We make limit() return a chainable Promise.
function makeChain(resolveTo: unknown) {
  const promise: Promise<unknown> & { eq?: (..._: unknown[]) => unknown } =
    Promise.resolve(resolveTo)
  promise.eq = () => promise
  return promise
}

let chainState: { result: { data: unknown; error: unknown } | null; throws: boolean } = {
  result: { data: null, error: null },
  throws: false,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              if (chainState.throws) throw new Error('table missing — sync throw')
              return makeChain(chainState.result)
            },
          }),
        }),
      }),
    }),
  }),
}))

import { GET } from '../src/app/api/ghl/pipeline-summary/route'

const VALID_KEY = 'gap-fill-ghl-pipeline-summary-key'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
  chainState = { result: { data: null, error: null }, throws: false }
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string): Request {
  return new Request(`http://localhost/api/ghl/pipeline-summary${qs}`, {
    method: 'GET',
    headers: { 'x-api-key': VALID_KEY },
  })
}

describe('GET /api/ghl/pipeline-summary · gap-fill (W17-T2/T3)', () => {
  it('real-data branch · aggregates stages (latest snapshot per stage_name)', async () => {
    chainState.result = {
      data: [
        // Newest first (route relies on order desc). Same stage_name should be deduped.
        { stage_name: 'Discovery', deal_count: 5, value_usd: 50_000, weighted_value_usd: 25_000, captured_at: '2026-04-30' },
        { stage_name: 'Proposal', deal_count: 3, value_usd: 90_000, weighted_value_usd: 60_000, captured_at: '2026-04-30' },
        { stage_name: 'Discovery', deal_count: 99, value_usd: 999, weighted_value_usd: 999, captured_at: '2026-04-25' }, // older, deduped
        { stage_name: 'Closed Won', deal_count: 2, value_usd: 120_000, weighted_value_usd: 120_000, captured_at: '2026-04-30' },
      ],
      error: null,
    }

    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.fallback_mode).toBeUndefined()
    expect(body.stages).toHaveLength(3) // Discovery deduped to 1
    const stageNames = body.stages.map((s: { stage_name: string }) => s.stage_name)
    expect(stageNames).toEqual(['Discovery', 'Proposal', 'Closed Won'])

    // Totals: deals = 5+3+2 = 10, value = 50000+90000+120000 = 260000
    expect(body.totals.deals).toBe(10)
    expect(body.totals.value_usd).toBe(260_000)
    // Weighted uses ALL data rows (incl old Discovery): 25000+60000+999+120000 = 205999
    expect(body.totals.weighted_value_usd).toBe(205_999)
  })

  it('real-data branch · coerces non-numeric deal_count + value_usd to 0', async () => {
    chainState.result = {
      data: [
        { stage_name: 'Limbo', deal_count: 'eight' as never, value_usd: null as never, weighted_value_usd: 'na' as never, captured_at: '2026-04-30' },
      ],
      error: null,
    }
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.stages[0]).toMatchObject({ stage_name: 'Limbo', deal_count: 0, value_usd: 0 })
    expect(body.totals.weighted_value_usd).toBe(0)
  })

  it('pipeline_id query param flows through the .eq() filter without breaking the chain', async () => {
    chainState.result = {
      data: [{ stage_name: 'X', deal_count: 1, value_usd: 100, weighted_value_usd: 50, captured_at: '2026-04-30' }],
      error: null,
    }
    const res = await GET(req('?client_id=acme&pipeline_id=pipe-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pipeline_id).toBe('pipe-123')
    expect(body.stages).toHaveLength(1)
  })

  it('catch branch · supabase throws → stub fallback with fallback_mode=true', async () => {
    chainState.throws = true
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fallback_mode).toBe(true)
    expect(Array.isArray(body.stages)).toBe(true)
    expect(body.stages.length).toBeGreaterThan(0) // stub returns canned stages
  })
})
