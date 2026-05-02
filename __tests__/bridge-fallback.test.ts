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
