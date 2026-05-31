/**
 * Unit tests for src/lib/cost-monitor-alert.ts (§150 G5 alert-live).
 *
 * Verifies:
 *  - dispatchCostMonitorAlert returns dispatched:false when no breaches
 *  - returns dispatched:false when SLACK_WEBHOOK_URL_EQUIPO unset
 *  - POSTs JSON to webhook URL with text + blocks
 *  - returns dispatched:true on 2xx response
 *  - returns dispatched:false with reason on non-2xx response
 *  - returns dispatched:false with reason when fetch throws
 *  - buildAlertPayload formats breach lines per type
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAlertPayload,
  dispatchCostMonitorAlert,
  type CostMonitorBreach,
  type DispatchInput,
} from '../src/lib/cost-monitor-alert'

const ORIG_WEBHOOK = process.env.SLACK_WEBHOOK_URL_EQUIPO

function buildInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    breaches: [
      { type: 'hourly_burst', spend_usd: 6, threshold: 5 },
    ],
    aggregate_24h_usd: 6,
    aggregate_1h_usd: 6,
    invocations_24h: 10,
    invocations_1h: 10,
    run_id: 'run-test-abc',
    ran_at: '2026-05-31T18:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  process.env.SLACK_WEBHOOK_URL_EQUIPO = 'https://hooks.slack.com/test/abc'
})

afterEach(() => {
  if (ORIG_WEBHOOK === undefined) delete process.env.SLACK_WEBHOOK_URL_EQUIPO
  else process.env.SLACK_WEBHOOK_URL_EQUIPO = ORIG_WEBHOOK
})

describe('cost-monitor-alert · dispatchCostMonitorAlert', () => {
  it('returns dispatched:false when no breaches', async () => {
    const fetchImpl = vi.fn()
    const res = await dispatchCostMonitorAlert(buildInput({ breaches: [], fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(res.dispatched).toBe(false)
    expect(res.reason).toContain('no breaches')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns dispatched:false when SLACK_WEBHOOK_URL_EQUIPO unset', async () => {
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
    const fetchImpl = vi.fn()
    const res = await dispatchCostMonitorAlert(buildInput({ fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(res.dispatched).toBe(false)
    expect(res.reason).toContain('SLACK_WEBHOOK_URL_EQUIPO')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs JSON payload to webhook URL on breach', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, text: async () => 'ok' }) as unknown as Response)
    const res = await dispatchCostMonitorAlert(buildInput({ fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(res.dispatched).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://hooks.slack.com/test/abc')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
    expect(typeof body.text).toBe('string')
    expect(Array.isArray(body.blocks)).toBe(true)
    expect(body.text as string).toContain('Pico horario')
  })

  it('returns dispatched:false with reason on non-2xx response', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: false,
      status: 500,
      text: async () => 'internal error body',
    }) as unknown as Response)
    const res = await dispatchCostMonitorAlert(buildInput({ fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(res.dispatched).toBe(false)
    expect(res.reason).toContain('500')
  })

  it('returns dispatched:false when fetch throws', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw new Error('ENOTFOUND')
    })
    const res = await dispatchCostMonitorAlert(buildInput({ fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(res.dispatched).toBe(false)
    expect(res.reason).toContain('ENOTFOUND')
  })

  it('uses webhookUrl from input over env var when provided', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, text: async () => 'ok' }) as unknown as Response)
    await dispatchCostMonitorAlert(buildInput({
      webhookUrl: 'https://other-webhook.example/x',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }))
    expect(fetchImpl.mock.calls[0][0]).toBe('https://other-webhook.example/x')
  })
})

describe('cost-monitor-alert · buildAlertPayload', () => {
  it('formats all three breach types with their labels', () => {
    const breaches: CostMonitorBreach[] = [
      { type: 'hourly_burst', spend_usd: 6.5, threshold: 5 },
      { type: 'daily_per_workflow', workflow_id: 'spammy-wf', spend_usd: 15.2, threshold: 10 },
      { type: 'daily_aggregate', spend_usd: 120, threshold: 100 },
    ]
    const out = buildAlertPayload(buildInput({ breaches }))
    expect(out.text).toContain('Pico horario')
    expect(out.text).toContain('Workflow diario')
    expect(out.text).toContain('Agregado diario')
    expect(out.text).toContain('spammy-wf')
    expect(out.text).toContain('$6.50')
    expect(out.text).toContain('run-test-abc')
  })

  it('omits workflow_id ref when breach type lacks it', () => {
    const breaches: CostMonitorBreach[] = [
      { type: 'daily_aggregate', spend_usd: 120, threshold: 100 },
    ]
    const out = buildAlertPayload(buildInput({ breaches }))
    expect(out.text).not.toContain('workflow `')
  })
})
