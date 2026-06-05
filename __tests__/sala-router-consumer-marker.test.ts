/**
 * Tests · sala-router-consumer marker builder · pure function.
 */
import { describe, it, expect } from 'vitest'
import {
  buildDispatchMarkerEvent,
  type ParsedIntakeEvent,
} from '@/lib/sala-router-consumer'
import type { PersistedEvent } from '@/lib/sala-event-log'

function intake(overrides: Partial<ParsedIntakeEvent> = {}): ParsedIntakeEvent {
  const source_event: PersistedEvent = {
    event_id: 'evt-intake-1',
    sequence: 1,
    occurred_at: '2026-06-05T18:00:00Z',
    tenant_id: 'naufrago',
    client_id: 'c1',
    stream_id: 'sala/v1/...',
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
    event_id: 'evt-intake-1',
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

describe('buildDispatchMarkerEvent · shape', () => {
  it('writes step_id with router.dispatch prefix + source + intent', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'webhook ok',
    })
    expect(m.step_id).toBe('router.dispatch.ventas/deal-won.onboard')
  })

  it('preserves stream/correlation/tenant/client from intake', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    expect(m.tenant_id).toBe('naufrago')
    expect(m.client_id).toBe('c1')
    expect(m.stream_id).toBe('sala/v1/x')
    expect(m.correlation_id).toBe('corr-1')
  })

  it('sets causation_id to intake event_id (chain)', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    expect(m.causation_id).toBe('evt-intake-1')
  })

  it('writes payload with dispatch metadata', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'webhook 200',
      dispatch_result: { workflow_id: 'LyVo', status_code: 200 },
    })
    expect(m.payload!.source).toBe('sala-router-consumer')
    expect(m.payload!.dispatch_kind).toBe('dispatched_ok')
    expect(m.payload!.caused_by_intake_event_id).toBe('evt-intake-1')
    expect(m.payload!.intake_source).toBe('ventas/deal-won')
    expect(m.payload!.intake_intent).toBe('onboard')
    expect(m.payload!.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
    expect(m.payload!.workflow_dispatch_result).toEqual({
      workflow_id: 'LyVo',
      status_code: 200,
    })
  })

  it('omits workflow_dispatch_result when not provided', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'skipped_dispatcher_off',
      detail: 'flag off',
    })
    expect(m.payload!.workflow_dispatch_result).toBeUndefined()
  })
})

describe('buildDispatchMarkerEvent · idempotency_key', () => {
  it('is deterministic for the same intake', () => {
    const a = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    const b = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    expect(a.idempotency_key).toBe(b.idempotency_key)
  })

  it('differs across different intake event_ids', () => {
    const a = buildDispatchMarkerEvent({
      intake: intake({ event_id: 'a' }),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    const b = buildDispatchMarkerEvent({
      intake: intake({ event_id: 'b' }),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    expect(a.idempotency_key).not.toBe(b.idempotency_key)
  })
})

describe('buildDispatchMarkerEvent · step_state + event_type canon', () => {
  it('writes step_completed with step_state=done (intake-marker chain)', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_ok',
      detail: 'x',
    })
    expect(m.event_type).toBe('step_completed')
    expect(m.step_state).toBe('done')
    expect(m.gate_type).toBeNull()
  })

  it('carries kind even when failure (still step_completed for marker semantics)', () => {
    const m = buildDispatchMarkerEvent({
      intake: intake(),
      kind: 'dispatched_failed',
      detail: 'network 502',
    })
    expect(m.event_type).toBe('step_completed')
    expect(m.payload!.dispatch_kind).toBe('dispatched_failed')
  })
})
