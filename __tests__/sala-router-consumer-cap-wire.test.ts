/**
 * Tests · sala-router-consumer cap-wire (SPEC lazo agentico 2026-06-05).
 *
 * Validates §150 cap evaluation BEFORE workflow-dispatcher invocation ·
 * skipped_cap_blocked outcome · cap_evaluation surfaces in marker payload ·
 * non-Náufrago tenants pass through · enforce flag default-OFF.
 */
import { describe, it, expect, vi } from 'vitest'
import { dispatchOneIntake, type ParsedIntakeEvent } from '@/lib/sala-router-consumer'
import { buildDispatchMarkerEvent } from '@/lib/sala-router-consumer'
import type { PersistedEvent } from '@/lib/sala-event-log'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const OTHER_TENANT = '11111111-2222-3333-4444-555555555555'

function intake(overrides: Partial<ParsedIntakeEvent> = {}): ParsedIntakeEvent {
  const source_event: PersistedEvent = {
    event_id: 'evt-cap-1',
    sequence: 1,
    occurred_at: '2026-06-06T10:00:00Z',
    tenant_id: NAUFRAGO,
    client_id: NAUFRAGO,
    stream_id: '99999999-9999-5999-8999-999999999999',
    correlation_id: 'corr-cap-1',
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: 'op',
    idempotency_key: 'idem-cap-1',
    logical_period: 'manual',
    input_hash: null,
    workflow_run_id: null,
    step_id: 'intake.ventas/deal-won.onboard',
    step_state: 'done',
    attempt: null,
    payload: {},
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-06T10:00:00Z',
  }
  return {
    event_id: 'evt-cap-1',
    stream_id: '99999999-9999-5999-8999-999999999999',
    correlation_id: 'corr-cap-1',
    tenant_id: NAUFRAGO,
    client_id: NAUFRAGO,
    journey_type: 'ONBOARD',
    intake_source: 'ventas/deal-won',
    intake_intent: 'onboard',
    worker_workflow_id: 'LyVoKcrypS5uLyuu',
    source_event,
    ...overrides,
  }
}

describe('dispatch · cap-wire · canon §150 enforce DISABLED', () => {
  it('does not evaluate cap when enforce flag off · dispatches normally', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const spend = vi.fn(async () => 9999)
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      cap_enforce_override: false,
      cap_spend_query: spend,
    })
    expect(r.kind).toBe('dispatched_ok')
    expect(r.cap_evaluation).toBeUndefined()
    expect(spend).not.toHaveBeenCalled()
  })
})

describe('dispatch · cap-wire · enforce ON · Náufrago tenant', () => {
  it('queries spend and PASSES when under cap', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const spend = vi.fn(async () => 2.5)
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      cap_enforce_override: true,
      cap_spend_query: spend,
    })
    expect(r.kind).toBe('dispatched_ok')
    expect(r.cap_evaluation?.verdict).toBe('pass')
    expect(spend).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1) // dispatcher fired
  })

  it('BLOCKS at cap · skipped_cap_blocked outcome · dispatcher NOT called', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const spend = vi.fn(async () => 5.01)
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      cap_enforce_override: true,
      cap_spend_query: spend,
    })
    expect(r.kind).toBe('skipped_cap_blocked')
    expect(r.cap_evaluation?.verdict).toBe('block')
    expect(r.detail).toMatch(/cap §150 blocked/)
    expect(fetcher).not.toHaveBeenCalled() // dispatcher SKIPPED · canon
  })

  it('cap_evaluation surfaces in marker payload', () => {
    const evalu = {
      verdict: 'block' as const,
      reason: 'over_cap' as const,
      cap_usd: 5,
      spent_usd: 5.01,
    }
    const marker = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'skipped_cap_blocked',
      detail: 'cap §150 blocked',
      cap_evaluation: evalu as unknown as Record<string, unknown>,
    })
    expect(
      (marker.payload as Record<string, unknown>).cap_evaluation,
    ).toEqual(evalu)
    expect((marker.payload as Record<string, unknown>).dispatch_kind).toBe(
      'skipped_cap_blocked',
    )
  })
})

describe('dispatch · cap-wire · non-Náufrago tenant', () => {
  it('skips cap query · dispatches normally (other_tenant fast-path)', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const spend = vi.fn(async () => 9999)
    const r = await dispatchOneIntake({
      intake: intake({ tenant_id: OTHER_TENANT, client_id: OTHER_TENANT }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      cap_enforce_override: true, // enforce ON · still skipped because non-Náufrago
      cap_spend_query: spend,
    })
    expect(r.kind).toBe('dispatched_ok')
    expect(r.cap_evaluation).toBeUndefined()
    expect(spend).not.toHaveBeenCalled()
  })
})

describe('dispatch · cap-wire · no spend query injected', () => {
  it('defaults to 0 spend · passes (canon safe fallback)', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await dispatchOneIntake({
      intake: intake(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      cap_enforce_override: true,
      // no cap_spend_query
    })
    expect(r.kind).toBe('dispatched_ok')
    expect(r.cap_evaluation?.verdict).toBe('pass')
  })
})
