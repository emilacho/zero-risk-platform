/**
 * Tests · `readJourneyState()` · canon canonical roundtrip + isolation
 *
 * Canon canon-canon-write events via append() → read+project · cross-stream/tenant
 * isolation · time window · NEXUS roundtrip.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readJourneyState } from '../src/lib/sala-journey-state/read'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
  type EventType,
  type GateType,
} from '@/lib/sala-event-log'

const T = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const S = '44444444-4444-4444-4444-444444444444'
const S2 = '55555555-5555-5555-5555-555555555555'

function evInput(
  o: Partial<EventAppendInput> & { event_type: EventType; key: string },
): EventAppendInput {
  return {
    tenant_id: T,
    client_id: C,
    stream_id: S,
    correlation_id: randomUUID(),
    journey_type: 'NEXUS',
    operation_type: 'op_' + o.key,
    idempotency_key: buildIdempotencyKey({
      operation_type: 'op_' + o.key,
      client_id: C,
      logical_period: '2026-W23',
    }),
    logical_period: '2026-W23',
    ...o,
  }
}

describe('readJourneyState · canon canonical required scope', () => {
  it('canon · throws when tenant_id missing', async () => {
    const s = new InMemoryEventLogStorage()
    await expect(readJourneyState(s, { tenant_id: '', stream_id: S })).rejects.toThrow(/tenant_id/)
  })

  it('canon · throws when stream_id missing', async () => {
    const s = new InMemoryEventLogStorage()
    await expect(readJourneyState(s, { tenant_id: T, stream_id: '' })).rejects.toThrow(/stream_id/)
  })
})

describe('readJourneyState · canon canonical empty + roundtrip', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('canon · empty log → idle state', async () => {
    const state = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(state.status).toBe('idle')
    expect(state.journey).toBeNull()
    expect(state.stream_id).toBe(S)
    expect(state.tenant_id).toBe(T)
  })

  it('canon · single dispatch_requested → running', async () => {
    await append(
      storage,
      evInput({ key: 'd1', event_type: 'dispatch_requested', journey_type: 'PRODUCE' }),
    )
    const state = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(state.status).toBe('running')
    expect(state.journey).toBe('PRODUCE')
  })

  it('canon · full happy path PRODUCE journey', async () => {
    await append(
      storage,
      evInput({
        key: 'd',
        event_type: 'dispatch_requested',
        journey_type: 'PRODUCE',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'ss',
        event_type: 'step_started',
        step_id: 'phase_brief',
        step_state: 'running',
        attempt: 1,
        journey_type: 'PRODUCE',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'sc',
        event_type: 'step_completed',
        step_id: 'phase_brief',
        step_state: 'done',
        journey_type: 'PRODUCE',
      }),
    )
    const state = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(state.status).toBe('step_done')
    expect(state.current_step).toBe('phase_brief')
    expect(state.current_step_state).toBe('done')
    expect(state.journey).toBe('PRODUCE')
  })
})

describe('readJourneyState · canon canonical cross-stream isolation', () => {
  it('canon · each stream tracked independently', async () => {
    const storage = new InMemoryEventLogStorage()
    await append(
      storage,
      evInput({
        key: 'a',
        stream_id: S,
        event_type: 'step_started',
        step_id: 'step_A',
        step_state: 'running',
        journey_type: 'ONBOARD',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'b',
        stream_id: S2,
        event_type: 'gate_pending',
        gate_type: 'hitl',
        step_id: 'step_B',
        journey_type: 'PRODUCE',
      }),
    )

    const stateA = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    const stateB = await readJourneyState(storage, { tenant_id: T, stream_id: S2 })
    expect(stateA.journey).toBe('ONBOARD')
    expect(stateA.status).toBe('running')
    expect(stateB.journey).toBe('PRODUCE')
    expect(stateB.status).toBe('awaiting_gate')
  })
})

describe('readJourneyState · canon canonical cross-tenant isolation (RLS)', () => {
  it('canon · canon-canon-canon-canon-different tenants NEVER cross', async () => {
    const storage = new InMemoryEventLogStorage()
    await append(
      storage,
      evInput({
        key: 'a',
        tenant_id: T,
        event_type: 'dispatch_requested',
        journey_type: 'A',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'b',
        tenant_id: T2,
        event_type: 'dispatch_requested',
        journey_type: 'B',
      }),
    )

    const stateA = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    const stateB = await readJourneyState(storage, { tenant_id: T2, stream_id: S })
    expect(stateA.journey).toBe('A')
    expect(stateB.journey).toBe('B')
  })
})

describe('readJourneyState · canon canonical NEXUS gate + judgment scenario', () => {
  it('canon · canon-canon-NEXUS phase 5 HARDEN canon canon-canon-canon canon-canon-camino_iii gate then resolved', async () => {
    const storage = new InMemoryEventLogStorage()

    const startInput = evInput({
      key: 'ss',
      event_type: 'step_started',
      step_id: 'phase_5_HARDEN',
      step_state: 'running',
      journey_type: 'NEXUS',
    })
    await append(storage, startInput)

    const gateInput = evInput({
      key: 'gp',
      event_type: 'gate_pending',
      gate_type: 'camino_iii' as GateType,
      step_id: 'phase_5_HARDEN',
      journey_type: 'NEXUS',
    })
    const gateResult = await append(storage, gateInput)

    const beforeResolve = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(beforeResolve.status).toBe('awaiting_gate')
    expect(beforeResolve.pending_gates).toHaveLength(1)

    await append(
      storage,
      evInput({
        key: 'gr',
        event_type: 'gate_resolved',
        gate_type: 'camino_iii' as GateType,
        causation_id: gateResult.event.event_id,
        step_id: 'phase_5_HARDEN',
        journey_type: 'NEXUS',
      }),
    )

    const afterResolve = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(afterResolve.pending_gates).toHaveLength(0)
    expect(afterResolve.status).toBe('running')
  })

  it('canon · canon-canon-budget_blocked then retry → step_done counter persistente', async () => {
    const storage = new InMemoryEventLogStorage()
    await append(
      storage,
      evInput({
        key: 'ss',
        event_type: 'step_started',
        step_id: 'phase_3',
        step_state: 'running',
        journey_type: 'NEXUS',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'bb',
        event_type: 'budget_blocked',
        step_id: 'phase_3',
        journey_type: 'NEXUS',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'rs',
        event_type: 'dispatch_requested',
        step_id: 'phase_3',
        journey_type: 'NEXUS',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'sc',
        event_type: 'step_completed',
        step_id: 'phase_3',
        step_state: 'done',
        journey_type: 'NEXUS',
      }),
    )
    const state = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(state.budget_blocked_count).toBe(1)
    expect(state.status).toBe('step_done')
  })
})

describe('readJourneyState · canon canonical time window', () => {
  it('canon · until snapshot · canon-canon-canon-rollback view', async () => {
    const storage = new InMemoryEventLogStorage()
    await append(
      storage,
      evInput({
        key: 'early',
        event_type: 'dispatch_requested',
        journey_type: 'PRODUCE',
        occurred_at: '2026-06-01T00:00:00.000Z',
      }),
    )
    await append(
      storage,
      evInput({
        key: 'late',
        event_type: 'step_completed',
        step_id: 's',
        step_state: 'done',
        journey_type: 'PRODUCE',
        occurred_at: '2026-06-03T00:00:00.000Z',
      }),
    )

    const snapshot = await readJourneyState(storage, {
      tenant_id: T,
      stream_id: S,
      until: '2026-06-02T00:00:00.000Z',
    })
    expect(snapshot.status).toBe('running')
    expect(snapshot.last_event_type).toBe('dispatch_requested')

    const current = await readJourneyState(storage, { tenant_id: T, stream_id: S })
    expect(current.status).toBe('step_done')
  })
})
