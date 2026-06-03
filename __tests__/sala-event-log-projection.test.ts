/**
 * Tests · dispatchFunnel projection · canon canonical canon read-model
 *
 * Canon canon · roundtrip canon canon canon · append events → read → project
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { append } from '../src/lib/sala-event-log/append'
import { read } from '../src/lib/sala-event-log/read'
import { dispatchFunnel } from '../src/lib/sala-event-log/projections/dispatch-funnel'
import { InMemoryEventLogStorage } from '../src/lib/sala-event-log/storage/in-memory'
import type { EventAppendInput, EventType } from '../src/lib/sala-event-log/types'

const T = '11111111-1111-1111-1111-111111111111'
const C = '33333333-3333-3333-3333-333333333333'

function event(o: Partial<EventAppendInput> & { idempotency_key: string }): EventAppendInput {
  return {
    tenant_id: T,
    client_id: C,
    stream_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    correlation_id: randomUUID(),
    event_type: 'dispatch_requested',
    journey_type: 'NEXUS',
    operation_type: 'op',
    logical_period: '2026-W23',
    ...o,
  }
}

describe('dispatchFunnel · canon canonical canon', () => {
  it('empty events → empty buckets', () => {
    expect(dispatchFunnel([])).toEqual([])
  })

  it('canon canon · roundtrip append → read → project · single stream funnel', async () => {
    const storage = new InMemoryEventLogStorage()
    const streamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

    const steps: Array<{ type: EventType; key: string }> = [
      { type: 'dispatch_requested', key: 'd1' },
      { type: 'step_started', key: 's1' },
      { type: 'step_completed', key: 'c1' },
      { type: 'step_started', key: 's2' },
      { type: 'step_failed', key: 'f1' },
      { type: 'handoff', key: 'h1' },
    ]
    for (const { type, key } of steps) {
      await append(storage, event({ stream_id: streamId, event_type: type, idempotency_key: key }))
    }

    const events = await read(storage, { tenant_id: T, stream_id: streamId })
    const buckets = dispatchFunnel(events)
    expect(buckets.length).toBe(1)
    const b = buckets[0]!
    expect(b.stream_id).toBe(streamId)
    expect(b.dispatch_requested).toBe(1)
    expect(b.step_started).toBe(2)
    expect(b.step_completed).toBe(1)
    expect(b.step_failed).toBe(1)
    expect(b.handoff).toBe(1)
    expect(b.total_events).toBe(6)
  })

  it('canon · groups by stream_id (multi-stream)', async () => {
    const storage = new InMemoryEventLogStorage()
    const sA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const sB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

    await append(storage, event({ stream_id: sA, idempotency_key: 'a1' }))
    await append(storage, event({ stream_id: sA, event_type: 'step_started', idempotency_key: 'a2' }))
    await append(storage, event({ stream_id: sB, idempotency_key: 'b1' }))

    const events = await read(storage, { tenant_id: T })
    const buckets = dispatchFunnel(events)
    expect(buckets.length).toBe(2)
    const bA = buckets.find((b) => b.stream_id === sA)
    const bB = buckets.find((b) => b.stream_id === sB)
    expect(bA?.total_events).toBe(2)
    expect(bB?.total_events).toBe(1)
  })

  it('canon · counts gates correctly (gate_pending requires gate_type)', async () => {
    const storage = new InMemoryEventLogStorage()
    const streamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    await append(
      storage,
      event({
        stream_id: streamId,
        event_type: 'gate_pending',
        gate_type: 'hitl',
        idempotency_key: 'gp_1',
      }),
    )
    await append(
      storage,
      event({
        stream_id: streamId,
        event_type: 'gate_resolved',
        gate_type: 'hitl',
        idempotency_key: 'gr_1',
      }),
    )
    const events = await read(storage, { tenant_id: T, stream_id: streamId })
    const buckets = dispatchFunnel(events)
    expect(buckets[0]!.gate_pending).toBe(1)
    expect(buckets[0]!.gate_resolved).toBe(1)
  })

  it('canon · counts budget_blocked + needs_judgment + judgment_resolved', async () => {
    const storage = new InMemoryEventLogStorage()
    const streamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    await append(
      storage,
      event({ stream_id: streamId, event_type: 'budget_blocked', idempotency_key: 'bb_1' }),
    )
    await append(
      storage,
      event({ stream_id: streamId, event_type: 'needs_judgment', idempotency_key: 'nj_1' }),
    )
    await append(
      storage,
      event({ stream_id: streamId, event_type: 'judgment_resolved', idempotency_key: 'jr_1' }),
    )
    const events = await read(storage, { tenant_id: T, stream_id: streamId })
    const b = dispatchFunnel(events)[0]!
    expect(b.budget_blocked).toBe(1)
    expect(b.needs_judgment).toBe(1)
    expect(b.judgment_resolved).toBe(1)
  })

  it('canon · buckets sorted by first_occurred_at ascending', async () => {
    const storage = new InMemoryEventLogStorage()
    const s1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const s2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    await append(
      storage,
      event({
        stream_id: s2,
        occurred_at: '2026-06-02T10:00:00.000Z',
        idempotency_key: 'late_first',
      }),
    )
    await append(
      storage,
      event({
        stream_id: s1,
        occurred_at: '2026-06-02T09:00:00.000Z',
        idempotency_key: 'early_first',
      }),
    )
    const events = await read(storage, { tenant_id: T })
    const buckets = dispatchFunnel(events)
    expect(buckets[0]!.stream_id).toBe(s1)
    expect(buckets[1]!.stream_id).toBe(s2)
  })
})
