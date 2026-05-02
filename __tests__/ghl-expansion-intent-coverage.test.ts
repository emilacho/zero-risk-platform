/**
 * Coverage gap-fill · GET /api/ghl/expansion-intent (W17-T2/T3).
 *
 * The base test file (ghl-expansion-intent.test.ts) only hits the
 * table-missing fallback path. This file targets the two uncovered
 * branches surfaced by the W17-T1 baseline:
 *
 *  - Lines 99-110: real-signals branch (DB returns populated rows → score
 *                  computation, signal mapping, rationale fallback).
 *  - Lines 122-126: catch branch (supabase throws synchronously → stub
 *                   fallback path mirrors the soft-error path).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Configurable mock — each test programs the .limit() resolver before calling GET.
let limitResolver: () => Promise<{ data: unknown; error: unknown }> = async () => ({
  data: null,
  error: null,
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: (..._args: unknown[]) => limitResolver(),
            }),
          }),
        }),
      }),
    }),
  }),
}))

import { GET } from '../src/app/api/ghl/expansion-intent/route'

const VALID_KEY = 'gap-fill-ghl-expansion-intent-key'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
  limitResolver = async () => ({ data: null, error: null })
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string): Request {
  return new Request(`http://localhost/api/ghl/expansion-intent${qs}`, {
    method: 'GET',
    headers: { 'x-api-key': VALID_KEY },
  })
}

describe('GET /api/ghl/expansion-intent · gap-fill (W17-T2/T3)', () => {
  it('real-signals branch · maps DB rows + uses explicit score column when present', async () => {
    limitResolver = async () => ({
      data: [
        { signal: 'increased_login', strength: 0.8, observed_at: '2026-04-30T10:00:00Z', score: 78, rationale: 'Strong activity' },
        { signal: 'team_seat_at_capacity', strength: 0.5, observed_at: '2026-04-25T10:00:00Z', score: null, rationale: null },
      ],
      error: null,
    })

    const res = await GET(req('?client_id=acme-real'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.fallback_mode).toBeUndefined() // not in stub mode
    expect(body.signals).toHaveLength(2)
    expect(body.signals[0]).toMatchObject({
      signal: 'increased_login',
      strength: 0.8,
      observed_at: '2026-04-30T10:00:00Z',
    })
    expect(body.score).toBe(78) // takes explicit score from latest row
    expect(body.rationale).toBe('Strong activity')
  })

  it('real-signals branch · falls back to avg(strength)*100 when no score column', async () => {
    limitResolver = async () => ({
      data: [
        { signal: 'a', strength: 0.6, observed_at: '2026-04-30T00:00:00Z' },
        { signal: 'b', strength: 0.4, observed_at: '2026-04-29T00:00:00Z' },
      ],
      error: null,
    })

    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    // (0.6 + 0.4) / 2 * 100 = 50, but floor is 30, so result = max(30, 50) = 50
    expect(body.score).toBe(50)
    expect(body.rationale).toMatch(/2 signals in last/i)
  })

  it('real-signals branch · honors 30-pt floor when avg score below it', async () => {
    limitResolver = async () => ({
      data: [{ signal: 'x', strength: 0.05, observed_at: '2026-04-30T00:00:00Z' }],
      error: null,
    })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.score).toBe(30) // 0.05 * 100 = 5 → clamped to floor 30
  })

  it('real-signals branch · coerces non-numeric strength to 0', async () => {
    limitResolver = async () => ({
      data: [{ signal: 'broken', strength: 'not-a-number', observed_at: '2026-04-30T00:00:00Z' }],
      error: null,
    })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.signals[0].strength).toBe(0)
  })

  it('catch branch · supabase throws synchronously → stub fallback with fallback_mode=true', async () => {
    limitResolver = async () => {
      throw new Error('connection refused')
    }
    const res = await GET(req('?client_id=acme-throw'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fallback_mode).toBe(true)
    expect(body.score).toBe(35) // base stub for non-smoke clients
    expect(body.signals.length).toBeGreaterThan(0)
  })
})
