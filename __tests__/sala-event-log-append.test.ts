/**
 * Tests · append(event) · canon canonical canon canon monotonic sequence
 *                          + UNIQUE(idempotency_key) dedup
 *                          + gate_type consistency CHECK
 *                          + tenant scoping
 *
 * Canonical canon canon · tests run against InMemoryEventLogStorage · canon
 * canonical canon canon-mirrors DB semantics exactly · canon canonical canon-
 * canon-canon-real Supabase adapter exercised post §144 migration apply.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { append } from '../src/lib/sala-event-log/append'
import { InMemoryEventLogStorage } from '../src/lib/sala-event-log/storage/in-memory'
import { buildIdempotencyKey } from '../src/lib/sala-event-log/idempotency'
import type { EventAppendInput } from '../src/lib/sala-event-log/types'

const T1 = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const C1 = '33333333-3333-3333-3333-333333333333'
const S1 = '44444444-4444-4444-4444-444444444444'
const S2 = '55555555-5555-5555-5555-555555555555'

function baseEvent(overrides: Partial<EventAppendInput> = {}): EventAppendInput {
  return {
    tenant_id: T1,
    client_id: C1,
    stream_id: S1,
    correlation_id: randomUUID(),
    event_type: 'dispatch_requested',
    journey_type: 'NEXUS',
    operation_type: 'weekly_report',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'weekly_report',
      client_id: C1,
      logical_period: '2026-W23',
    }),
    logical_period: '2026-W23',
    ...overrides,
  }
}

describe('append · canon canonical canon · single insert', () => {
  let storage: InMemoryEventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('inserts a new event · returns inserted=true', async () => {
    const result = await append(storage, baseEvent())
    expect(result.inserted).toBe(true)
    expect(result.event.event_id).toBeTruthy()
    expect(result.event.sequence).toBe(1)
    expect(storage.size).toBe(1)
  })

  it('canon canonical · auto-allocates sequence per stream', async () => {
    const r1 = await append(storage, baseEvent({ idempotency_key: 'key_1' }))
    const r2 = await append(storage, baseEvent({ idempotency_key: 'key_2' }))
    const r3 = await append(storage, baseEvent({ idempotency_key: 'key_3' }))
    expect(r1.event.sequence).toBe(1)
    expect(r2.event.sequence).toBe(2)
    expect(r3.event.sequence).toBe(3)
  })

  it('canon canonical · sequence per-stream is independent across streams', async () => {
    const r1a = await append(storage, baseEvent({ stream_id: S1, idempotency_key: 'a1' }))
    const r1b = await append(storage, baseEvent({ stream_id: S1, idempotency_key: 'a2' }))
    const r2a = await append(storage, baseEvent({ stream_id: S2, idempotency_key: 'b1' }))
    const r2b = await append(storage, baseEvent({ stream_id: S2, idempotency_key: 'b2' }))
    expect(r1a.event.sequence).toBe(1)
    expect(r1b.event.sequence).toBe(2)
    expect(r2a.event.sequence).toBe(1)
    expect(r2b.event.sequence).toBe(2)
  })

  it('canon canonical · respects caller-provided sequence (replay/import)', async () => {
    const result = await append(storage, baseEvent({ sequence: 42 }))
    expect(result.event.sequence).toBe(42)
  })

  it('canon canonical · respects caller-provided event_id', async () => {
    const explicit = randomUUID()
    const result = await append(storage, baseEvent({ event_id: explicit }))
    expect(result.event.event_id).toBe(explicit)
  })
})

describe('append · canon canonical · UNIQUE(idempotency_key) dedup', () => {
  let storage: InMemoryEventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('second append with same idempotency_key returns inserted=false + existing row', async () => {
    const first = await append(storage, baseEvent({ idempotency_key: 'dup_key' }))
    const second = await append(storage, baseEvent({ idempotency_key: 'dup_key' }))
    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(second.event.event_id).toBe(first.event.event_id)
    expect(storage.size).toBe(1) // canon · only one row persisted
  })

  it('canon canonical daemon-$19 scenario · canon canon canon-collapses transparently', async () => {
    const key = buildIdempotencyKey({
      operation_type: 'jefe_marketing_weekly',
      client_id: 'cliente-piloto-perez',
      logical_period: '2026-W23',
    })
    // canon canon · 5 distintos triggers · canon canon-same key
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(
        await append(
          storage,
          baseEvent({
            idempotency_key: key,
            correlation_id: randomUUID(), // distinto · canon canon-not part of dedup
            operation_type: 'jefe_marketing_weekly',
          }),
        ),
      )
    }
    expect(results[0]!.inserted).toBe(true)
    expect(results.slice(1).every((r) => r.inserted === false)).toBe(true)
    expect(storage.size).toBe(1)
  })

  it('canon canonical · dedup is per-tenant (canon canon canon · canon canon canon canon-cross-tenant keys do NOT collide)', async () => {
    const r1 = await append(storage, baseEvent({ tenant_id: T1, idempotency_key: 'shared_key' }))
    const r2 = await append(storage, baseEvent({ tenant_id: T2, idempotency_key: 'shared_key' }))
    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(true)
    expect(storage.size).toBe(2)
  })
})

describe('append · canon canonical · UNIQUE(stream_id, sequence) collision', () => {
  let storage: InMemoryEventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('throws when caller passes a sequence already used in same stream', async () => {
    await append(storage, baseEvent({ idempotency_key: 'k1', sequence: 7 }))
    await expect(
      append(storage, baseEvent({ idempotency_key: 'k2', sequence: 7 })),
    ).rejects.toThrow(/stream_sequence_unique/)
  })

  it('canon canon · same sequence in different stream is OK', async () => {
    const r1 = await append(
      storage,
      baseEvent({ stream_id: S1, idempotency_key: 'k1', sequence: 7 }),
    )
    const r2 = await append(
      storage,
      baseEvent({ stream_id: S2, idempotency_key: 'k2', sequence: 7 }),
    )
    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(true)
  })
})

describe('append · canon canonical · gate_type consistency CHECK', () => {
  let storage: InMemoryEventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('gate_pending requires gate_type · throws when absent', async () => {
    await expect(
      append(
        storage,
        baseEvent({
          event_type: 'gate_pending',
          idempotency_key: 'g1',
        }),
      ),
    ).rejects.toThrow(/gate_type_consistent/)
  })

  it('gate_resolved requires gate_type · throws when absent', async () => {
    await expect(
      append(
        storage,
        baseEvent({
          event_type: 'gate_resolved',
          idempotency_key: 'g2',
        }),
      ),
    ).rejects.toThrow(/gate_type_consistent/)
  })

  it('non-gate event MUST have gate_type NULL · throws when set', async () => {
    await expect(
      append(
        storage,
        baseEvent({
          event_type: 'step_started',
          gate_type: 'hitl',
          idempotency_key: 'g3',
        }),
      ),
    ).rejects.toThrow(/gate_type_consistent/)
  })

  it('gate_pending + gate_type=hitl → OK', async () => {
    const r = await append(
      storage,
      baseEvent({
        event_type: 'gate_pending',
        gate_type: 'hitl',
        idempotency_key: 'g4',
      }),
    )
    expect(r.inserted).toBe(true)
    expect(r.event.gate_type).toBe('hitl')
  })

  it('gate_pending + gate_type=camino_iii → OK', async () => {
    const r = await append(
      storage,
      baseEvent({
        event_type: 'gate_pending',
        gate_type: 'camino_iii',
        idempotency_key: 'g5',
      }),
    )
    expect(r.event.gate_type).toBe('camino_iii')
  })

  it('gate_pending + gate_type=§144 → OK', async () => {
    const r = await append(
      storage,
      baseEvent({
        event_type: 'gate_pending',
        gate_type: '§144',
        idempotency_key: 'g6',
      }),
    )
    expect(r.event.gate_type).toBe('§144')
  })
})

describe('append · canon canonical · payload + provenance + canon-cadena causal', () => {
  let storage: InMemoryEventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('persists payload JSONB', async () => {
    const r = await append(
      storage,
      baseEvent({
        payload: { foo: 'bar', n: 42, nested: { ok: true } },
      }),
    )
    expect(r.event.payload).toEqual({ foo: 'bar', n: 42, nested: { ok: true } })
  })

  it('payload defaults to {} when omitted (canon · canon-canon-canon DB default)', async () => {
    const r = await append(storage, baseEvent())
    expect(r.event.payload).toEqual({})
  })

  it('persists provenance_tag JSONB top-level', async () => {
    const tag = {
      source: 'tally_form',
      ingress_id: randomUUID(),
      session_id: 'abc123',
      trust_level: 'untrusted' as const,
      received_at: new Date().toISOString(),
      ingress_route: '/api/forms/submit',
    }
    const r = await append(
      storage,
      baseEvent({
        provenance_tag: tag,
      }),
    )
    expect(r.event.provenance_tag).toEqual(tag)
  })

  it('persists causation_id (cadena causal)', async () => {
    const cause = randomUUID()
    const r = await append(
      storage,
      baseEvent({
        causation_id: cause,
        event_type: 'step_started',
      }),
    )
    expect(r.event.causation_id).toBe(cause)
  })
})
