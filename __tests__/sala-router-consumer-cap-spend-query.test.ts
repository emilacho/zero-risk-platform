/**
 * Tests · cap-spend-query Supabase wire (SPEC lazo agentico 2026-06-05).
 *
 * The query closure sums `agent_invocations.cost_usd` per tenant or per
 * correlation depending on strategy · returns 0 on error · graceful.
 */
import { describe, it, expect } from 'vitest'
import { wireCapSpendQuerySupabase } from '@/lib/sala-router-consumer'

const TENANT = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const CORR = 'corr-test-1'
const STREAM = 'stream-test-1'

function makeSupabase(
  rows: Array<{ cost_usd: number | string | null }> | null,
  error: Error | null = null,
) {
  const calls: Array<{ table: string; filters: Record<string, string> }> = []
  let lastFilters: Record<string, string> = {}
  const from = (table: string) => ({
    select(_cols: string) {
      lastFilters = {}
      const builder = {
        eq(col: string, val: string) {
          lastFilters[col] = val
          return builder
        },
        gte(col: string, val: string) {
          lastFilters[col] = val
          return builder
        },
        then(resolve: (v: { data: typeof rows; error: Error | null }) => unknown) {
          calls.push({ table, filters: { ...lastFilters } })
          return resolve({ data: rows, error })
        },
      }
      return builder
    },
  })
  return { fake: { from } as never, calls }
}

describe('wireCapSpendQuerySupabase · strategy=correlation (canonical)', () => {
  it('SUMs cost_usd filtering by tenant_id + correlation_id', async () => {
    const { fake, calls } = makeSupabase([
      { cost_usd: 1.5 },
      { cost_usd: '0.51' },
      { cost_usd: null },
    ])
    const query = wireCapSpendQuerySupabase(fake)
    const total = await query({ tenant_id: TENANT, stream_id: STREAM, correlation_id: CORR })
    expect(total).toBeCloseTo(2.01)
    expect(calls[0].table).toBe('agent_invocations')
    expect(calls[0].filters.tenant_id).toBe(TENANT)
    expect(calls[0].filters.correlation_id).toBe(CORR)
  })

  it('returns 0 when supabase throws / errors', async () => {
    const { fake } = makeSupabase(null, new Error('db down'))
    const query = wireCapSpendQuerySupabase(fake)
    expect(
      await query({ tenant_id: TENANT, stream_id: STREAM, correlation_id: CORR }),
    ).toBe(0)
  })

  it('returns 0 when no rows', async () => {
    const { fake } = makeSupabase([])
    const query = wireCapSpendQuerySupabase(fake)
    expect(
      await query({ tenant_id: TENANT, stream_id: STREAM, correlation_id: CORR }),
    ).toBe(0)
  })
})

describe('wireCapSpendQuerySupabase · strategy=tenant_window', () => {
  it('filters by tenant_id + started_at gte floor', async () => {
    const { fake, calls } = makeSupabase([{ cost_usd: 0.25 }])
    const query = wireCapSpendQuerySupabase(fake, {
      strategy: 'tenant_window',
      window_floor_iso: '2026-06-06T00:00:00Z',
    })
    const total = await query({ tenant_id: TENANT, stream_id: STREAM, correlation_id: CORR })
    expect(total).toBe(0.25)
    expect(calls[0].filters.tenant_id).toBe(TENANT)
    expect(calls[0].filters.started_at).toBe('2026-06-06T00:00:00Z')
  })
})
