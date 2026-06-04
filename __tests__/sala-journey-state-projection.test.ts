/**
 * Tests · `projectJourneyState()` · canon canonical pure function
 *
 * Canon canon canon-empty + status transitions + gate pairing + judgment
 * pairing + budget counting + NEXUS multi-fase scenario.
 */
import { describe, it, expect } from 'vitest'
import { projectJourneyState } from '../src/lib/sala-journey-state/projection'
import type { EventType, PersistedEvent } from '@/lib/sala-event-log'

const T = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'
const S = '33333333-3333-3333-3333-333333333333'

function ev(o: Partial<PersistedEvent> & { event_type: EventType }): PersistedEvent {
  return {
    event_id: o.event_id ?? 'e_' + Math.random().toString(36).slice(2),
    sequence: o.sequence ?? 1,
    occurred_at: o.occurred_at ?? '2026-06-04T00:00:00.000Z',
    tenant_id: o.tenant_id ?? T,
    client_id: o.client_id ?? C,
    stream_id: o.stream_id ?? S,
    correlation_id: o.correlation_id ?? 'corr',
    causation_id: o.causation_id ?? null,
    event_type: o.event_type,
    journey_type: o.journey_type ?? 'NEXUS',
    operation_type: o.operation_type ?? 'op',
    idempotency_key: o.idempotency_key ?? 'k_' + Math.random().toString(36).slice(2),
    logical_period: o.logical_period ?? '2026-W23',
    input_hash: o.input_hash ?? null,
    workflow_run_id: o.workflow_run_id ?? null,
    step_id: o.step_id ?? null,
    step_state: o.step_state ?? null,
    attempt: o.attempt ?? null,
    payload: o.payload ?? {},
    provenance_tag: o.provenance_tag ?? null,
    agent_invocation_ref: o.agent_invocation_ref ?? null,
    gate_type: o.gate_type ?? null,
    created_at: o.created_at ?? '2026-06-04T00:00:00.000Z',
  }
}

describe('projectJourneyState · canon canonical empty / idle', () => {
  it('canon · empty events returns idle state', () => {
    const state = projectJourneyState([])
    expect(state.status).toBe('idle')
    expect(state.journey).toBeNull()
    expect(state.client_id).toBeNull()
    expect(state.current_step).toBeNull()
    expect(state.current_step_state).toBeNull()
    expect(state.pending_gates).toEqual([])
    expect(state.pending_judgments).toEqual([])
    expect(state.budget_blocked_count).toBe(0)
    expect(state.last_sequence).toBe(0)
    expect(state.total_events_scanned).toBe(0)
    expect(state.last_event_id).toBeNull()
  })

  it('canon · projected_at canon-ISO 8601 timestamp', () => {
    const state = projectJourneyState([])
    expect(() => new Date(state.projected_at).toISOString()).not.toThrow()
  })
})

describe('projectJourneyState · canon canonical status transitions', () => {
  it('canon · dispatch_requested → running', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'dispatch_requested', journey_type: 'PRODUCE' }),
    ])
    expect(state.status).toBe('running')
    expect(state.journey).toBe('PRODUCE')
  })

  it('canon · step_started canon canon-canon-canon-running', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'dispatch_requested' }),
      ev({
        sequence: 2,
        event_type: 'step_started',
        step_id: 'phase_1',
        step_state: 'running',
        attempt: 1,
      }),
    ])
    expect(state.status).toBe('running')
    expect(state.current_step).toBe('phase_1')
    expect(state.current_step_state).toBe('running')
    expect(state.current_step_attempt).toBe(1)
  })

  it('canon · step_completed → step_done · sin pending', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'step_started',
        step_id: 'phase_1',
        step_state: 'running',
      }),
      ev({
        sequence: 2,
        event_type: 'step_completed',
        step_id: 'phase_1',
        step_state: 'done',
      }),
    ])
    expect(state.status).toBe('step_done')
    expect(state.current_step_state).toBe('done')
  })

  it('canon · step_failed → step_failed status', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'step_failed',
        step_id: 'phase_2',
        step_state: 'failed',
        attempt: 3,
      }),
    ])
    expect(state.status).toBe('step_failed')
    expect(state.current_step_state).toBe('failed')
    expect(state.current_step_attempt).toBe(3)
  })

  it('canon · handoff → running (canon canon-canon-canon canon-canon canonical-control transferred)', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'step_completed', step_id: 'a', step_state: 'done' }),
      ev({ sequence: 2, event_type: 'handoff' }),
    ])
    expect(state.status).toBe('running')
  })

  it('canon · budget_blocked → blocked', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'dispatch_requested' }),
      ev({ sequence: 2, event_type: 'budget_blocked' }),
    ])
    expect(state.status).toBe('blocked')
    expect(state.budget_blocked_count).toBe(1)
  })

  it('canon · budget_blocked counter accumulates · NOT auto-resolved', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'budget_blocked' }),
      ev({ sequence: 2, event_type: 'budget_blocked' }),
      ev({ sequence: 3, event_type: 'budget_blocked' }),
    ])
    expect(state.budget_blocked_count).toBe(3)
    expect(state.status).toBe('blocked')
  })
})

describe('projectJourneyState · canon canonical gate pairing', () => {
  it('canon · gate_pending → awaiting_gate · canon-1 pending', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'gate_pending',
        gate_type: 'camino_iii',
        step_id: 'phase_5',
      }),
    ])
    expect(state.status).toBe('awaiting_gate')
    expect(state.pending_gates).toHaveLength(1)
    expect(state.pending_gates[0]?.gate_type).toBe('camino_iii')
    expect(state.pending_gates[0]?.step_id).toBe('phase_5')
  })

  it('canon · gate_resolved by causation_id pops matching pending', () => {
    const state = projectJourneyState([
      ev({
        event_id: 'gate_evt_1',
        sequence: 1,
        event_type: 'gate_pending',
        gate_type: 'hitl',
      }),
      ev({
        sequence: 2,
        event_type: 'gate_resolved',
        gate_type: 'hitl',
        causation_id: 'gate_evt_1',
      }),
    ])
    expect(state.pending_gates).toHaveLength(0)
    // canon canon · canon-canon-canon-pending gone · last = gate_resolved → running
    expect(state.status).toBe('running')
  })

  it('canon · gate_resolved FIFO fallback when canon-causation_id missing', () => {
    const state = projectJourneyState([
      ev({
        event_id: 'g1',
        sequence: 1,
        event_type: 'gate_pending',
        gate_type: 'hitl',
      }),
      ev({
        event_id: 'g2',
        sequence: 2,
        event_type: 'gate_pending',
        gate_type: 'camino_iii',
      }),
      ev({
        sequence: 3,
        event_type: 'gate_resolved',
        gate_type: 'hitl',
        causation_id: null, // canon-canon-canon-FIFO fallback
      }),
    ])
    // canon canon · canon canon-canon-canonical FIFO pops 'g1' · canon-canon-canon-1 left
    expect(state.pending_gates).toHaveLength(1)
    expect(state.pending_gates[0]?.event_id).toBe('g2')
    expect(state.status).toBe('awaiting_gate')
  })

  it('canon · 3 gates pending · canon-canon-canonical-awaiting_gate persistente', () => {
    const state = projectJourneyState([
      ev({ event_id: 'g1', sequence: 1, event_type: 'gate_pending', gate_type: 'hitl' }),
      ev({ event_id: 'g2', sequence: 2, event_type: 'gate_pending', gate_type: 'camino_iii' }),
      ev({ event_id: 'g3', sequence: 3, event_type: 'gate_pending', gate_type: '§144' }),
    ])
    expect(state.pending_gates).toHaveLength(3)
    expect(state.status).toBe('awaiting_gate')
    expect(state.pending_gates.map((g) => g.gate_type)).toEqual([
      'hitl',
      'camino_iii',
      '§144',
    ])
  })

  it('canon · canon-canon-gate_pending sin gate_type (canon canon-canon-defense) skipped', () => {
    const state = projectJourneyState([
      ev({ sequence: 1, event_type: 'gate_pending', gate_type: null }),
    ])
    // canon canon · canon canon-canon-canonical-canon defense · skipped from pending list
    expect(state.pending_gates).toHaveLength(0)
  })
})

describe('projectJourneyState · canon canonical judgment pairing', () => {
  it('canon · needs_judgment → awaiting_judgment', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'needs_judgment',
        step_id: 'phase_3',
      }),
    ])
    expect(state.status).toBe('awaiting_judgment')
    expect(state.pending_judgments).toHaveLength(1)
    expect(state.pending_judgments[0]?.step_id).toBe('phase_3')
  })

  it('canon · judgment_resolved by causation_id pops matching', () => {
    const state = projectJourneyState([
      ev({ event_id: 'j1', sequence: 1, event_type: 'needs_judgment' }),
      ev({ sequence: 2, event_type: 'judgment_resolved', causation_id: 'j1' }),
    ])
    expect(state.pending_judgments).toHaveLength(0)
    expect(state.status).toBe('running')
  })

  it('canon · awaiting_judgment precede awaiting_gate por canon-priority', () => {
    const state = projectJourneyState([
      ev({ event_id: 'g1', sequence: 1, event_type: 'gate_pending', gate_type: 'hitl' }),
      ev({ event_id: 'j1', sequence: 2, event_type: 'needs_judgment' }),
    ])
    expect(state.status).toBe('awaiting_judgment')
    expect(state.pending_gates).toHaveLength(1)
    expect(state.pending_judgments).toHaveLength(1)
  })
})

describe('projectJourneyState · canon canonical NEXUS multi-fase stress', () => {
  it('canon · canon-canon-canonical-7-phase NEXUS happy path', () => {
    // canon · canon canon-canon-canon canon-canon-canon-canon-canon-NEXUS phases 1-7 all step_completed
    const events: PersistedEvent[] = []
    for (let phase = 1; phase <= 7; phase++) {
      events.push(
        ev({
          sequence: phase * 2 - 1,
          event_type: 'step_started',
          step_id: `phase_${phase}`,
          step_state: 'running',
          journey_type: 'NEXUS',
          attempt: 1,
        }),
        ev({
          sequence: phase * 2,
          event_type: 'step_completed',
          step_id: `phase_${phase}`,
          step_state: 'done',
          journey_type: 'NEXUS',
        }),
      )
    }
    const state = projectJourneyState(events)
    expect(state.journey).toBe('NEXUS')
    expect(state.current_step).toBe('phase_7')
    expect(state.current_step_state).toBe('done')
    expect(state.status).toBe('step_done')
    expect(state.total_events_scanned).toBe(14)
    expect(state.last_sequence).toBe(14)
  })

  it('canon · canon-canon-NEXUS phase 5 HARDEN canon canon-canon-canon canon-canon-gate (camino_iii)', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'step_started',
        step_id: 'phase_5_HARDEN',
        step_state: 'running',
        journey_type: 'NEXUS',
      }),
      ev({
        event_id: 'gate_camino',
        sequence: 2,
        event_type: 'gate_pending',
        gate_type: 'camino_iii',
        step_id: 'phase_5_HARDEN',
        journey_type: 'NEXUS',
      }),
    ])
    expect(state.status).toBe('awaiting_gate')
    expect(state.pending_gates[0]?.gate_type).toBe('camino_iii')
    expect(state.current_step).toBe('phase_5_HARDEN')
  })

  it('canon · canon-canon-NEXUS phase 3 budget_blocked then retry', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'step_started',
        step_id: 'phase_3',
        step_state: 'running',
        journey_type: 'NEXUS',
      }),
      ev({
        sequence: 2,
        event_type: 'budget_blocked',
        step_id: 'phase_3',
        journey_type: 'NEXUS',
      }),
      // canon canon · canon-canon-canon-canon-canon-router retries
      ev({
        sequence: 3,
        event_type: 'dispatch_requested',
        step_id: 'phase_3',
        journey_type: 'NEXUS',
      }),
      ev({
        sequence: 4,
        event_type: 'step_completed',
        step_id: 'phase_3',
        step_state: 'done',
        journey_type: 'NEXUS',
      }),
    ])
    expect(state.budget_blocked_count).toBe(1)
    expect(state.status).toBe('step_done')
    expect(state.current_step_state).toBe('done')
  })

  it('canon · canon-canon-NEXUS off-script needs_judgment escalation', () => {
    const state = projectJourneyState([
      ev({
        sequence: 1,
        event_type: 'step_started',
        step_id: 'phase_4',
        step_state: 'running',
        journey_type: 'NEXUS',
      }),
      ev({
        event_id: 'judge_1',
        sequence: 2,
        event_type: 'needs_judgment',
        step_id: 'phase_4',
        journey_type: 'NEXUS',
      }),
    ])
    expect(state.status).toBe('awaiting_judgment')
    expect(state.pending_judgments[0]?.step_id).toBe('phase_4')
    expect(state.current_step).toBe('phase_4')
  })
})

describe('projectJourneyState · canon canonical sorting + filter + metadata', () => {
  it('canon · stable sort canon-canon-canon-out-of-order events', () => {
    const state = projectJourneyState([
      ev({ sequence: 3, event_type: 'step_completed', step_id: 'a', step_state: 'done' }),
      ev({ sequence: 1, event_type: 'dispatch_requested' }),
      ev({ sequence: 2, event_type: 'step_started', step_id: 'a', step_state: 'running' }),
    ])
    expect(state.last_sequence).toBe(3)
    expect(state.status).toBe('step_done')
  })

  it('canon · stream_id filter canon-canon-canonical-defense', () => {
    const S2 = '44444444-4444-4444-4444-444444444444'
    const state = projectJourneyState(
      [
        ev({ stream_id: S, sequence: 1, event_type: 'dispatch_requested', journey_type: 'PRODUCE' }),
        ev({ stream_id: S2, sequence: 1, event_type: 'dispatch_requested', journey_type: 'ONBOARD' }),
      ],
      { stream_id: S },
    )
    expect(state.stream_id).toBe(S)
    expect(state.journey).toBe('PRODUCE')
  })

  it('canon · tenant_id filter canon-canon-canon-canonical-defense', () => {
    const T2 = '55555555-5555-5555-5555-555555555555'
    const state = projectJourneyState(
      [
        ev({ tenant_id: T, sequence: 1, event_type: 'dispatch_requested', journey_type: 'A' }),
        ev({ tenant_id: T2, sequence: 1, event_type: 'dispatch_requested', journey_type: 'B' }),
      ],
      { tenant_id: T },
    )
    expect(state.tenant_id).toBe(T)
    expect(state.journey).toBe('A')
  })

  it('canon · last_event_* meta tracked correctly', () => {
    const state = projectJourneyState([
      ev({
        event_id: 'last_one',
        sequence: 1,
        event_type: 'step_started',
        step_id: 'final',
        step_state: 'running',
        correlation_id: 'corr_xyz',
        occurred_at: '2026-06-04T12:00:00.000Z',
      }),
    ])
    expect(state.last_event_id).toBe('last_one')
    expect(state.last_event_type).toBe('step_started')
    expect(state.last_event_at).toBe('2026-06-04T12:00:00.000Z')
    expect(state.correlation_id).toBe('corr_xyz')
  })
})
