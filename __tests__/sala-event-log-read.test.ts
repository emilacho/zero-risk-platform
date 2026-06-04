/**
 * Tests · read(filters) · canon canonical canon canon canon
 *   - tenant_id REQUIRED canon · canon canon canon-RLS-respected
 *   - filters apply correctly · canon canon-NEVER cross-tenant leak
 *   - ordering canon · sequence_asc per stream · sequence_desc · occurred_at_desc
 *   - limit cap canon · 1000 max
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { append } from '../src/lib/sala-event-log/append'
import { read } from '../src/lib/sala-event-log/read'
import { InMemoryEventLogStorage } from '../src/lib/sala-event-log/storage/in-memory'
import { buildIdempotencyKey } from '../src/lib/sala-event-log/idempotency'
import type { EventAppendInput, EventType } from '../src/lib/sala-event-log/types'

const T1 = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const CA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const SA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const SB = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function ev(o: Partial<EventAppendInput> & { idempotency_key: string }): EventAppendInput {
  return {
    tenant_id: T1,
    client_id: CA,
    stream_id: SA,
    correlation_id: randomUUID(),
    event_type: 'dispatch_requested',
    journey_type: 'NEXUS',
    operation_type: 'op',
    logical_period: '2026-W23',
    ...o,
  }
}

describe('read · canon canonical · tenant_id REQUIRED', () => {
  it('throws when tenant_id is empty', async () => {
    const s = new InMemoryEventLogStorage()
    await expect(read(s, { tenant_id: '' })).rejects.toThrow(/tenant_id/)
  })
})

describe('read · canon canonical · tenant isolation (canonical-RLS guarantee)', () => {
  let s: InMemoryEventLogStorage
  beforeEach(() => {
    s = new InMemoryEventLogStorage()
  })

  it('returns only rows for the requested tenant_id', async () => {
    await append(s, ev({ tenant_id: T1, idempotency_key: 'k1' }))
    await append(s, ev({ tenant_id: T1, idempotency_key: 'k2' }))
    await append(s, ev({ tenant_id: T2, idempotency_key: 'k3' }))
    const t1Rows = await read(s, { tenant_id: T1 })
    const t2Rows = await read(s, { tenant_id: T2 })
    expect(t1Rows.length).toBe(2)
    expect(t2Rows.length).toBe(1)
    expect(t1Rows.every((r) => r.tenant_id === T1)).toBe(true)
    expect(t2Rows.every((r) => r.tenant_id === T2)).toBe(true)
  })
})

describe('read · canon canonical · filter clauses', () => {
  let s: InMemoryEventLogStorage
  beforeEach(async () => {
    s = new InMemoryEventLogStorage()
    // canon · canon canon canonical-corpus
    let n = 0
    for (const client of [CA, CB]) {
      for (const stream of [SA, SB]) {
        for (const type of [
          'dispatch_requested',
          'step_started',
          'step_completed',
        ] as EventType[]) {
          await append(
            s,
            ev({
              client_id: client,
              stream_id: stream,
              event_type: type,
              idempotency_key: `k_${n++}`,
            }),
          )
        }
      }
    }
  })

  it('filter by client_id narrows results', async () => {
    const rowsA = await read(s, { tenant_id: T1, client_id: CA })
    expect(rowsA.every((r) => r.client_id === CA)).toBe(true)
  })

  it('filter by stream_id narrows results', async () => {
    const rowsA = await read(s, { tenant_id: T1, stream_id: SA })
    expect(rowsA.every((r) => r.stream_id === SA)).toBe(true)
  })

  it('filter by event_type (single)', async () => {
    const rows = await read(s, { tenant_id: T1, event_type: 'step_started' })
    expect(rows.length).toBe(4) // canon · 2 clients × 2 streams
    expect(rows.every((r) => r.event_type === 'step_started')).toBe(true)
  })

  it('filter by event_type (array · multiple)', async () => {
    const rows = await read(s, {
      tenant_id: T1,
      event_type: ['step_started', 'step_completed'],
    })
    expect(rows.length).toBe(8) // canon · 2 types × 2 clients × 2 streams
  })

  it('filter by correlation_id', async () => {
    const corr = randomUUID()
    await append(
      s,
      ev({ correlation_id: corr, stream_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', idempotency_key: 'corr_k' }),
    )
    const rows = await read(s, { tenant_id: T1, correlation_id: corr })
    expect(rows.length).toBe(1)
    expect(rows[0]!.correlation_id).toBe(corr)
  })

  it('filter by journey_type', async () => {
    await append(s, ev({ journey_type: 'ONBOARD', stream_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', idempotency_key: 'jt' }))
    const rows = await read(s, { tenant_id: T1, journey_type: 'ONBOARD' })
    expect(rows.length).toBe(1)
    expect(rows[0]!.journey_type).toBe('ONBOARD')
  })
})

describe('read · canon canonical · time window', () => {
  it('filter by since (occurred_at >= since)', async () => {
    const s = new InMemoryEventLogStorage()
    await append(
      s,
      ev({
        idempotency_key: 'past',
        occurred_at: '2026-01-01T00:00:00.000Z',
      }),
    )
    await append(
      s,
      ev({
        idempotency_key: 'future',
        occurred_at: '2027-01-01T00:00:00.000Z',
      }),
    )
    const rows = await read(s, {
      tenant_id: T1,
      since: '2026-06-01T00:00:00.000Z',
    })
    expect(rows.length).toBe(1)
    expect(rows[0]!.idempotency_key).toBe('future')
  })

  it('filter by until (occurred_at < until)', async () => {
    const s = new InMemoryEventLogStorage()
    await append(
      s,
      ev({
        idempotency_key: 'past',
        occurred_at: '2026-01-01T00:00:00.000Z',
      }),
    )
    await append(
      s,
      ev({
        idempotency_key: 'future',
        occurred_at: '2027-01-01T00:00:00.000Z',
      }),
    )
    const rows = await read(s, {
      tenant_id: T1,
      until: '2026-06-01T00:00:00.000Z',
    })
    expect(rows.length).toBe(1)
    expect(rows[0]!.idempotency_key).toBe('past')
  })
})

describe('read · canon canonical · ordering', () => {
  let s: InMemoryEventLogStorage
  beforeEach(async () => {
    s = new InMemoryEventLogStorage()
    await append(s, ev({ stream_id: SA, idempotency_key: 'a' }))
    await append(s, ev({ stream_id: SA, idempotency_key: 'b' }))
    await append(s, ev({ stream_id: SA, idempotency_key: 'c' }))
  })

  it('default order canon canonical · sequence_asc', async () => {
    const rows = await read(s, { tenant_id: T1, stream_id: SA })
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3])
  })

  it('order sequence_desc', async () => {
    const rows = await read(s, { tenant_id: T1, stream_id: SA, order: 'sequence_desc' })
    expect(rows.map((r) => r.sequence)).toEqual([3, 2, 1])
  })

  it('order occurred_at_desc', async () => {
    const rows = await read(s, { tenant_id: T1, stream_id: SA, order: 'occurred_at_desc' })
    expect(rows.length).toBe(3)
    // canon · canon canon canon canon · canon canonical occurred_at descending order
    expect(rows[0]!.occurred_at >= rows[1]!.occurred_at).toBe(true)
    expect(rows[1]!.occurred_at >= rows[2]!.occurred_at).toBe(true)
  })
})

describe('read · canon canonical · limit cap', () => {
  it('default limit canon canonical · 100', async () => {
    const s = new InMemoryEventLogStorage()
    // canon · 150 events single stream
    for (let i = 0; i < 150; i++) {
      await append(s, ev({ idempotency_key: `lim_${i}` }))
    }
    const rows = await read(s, { tenant_id: T1 })
    expect(rows.length).toBe(100)
  })

  it('respects custom limit', async () => {
    const s = new InMemoryEventLogStorage()
    for (let i = 0; i < 30; i++) {
      await append(s, ev({ idempotency_key: `c_${i}` }))
    }
    const rows = await read(s, { tenant_id: T1, limit: 5 })
    expect(rows.length).toBe(5)
  })

  it('caps limit at 1000', async () => {
    const s = new InMemoryEventLogStorage()
    for (let i = 0; i < 50; i++) {
      await append(s, ev({ idempotency_key: `m_${i}` }))
    }
    const rows = await read(s, { tenant_id: T1, limit: 99999 })
    expect(rows.length).toBe(50) // all rows · limit clamped invisibly
  })
})

describe('read · canon canonical · roundtrip append→read', () => {
  it('append-then-read returns same data canon canonical', async () => {
    const s = new InMemoryEventLogStorage()
    const corr = randomUUID()
    const ingressId = randomUUID()
    const ag = randomUUID()
    const input: EventAppendInput = {
      tenant_id: T1,
      client_id: CA,
      stream_id: SA,
      correlation_id: corr,
      causation_id: null,
      event_type: 'step_completed',
      journey_type: 'NEXUS',
      operation_type: 'send_email',
      idempotency_key: buildIdempotencyKey({
        operation_type: 'send_email',
        client_id: CA,
        logical_period: '2026-W23',
      }),
      logical_period: '2026-W23',
      workflow_run_id: 'run_xyz',
      step_id: 'step_1',
      step_state: 'done',
      attempt: 1,
      payload: { result: 'ok', count: 5 },
      provenance_tag: {
        source: 'tally_form',
        ingress_id: ingressId,
        session_id: 'sess_1',
        trust_level: 'untrusted',
        received_at: new Date().toISOString(),
        ingress_route: '/api/forms',
      },
      agent_invocation_ref: ag,
    }

    await append(s, input)
    const rows = await read(s, { tenant_id: T1, correlation_id: corr })
    expect(rows.length).toBe(1)
    const r = rows[0]!
    expect(r.event_type).toBe('step_completed')
    expect(r.journey_type).toBe('NEXUS')
    expect(r.operation_type).toBe('send_email')
    expect(r.workflow_run_id).toBe('run_xyz')
    expect(r.step_id).toBe('step_1')
    expect(r.step_state).toBe('done')
    expect(r.attempt).toBe(1)
    expect(r.payload).toEqual({ result: 'ok', count: 5 })
    expect(r.provenance_tag?.ingress_id).toBe(ingressId)
    expect(r.agent_invocation_ref).toBe(ag)
  })
})
