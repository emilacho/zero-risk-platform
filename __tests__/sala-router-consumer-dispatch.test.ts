/**
 * Tests · sala-router-consumer dispatch · per-intake workflow-dispatcher invocation.
 *
 * Validates that the consumer correctly composes a DispatchDecision
 * (target='workflow') and surfaces the dispatcher's typed result
 * (dispatched_ok / skipped_dispatcher_off / dispatched_failed).
 */
import { describe, it, expect, vi } from 'vitest'
import { dispatchOneIntake, type ParsedIntakeEvent } from '@/lib/sala-router-consumer'
import type { PersistedEvent } from '@/lib/sala-event-log'

function intake(overrides: Partial<ParsedIntakeEvent> = {}): ParsedIntakeEvent {
  const source_event: PersistedEvent = {
    event_id: 'evt-1',
    sequence: 1,
    occurred_at: '2026-06-05T18:00:00Z',
    tenant_id: 'naufrago',
    client_id: 'c1',
    stream_id: 'sala/v1/x',
    correlation_id: 'corr-1',
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: 'op',
    idempotency_key: 'idem-1',
    logical_period: '2026-W23',
    input_hash: null,
    workflow_run_id: null,
    step_id: 'intake.ventas/deal-won.onboard',
    step_state: 'done',
    attempt: null,
    payload: {},
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-05T18:00:00Z',
  }
  return {
    event_id: 'evt-1',
    stream_id: 'sala/v1/x',
    correlation_id: 'corr-1',
    tenant_id: 'naufrago',
    client_id: 'c1',
    journey_type: 'ONBOARD',
    intake_source: 'ventas/deal-won',
    intake_intent: 'onboard',
    worker_workflow_id: 'LyVoKcrypS5uLyuu',
    source_event,
    ...overrides,
  }
}

describe('dispatchOneIntake · skipped_unknown_journey', () => {
  it('skips when journey_type has no JOURNEY_WORKFLOW_MAP entry', async () => {
    const r = await dispatchOneIntake({
      intake: intake({ journey_type: 'PRODUCE' }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
    })
    expect(r.kind).toBe('skipped_unknown_journey')
    expect(r.detail).toMatch(/PRODUCE/)
  })
})

describe('dispatchOneIntake · skipped_dispatcher_off', () => {
  it('returns skipped_dispatcher_off when SALA_WORKFLOW_DISPATCH_ENABLED=false', async () => {
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: false,
    })
    expect(r.kind).toBe('skipped_dispatcher_off')
    expect(r.detail).toMatch(/SALA_WORKFLOW_DISPATCH_ENABLED/)
  })
})

describe('dispatchOneIntake · dispatched_ok', () => {
  it('fires webhook + returns dispatched_ok on 200', async () => {
    let capturedUrl: string | null = null
    let capturedBody: Record<string, unknown> = {}
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedBody = JSON.parse((init?.body as string) ?? '{}')
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.kind).toBe('dispatched_ok')
    expect(capturedUrl).toBe('https://n8n.test/webhook/zero-risk/deal-won-onboarding')
    expect(capturedBody._journey_id).toBe('sala/v1/x')
  })

  it('reuses workflow_id from JOURNEY_WORKFLOW_MAP if drift detected', async () => {
    let capturedUrl: string | null = null
    const fetcher = vi.fn(async (url: string) => {
      capturedUrl = url
      return new Response('ok', { status: 200 })
    })
    const r = await dispatchOneIntake({
      // intake says different workflow_id than the map · map wins
      intake: intake({ worker_workflow_id: 'OldWorkflowDrift' }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.kind).toBe('dispatched_ok')
    // URL uses canonical map's webhook_path (NOT a drifted one)
    expect(capturedUrl).toBe('https://n8n.test/webhook/zero-risk/deal-won-onboarding')
  })

  it('carries §149 correlation in webhook body (_journey_id = stream_id)', async () => {
    let body: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    await dispatchOneIntake({
      intake: intake({ stream_id: 'sala/v1/custom-stream' }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(body._journey_id).toBe('sala/v1/custom-stream')
  })

  it('carries _sala_correlation_id + _sala_caused_by_event_id', async () => {
    let body: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    await dispatchOneIntake({
      intake: intake({ correlation_id: 'corr-custom' }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(body._sala_correlation_id).toBe('corr-custom')
    expect(body._sala_caused_by_event_id).toBe('evt-1')
  })
})

describe('dispatchOneIntake · Phase 1.1 gap #1 · envelope_payload forwarding', () => {
  it('forwards intake.source_event.payload.envelope_payload as business_payload', async () => {
    let body: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    const i = intake()
    // Simulate the ingress endpoint's payload shape · the envelope_payload
    // is nested under the persisted event's payload column.
    i.source_event.payload = {
      envelope_payload: {
        client_name: 'Náufrago',
        website: 'naufrago.com',
        industry: 'F&B',
        contract_scope: 'onboarding',
        deal_value_usd: 12000,
      },
      intake_tier: 'A',
    }
    await dispatchOneIntake({
      intake: i,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(body.client_name).toBe('Náufrago')
    expect(body.website).toBe('naufrago.com')
    expect(body.industry).toBe('F&B')
    expect(body.contract_scope).toBe('onboarding')
    expect(body.deal_value_usd).toBe(12000)
    // Sala metadata still present + correct
    expect(body._journey_id).toBe('sala/v1/x')
    expect(body.client_id).toBe('c1')
    expect(body.tenant_id).toBe('naufrago')
    expect(body.trigger_source).toBe('sala-router-dispatch')
  })

  it('passes through cleanly when envelope_payload is missing', async () => {
    let body: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    await dispatchOneIntake({
      intake: intake(), // payload = {} default
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(body._journey_id).toBe('sala/v1/x')
    // No extra business fields injected
    expect(body.client_name).toBeUndefined()
  })

  it('ignores non-object envelope_payload (array · primitive)', async () => {
    let body: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    const i = intake()
    i.source_event.payload = { envelope_payload: ['not', 'an', 'object'] }
    await dispatchOneIntake({
      intake: i,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(body._journey_id).toBe('sala/v1/x')
  })
})

describe('dispatchOneIntake · dispatched_failed', () => {
  it('returns dispatched_failed when webhook returns non-2xx', async () => {
    const fetcher = vi.fn(async () => new Response('down', { status: 503 }))
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.kind).toBe('dispatched_failed')
    expect(r.detail).toMatch(/webhook_failed/)
  })

  it('returns dispatched_failed when fetch throws', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.kind).toBe('dispatched_failed')
    expect(r.detail).toMatch(/fetch_threw/)
  })
})
