/**
 * Unit tests for src/app/api/cost-monitor/cron/route.ts (§150 G5 SHADOW).
 *
 * Verifies:
 *  - 401 when no auth header
 *  - 401 when Bearer secret mismatched
 *  - 200 + correct JSON shape with no breaches when costs are below thresholds
 *  - detects daily_per_workflow breach when one workflow > $10/24h
 *  - detects hourly_burst breach when 1h aggregate > $30
 *  - detects daily_aggregate breach when 24h aggregate > $100
 *  - alert_dispatched is ALWAYS false (SHADOW-first guarantee)
 *  - INSERT into cost_monitor_runs happens with is_breach + details JSONB
 *  - supabase aggregation error → 500 + audit row with error_message
 *  - accepts x-api-key header as alternative to Authorization Bearer
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Build a stub supabase client that returns canned rows from agent_invocations
// and records calls to cost_monitor_runs.insert.
let stubRows24h: Array<{ workflow_id: string | null; cost_usd: number | null }> = []
let stubRows1h: Array<{ workflow_id: string | null; cost_usd: number | null }> = []
let stubError24: { message: string } | null = null
let stubError1: { message: string } | null = null
const monitorInserts: Array<Record<string, unknown>> = []
const monitorUpdates: Array<{ id: string; patch: Record<string, unknown> }> = []

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'agent_invocations') {
        return {
          select: () => ({
            gte: (col: string, val: string) => {
              const oneHourAgo = Date.now() - 3600_000
              const valTs = new Date(val).getTime()
              const isHourQuery = valTs >= oneHourAgo - 5000
              return Promise.resolve({
                data: isHourQuery ? stubRows1h : stubRows24h,
                error: isHourQuery ? stubError1 : stubError24,
              })
            },
          }),
        }
      }
      if (table === 'cost_monitor_runs') {
        return {
          insert: (row: Record<string, unknown>) => {
            monitorInserts.push(row)
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'test-run-id-' + monitorInserts.length },
                    error: null,
                  }),
              }),
            }
          },
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              monitorUpdates.push({ id, patch })
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  })),
}))

// Mock the Slack alert dispatcher. Default · webhook configured and returns
// dispatched: true. Individual tests override via dispatchMock.mockResolvedValueOnce().
interface MockDispatchResult { dispatched: boolean; reason?: string }
const dispatchMock = vi.fn(
  async (_input: unknown): Promise<MockDispatchResult> => ({ dispatched: true }),
)
vi.mock('@/lib/cost-monitor-alert', () => ({
  dispatchCostMonitorAlert: (input: unknown) => dispatchMock(input),
}))

import { GET, POST } from '../src/app/api/cost-monitor/cron/route'

const ORIG_SECRET = process.env.CRON_SECRET
const ORIG_SHADOW = process.env.COST_MONITOR_SHADOW_MODE

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret-1234'
  process.env.COST_MONITOR_SHADOW_MODE = '1'
  stubRows24h = []
  stubRows1h = []
  stubError24 = null
  stubError1 = null
  monitorInserts.length = 0
  monitorUpdates.length = 0
  dispatchMock.mockReset()
  dispatchMock.mockImplementation(async () => ({ dispatched: true }))
})

afterEach(() => {
  if (ORIG_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIG_SECRET
  if (ORIG_SHADOW === undefined) delete process.env.COST_MONITOR_SHADOW_MODE
  else process.env.COST_MONITOR_SHADOW_MODE = ORIG_SHADOW
})

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cost-monitor/cron', {
    method: 'POST',
    headers,
  })
}

describe('GET/POST /api/cost-monitor/cron · auth', () => {
  it('401 when no auth header', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('unauthorized')
  })

  it('401 when Bearer secret mismatched', async () => {
    const res = await POST(req({ authorization: 'Bearer wrong-secret' }))
    expect(res.status).toBe(401)
  })

  it('200 with Authorization Bearer matching CRON_SECRET', async () => {
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(res.status).toBe(200)
  })

  it('200 with x-api-key matching CRON_SECRET (manual smoke alt)', async () => {
    const res = await POST(req({ 'x-api-key': 'test-secret-1234' }))
    expect(res.status).toBe(200)
  })

  it('GET verb also works (Vercel Cron sends GET by default)', async () => {
    const res = await GET(req({ authorization: 'Bearer test-secret-1234' }))
    expect(res.status).toBe(200)
  })
})

describe('GET/POST /api/cost-monitor/cron · SHADOW-first guarantee', () => {
  it('alert_dispatched is ALWAYS false even when breach detected', async () => {
    stubRows24h = [
      { workflow_id: 'spammy-wf', cost_usd: 50 }, // >$10 daily_per_workflow
    ]
    stubRows1h = [
      { workflow_id: 'spammy-wf', cost_usd: 40 }, // >$30 hourly burst
    ]
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.alert_dispatched).toBe(false)
    expect(json.shadow_mode).toBe(true)
    expect(json.is_breach).toBe(true)
  })

  it('shadow_mode flag in response defaults to true', async () => {
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.shadow_mode).toBe(true)
  })

  it('shadow_mode toggles to false when COST_MONITOR_SHADOW_MODE=0 (no breach · no dispatch)', async () => {
    process.env.COST_MONITOR_SHADOW_MODE = '0'
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.shadow_mode).toBe(false)
    expect(json.alert_dispatched).toBe(false) // no breach → no dispatch attempted
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('shadow=true + breach · dispatch NOT called (SHADOW guard)', async () => {
    process.env.COST_MONITOR_SHADOW_MODE = '1'
    stubRows1h = [{ workflow_id: 'spammy', cost_usd: 35 }] // > $30 burst
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.is_breach).toBe(true)
    expect(json.alert_dispatched).toBe(false)
    expect(dispatchMock).not.toHaveBeenCalled()
  })
})

describe('GET/POST /api/cost-monitor/cron · alert-live dispatch (shadow=0)', () => {
  beforeEach(() => {
    process.env.COST_MONITOR_SHADOW_MODE = '0'
  })

  it('shadow=false + breach · dispatch called + alert_dispatched=true in response', async () => {
    stubRows1h = [{ workflow_id: 'spammy', cost_usd: 35 }] // > $30 burst
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.is_breach).toBe(true)
    expect(json.alert_dispatched).toBe(true)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    const dispatchArg = dispatchMock.mock.calls[0][0] as Record<string, unknown>
    expect(Array.isArray(dispatchArg.breaches)).toBe(true)
    expect((dispatchArg.breaches as unknown[]).length).toBeGreaterThan(0)
    expect(dispatchArg.run_id).toMatch(/^test-run-id-/)
  })

  it('shadow=false + breach · cost_monitor_runs.alert_dispatched flipped to true via UPDATE', async () => {
    stubRows1h = [{ workflow_id: 'spammy', cost_usd: 35 }]
    await POST(req({ authorization: 'Bearer test-secret-1234' }))
    // The initial INSERT writes alert_dispatched: false (audit trail first),
    // then the UPDATE flips it to true after successful dispatch.
    expect(monitorInserts[0].alert_dispatched).toBe(false)
    expect(monitorUpdates).toHaveLength(1)
    expect(monitorUpdates[0].patch.alert_dispatched).toBe(true)
  })

  it('shadow=false + breach + webhook failure · alert_dispatched=false but 200 still', async () => {
    dispatchMock.mockResolvedValueOnce({
      dispatched: false,
      reason: 'webhook returned 500 internal',
    })
    stubRows1h = [{ workflow_id: 'spammy', cost_usd: 35 }]
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.alert_dispatched).toBe(false)
    expect(json.alert_reason).toContain('webhook returned 500')
    // No UPDATE issued when dispatch fails · row remains alert_dispatched: false
    expect(monitorUpdates).toHaveLength(0)
  })

  it('shadow=false + no breach · dispatch NOT called', async () => {
    stubRows24h = [{ workflow_id: 'normal', cost_usd: 1 }]
    stubRows1h = [{ workflow_id: 'normal', cost_usd: 0.5 }]
    await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(dispatchMock).not.toHaveBeenCalled()
  })
})

describe('GET/POST /api/cost-monitor/cron · threshold breaches', () => {
  it('no breaches when costs are below thresholds', async () => {
    stubRows24h = [
      { workflow_id: 'normal-wf', cost_usd: 3.5 },
      { workflow_id: 'other-wf', cost_usd: 1.2 },
    ]
    stubRows1h = [{ workflow_id: 'normal-wf', cost_usd: 0.5 }]
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.is_breach).toBe(false)
    expect(json.breach_count).toBe(0)
    expect(json.breaches).toEqual([])
  })

  it('detects daily_per_workflow breach (>$10/24h for single workflow)', async () => {
    stubRows24h = [
      { workflow_id: 'spammy-wf', cost_usd: 12.5 },
      { workflow_id: 'normal-wf', cost_usd: 2 },
    ]
    stubRows1h = []
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.is_breach).toBe(true)
    const breaches = json.breaches as Array<Record<string, unknown>>
    expect(breaches.some((b) => b.type === 'daily_per_workflow' && b.workflow_id === 'spammy-wf')).toBe(true)
  })

  it('detects hourly_burst breach (>$30/1h aggregate)', async () => {
    stubRows24h = []
    stubRows1h = [
      { workflow_id: 'wf-a', cost_usd: 20 },
      { workflow_id: 'wf-b', cost_usd: 15 }, // sum=35 > $30 burst threshold
    ]
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    const breaches = json.breaches as Array<Record<string, unknown>>
    expect(breaches.some((b) => b.type === 'hourly_burst')).toBe(true)
    // Umbral de alerta subido a $30 el 2026-07-02 (Emilio §144) · el patrón
    // fino NEXUS-style (≈$19/día) queda cubierto por los umbrales DIARIOS.
  })

  it('detects daily_aggregate breach (>$100/24h platform-wide)', async () => {
    stubRows24h = Array.from({ length: 12 }, (_, i) => ({
      workflow_id: `wf-${i}`,
      cost_usd: 9, // 12 * 9 = $108 > $100 aggregate threshold
    }))
    stubRows1h = []
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    const breaches = json.breaches as Array<Record<string, unknown>>
    expect(breaches.some((b) => b.type === 'daily_aggregate')).toBe(true)
  })

  it('three breach types can co-occur in one run', async () => {
    stubRows24h = Array.from({ length: 12 }, (_, i) =>
      i === 0
        ? { workflow_id: 'spammy', cost_usd: 50 } // triggers daily_per_workflow
        : { workflow_id: `wf-${i}`, cost_usd: 9 }, // sum drives daily_aggregate >100
    )
    stubRows1h = [{ workflow_id: 'spammy', cost_usd: 35 }] // triggers hourly_burst (>$30)
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const json = (await res.json()) as Record<string, unknown>
    expect(json.breach_count).toBeGreaterThanOrEqual(3)
  })
})

describe('GET/POST /api/cost-monitor/cron · audit trail INSERT (§150 G4)', () => {
  it('writes one row to cost_monitor_runs even when no breach', async () => {
    stubRows24h = [{ workflow_id: 'normal-wf', cost_usd: 1 }]
    await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(monitorInserts).toHaveLength(1)
    const row = monitorInserts[0]
    expect(row.is_breach).toBe(false)
    expect(row.breach_count).toBe(0)
    expect(row.shadow_mode).toBe(true)
    expect(row.alert_dispatched).toBe(false)
  })

  it('writes row with is_breach=true + breach_count + details when breach detected', async () => {
    stubRows24h = [{ workflow_id: 'spammy', cost_usd: 15 }]
    stubRows1h = []
    await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const row = monitorInserts[0]
    expect(row.is_breach).toBe(true)
    expect(row.breach_count).toBeGreaterThan(0)
    const details = row.details as Record<string, unknown>
    expect(Array.isArray(details.breaches)).toBe(true)
    expect(details.per_workflow_24h).toBeDefined()
    expect(details.invocations_24h).toBeDefined()
  })

  it('snapshots threshold values into the audit row', async () => {
    await POST(req({ authorization: 'Bearer test-secret-1234' }))
    const row = monitorInserts[0]
    expect(row.threshold_daily_per_workflow_usd).toBe(10)
    expect(row.threshold_daily_aggregate_usd).toBe(100)
    expect(row.threshold_hourly_burst_usd).toBe(30)
  })
})

describe('GET/POST /api/cost-monitor/cron · error paths', () => {
  it('500 + audit row with error_message when supabase aggregation fails', async () => {
    stubError24 = { message: 'simulated supabase error' }
    const res = await POST(req({ authorization: 'Bearer test-secret-1234' }))
    expect(res.status).toBe(500)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.error).toBe('aggregation_failed')
    // Audit row should still have been inserted (forensics)
    expect(monitorInserts).toHaveLength(1)
    expect(monitorInserts[0].error_message).toContain('simulated supabase error')
  })

  it('CRON_SECRET unset → 401 (fail closed)', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(req({ authorization: 'Bearer anything' }))
    expect(res.status).toBe(401)
  })
})
