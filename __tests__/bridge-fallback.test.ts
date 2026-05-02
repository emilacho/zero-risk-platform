/**
 * Unit tests · src/lib/bridge-fallback.ts (W17 · CC#2 · T2).
 *
 * Verifies the 3 helper variants (withSupabaseResult, withFallback,
 * ladderFallback) plus the Sentry-breadcrumb path is invoked on degradation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock @sentry/nextjs BEFORE importing the helper so the dynamic import inside
// the helper resolves to our spy. vitest hoists vi.mock to the top.
const addBreadcrumb = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb,
}))

import { withSupabaseResult, withFallback, ladderFallback } from '../src/lib/bridge-fallback'

beforeEach(() => {
  addBreadcrumb.mockClear()
})

describe('withSupabaseResult', () => {
  it('happy path · op resolves with data + no error → {data, fallback_mode:false}', async () => {
    const r = await withSupabaseResult(async () => ({ data: { id: 'row-1' }, error: null }))
    expect(r.fallback_mode).toBe(false)
    expect(r.data).toEqual({ id: 'row-1' })
    expect(r.reason).toBeUndefined()
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })

  it('error branch · supabase returns error → fallback + Sentry breadcrumb', async () => {
    const r = await withSupabaseResult(
      async () => ({ data: null, error: { message: 'relation does not exist' } }),
      { context: '/api/test-endpoint' },
    )
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBeNull()
    expect(r.reason).toMatch(/relation does not exist/)
    // Wait one tick so the lazy `await import` inside emitSentryBreadcrumb resolves.
    await new Promise((res) => setTimeout(res, 0))
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'bridge-fallback',
        level: 'warning',
        message: expect.stringContaining('/api/test-endpoint'),
      }),
    )
  })

  it('exception branch · op throws → fallback with the exception message', async () => {
    const r = await withSupabaseResult(async () => {
      throw new Error('network offline')
    })
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBeNull()
    expect(r.reason).toMatch(/network offline/)
  })
})

describe('withFallback (generic)', () => {
  it('happy path · op resolves → returns its data + fallback_mode:false', async () => {
    const r = await withFallback(async () => [1, 2, 3], [])
    expect(r.fallback_mode).toBe(false)
    expect(r.data).toEqual([1, 2, 3])
  })

  it('exception branch · op throws → returns the supplied fallback + reason', async () => {
    const r = await withFallback<string[]>(
      async () => {
        throw new Error('upstream 503')
      },
      ['stub'],
      { context: '/api/external' },
    )
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toEqual(['stub'])
    expect(r.reason).toMatch(/upstream 503/)
  })
})

describe('ladderFallback', () => {
  it('first tier wins · returns its data + no fallback_mode', async () => {
    const r = await ladderFallback<string>([
      async () => 'preferred',
      async () => 'heuristic',
      async () => 'stub',
    ])
    expect(r.fallback_mode).toBe(false)
    expect(r.data).toBe('preferred')
  })

  it('falls through to deeper tier · marks fallback_mode but returns data', async () => {
    const r = await ladderFallback<string>([
      async () => null,
      async () => {
        throw new Error('source 2 down')
      },
      async () => 'stub-payload',
    ])
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBe('stub-payload')
    expect(r.reason).toMatch(/served by tier 2/)
    // Sentry got the tier-2 throw breadcrumb (lazy import — flush microtasks).
    await new Promise((res) => setTimeout(res, 0))
    expect(addBreadcrumb).toHaveBeenCalled()
  })

  it('all tiers exhausted · returns null + fallback_mode + final reason', async () => {
    const r = await ladderFallback<string>([
      async () => null,
      async () => null,
      async () => null,
    ])
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBeNull()
    expect(r.reason).toMatch(/all tiers exhausted/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// W18-T3 · CC#3 · 5 additional edge cases on top of CC#2's W17 baseline.
// ───────────────────────────────────────────────────────────────────────────

describe('withSupabaseResult · W18 edge cases', () => {
  it('PGRST116 (no rows found) · treated as fallback with code-bearing reason', async () => {
    // Supabase returns PGRST116 when .single() finds 0 rows. Some callers want
    // this in the fallback path so the endpoint can downgrade gracefully
    // rather than 500. The helper currently routes any non-null `error` to
    // fallback regardless of code — this test pins that contract.
    const r = await withSupabaseResult(
      async () => ({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned · PGRST116' } }),
      { context: '/api/example/single-row' },
    )
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBeNull()
    expect(r.reason).toMatch(/PGRST116/)
  })
})

describe('withFallback · W18 edge cases', () => {
  it('timeout · op rejects after racing AbortController-style → returns supplied fallback + reason', async () => {
    const timeoutOp = () =>
      new Promise<string[]>((_resolve, reject) => {
        setTimeout(() => reject(new Error('op timed out after 25ms')), 25)
      })
    const start = Date.now()
    const r = await withFallback<string[]>(timeoutOp, ['fallback-payload'], { context: '/api/slow-upstream' })
    const elapsed = Date.now() - start
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toEqual(['fallback-payload'])
    expect(r.reason).toMatch(/timed out/)
    expect(elapsed).toBeGreaterThanOrEqual(20)
    // Sentry breadcrumb fires on timeout-as-exception (lazy import).
    await new Promise((res) => setTimeout(res, 0))
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('/api/slow-upstream') }),
    )
  })
})

describe('ladderFallback · W18 edge cases', () => {
  it('N=4 tiers · first succeeds, last 3 fail · short-circuits at tier 0 (lazy)', async () => {
    const tier1 = vi.fn(async () => null)
    const tier2 = vi.fn(async () => { throw new Error('t2 down') })
    const tier3 = vi.fn(async () => null)
    const r = await ladderFallback<string>([
      async () => 'tier-0-data',
      tier1,
      tier2,
      tier3,
    ])
    expect(r.fallback_mode).toBe(false)
    expect(r.data).toBe('tier-0-data')
    // Lazy: tiers 1-3 must NOT be invoked when tier 0 wins.
    expect(tier1).not.toHaveBeenCalled()
    expect(tier2).not.toHaveBeenCalled()
    expect(tier3).not.toHaveBeenCalled()
  })

  it('N=4 tiers · last 3 fail, tier 0 also fails · returns final reason from last tier', async () => {
    const r = await ladderFallback<string>([
      async () => { throw new Error('t0 fails') },
      async () => null,
      async () => { throw new Error('t2 fails') },
      async () => null,
    ], { context: '/api/4-tier-source' })
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toBeNull()
    expect(r.reason).toMatch(/all tiers exhausted/)
    expect(r.reason).toMatch(/tier 3 returned null\/undefined/)
    // Sentry got at least one tier-throw breadcrumb plus the final exhaust breadcrumb.
    await new Promise((res) => setTimeout(res, 0))
    expect(addBreadcrumb.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('combined · withSupabaseResult inside ladderFallback', () => {
  it('preferred Supabase tier fails → ladder falls through to stub tier · ladder reports degraded', async () => {
    // Realistic chain: tier 0 hits Supabase via withSupabaseResult, tier 1 is
    // a deterministic stub. Confirms the two helpers compose cleanly without
    // double-counting fallback_mode.
    const r = await ladderFallback<{ id: string }>([
      async () => {
        const inner = await withSupabaseResult<{ id: string }>(
          async () => ({ data: null, error: { message: 'connection refused' } }),
          { context: '/api/composed/tier-0' },
        )
        // When the inner helper degrades, return null so ladder moves on.
        return inner.fallback_mode ? null : inner.data
      },
      async () => ({ id: 'stub-row' }),
    ], { context: '/api/composed' })
    expect(r.fallback_mode).toBe(true)
    expect(r.data).toEqual({ id: 'stub-row' })
    expect(r.reason).toMatch(/served by tier 1/)
    // The inner withSupabaseResult emitted a Sentry breadcrumb for tier-0's DB error.
    await new Promise((res) => setTimeout(res, 0))
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('/api/composed/tier-0') }),
    )
  })
})
