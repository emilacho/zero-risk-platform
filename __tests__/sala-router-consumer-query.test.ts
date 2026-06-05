/**
 * Tests · sala-router-consumer query · pending intake selection · pure.
 */
import { describe, it, expect } from 'vitest'
import { selectPendingIntakeEvents } from '@/lib/sala-router-consumer'
import type { PersistedEvent } from '@/lib/sala-event-log'

function ev(overrides: Partial<PersistedEvent> = {}): PersistedEvent {
  return {
    event_id: 'evt-x',
    sequence: 1,
    occurred_at: '2026-06-05T18:00:00Z',
    tenant_id: 'naufrago',
    client_id: 'c1',
    stream_id: 'stream-1',
    correlation_id: 'corr-1',
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: 'op',
    idempotency_key: 'idem',
    logical_period: '2026-W23',
    input_hash: null,
    workflow_run_id: null,
    step_id: 'intake.ventas.onboard',
    step_state: 'done',
    attempt: null,
    payload: {},
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-05T18:00:00Z',
    ...overrides,
  }
}

describe('selectPendingIntakeEvents · empty + edge', () => {
  it('returns empty for empty input', () => {
    expect(selectPendingIntakeEvents({ events: [] })).toEqual([])
  })

  it('returns empty when only non-intake events', () => {
    const r = selectPendingIntakeEvents({
      events: [
        ev({ step_id: 'phase_1' }),
        ev({ step_id: 'gate_pending', event_type: 'gate_pending' }),
      ],
    })
    expect(r).toEqual([])
  })

  it('returns empty when only marker events', () => {
    const r = selectPendingIntakeEvents({
      events: [
        ev({ stream_id: 's1', step_id: 'router.dispatch.x.y' }),
      ],
    })
    expect(r).toEqual([])
  })
})

describe('selectPendingIntakeEvents · pending detection', () => {
  it('returns intake when no marker exists for its stream', () => {
    const intake = ev({ event_id: 'intake-1', stream_id: 's1', sequence: 1 })
    const r = selectPendingIntakeEvents({ events: [intake] })
    expect(r.length).toBe(1)
    expect(r[0].event_id).toBe('intake-1')
  })

  it('excludes intake when marker exists for SAME stream', () => {
    const intake = ev({ event_id: 'intake-1', stream_id: 's1', sequence: 1 })
    const marker = ev({
      event_id: 'marker-1',
      stream_id: 's1',
      sequence: 2,
      step_id: 'router.dispatch.ventas.onboard',
    })
    const r = selectPendingIntakeEvents({ events: [intake, marker] })
    expect(r).toEqual([])
  })

  it('includes intake when marker is for DIFFERENT stream', () => {
    const intake = ev({ event_id: 'intake-1', stream_id: 's1', sequence: 1 })
    const marker = ev({
      event_id: 'marker-2',
      stream_id: 's2',
      sequence: 2,
      step_id: 'router.dispatch.x.y',
    })
    const r = selectPendingIntakeEvents({ events: [intake, marker] })
    expect(r.length).toBe(1)
  })
})

describe('selectPendingIntakeEvents · ordering + limit', () => {
  it('sorts by sequence ascending (FIFO)', () => {
    const r = selectPendingIntakeEvents({
      events: [
        ev({ event_id: 'a', stream_id: 's1', sequence: 5 }),
        ev({ event_id: 'b', stream_id: 's2', sequence: 1 }),
        ev({ event_id: 'c', stream_id: 's3', sequence: 3 }),
      ],
    })
    expect(r.map((e) => e.event_id)).toEqual(['b', 'c', 'a'])
  })

  it('caps result at batch_size · default 10', () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      ev({ event_id: `e${i}`, stream_id: `s${i}`, sequence: i }),
    )
    expect(selectPendingIntakeEvents({ events }).length).toBe(10)
  })

  it('respects explicit limit', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ event_id: `e${i}`, stream_id: `s${i}`, sequence: i }),
    )
    expect(selectPendingIntakeEvents({ events, limit: 2 }).length).toBe(2)
  })

  it('clamps limit · floor 1 · ceiling 100', () => {
    const events = Array.from({ length: 200 }, (_, i) =>
      ev({ event_id: `e${i}`, stream_id: `s${i}`, sequence: i }),
    )
    expect(selectPendingIntakeEvents({ events, limit: 0 }).length).toBe(1)
    expect(selectPendingIntakeEvents({ events, limit: 9999 }).length).toBe(100)
  })
})
