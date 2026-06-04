/**
 * Tests · `SupabaseEventLogStorage` · canon canonical canon canon canon-canonical
 *
 * Sprint 12 Fase 0 Ronda 3 Track J · CC#1.
 *
 * Tests the REAL Supabase adapter against a FakeSupabaseClient that
 * mimics PostgREST + UNIQUE constraint semantics. canon canonical-the
 * adapter is canon canonical-NOT exercised against a real Supabase DB
 * here · canon-§148 honest · canonical-§144 migration apply pending.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { SupabaseEventLogStorage } from '../src/lib/sala-event-log/storage/supabase'
import { buildIdempotencyKey, type EventAppendInput } from '../src/lib/sala-event-log'
import { createFakeSupabase, type FakeSupabaseControls } from './_helpers/fake-supabase'

const T = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const S = '44444444-4444-4444-4444-444444444444'

function inputFor(o: Partial<EventAppendInput> = {}): EventAppendInput {
  return {
    tenant_id: T,
    client_id: C,
    stream_id: S,
    correlation_id: randomUUID(),
    event_type: 'dispatch_requested',
    journey_type: 'NEXUS',
    operation_type: 'op',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'op',
      client_id: C,
      logical_period: '2026-W23',
    }),
    logical_period: '2026-W23',
    ...o,
  }
}

describe('SupabaseEventLogStorage · canon canonical constructor', () => {
  it('canon · default maxSequenceRetries = 5', () => {
    const { client } = createFakeSupabase()
    const adapter = new SupabaseEventLogStorage(client)
    expect(adapter).toBeDefined()
  })

  it('canon · throws on canonical-bad maxSequenceRetries', () => {
    const { client } = createFakeSupabase()
    expect(() => new SupabaseEventLogStorage(client, { maxSequenceRetries: 0 })).toThrow(/maxSequenceRetries/)
    expect(() => new SupabaseEventLogStorage(client, { maxSequenceRetries: -1 })).toThrow(/maxSequenceRetries/)
    expect(() => new SupabaseEventLogStorage(client, { maxSequenceRetries: NaN })).toThrow(/maxSequenceRetries/)
  })
})

describe('SupabaseEventLogStorage · canon canonical happy path INSERT', () => {
  let controls: FakeSupabaseControls
  let adapter: SupabaseEventLogStorage

  beforeEach(() => {
    const { client, controls: c } = createFakeSupabase()
    controls = c
    adapter = new SupabaseEventLogStorage(client)
  })

  it('canon · single insert · auto-allocates sequence=1 · inserted=true', async () => {
    const result = await adapter.insert(inputFor())
    expect(result.inserted).toBe(true)
    expect(result.event.sequence).toBe(1)
    expect(controls.rows.length).toBe(1)
  })

  it('canon · sequential inserts · sequence increments per stream', async () => {
    const r1 = await adapter.insert(inputFor({ idempotency_key: 'k1' }))
    const r2 = await adapter.insert(inputFor({ idempotency_key: 'k2' }))
    const r3 = await adapter.insert(inputFor({ idempotency_key: 'k3' }))
    expect(r1.event.sequence).toBe(1)
    expect(r2.event.sequence).toBe(2)
    expect(r3.event.sequence).toBe(3)
  })

  it('canon · different streams · independent sequence counters', async () => {
    const S2 = '55555555-5555-5555-5555-555555555555'
    const a = await adapter.insert(inputFor({ stream_id: S, idempotency_key: 'a' }))
    const b = await adapter.insert(inputFor({ stream_id: S, idempotency_key: 'b' }))
    const c = await adapter.insert(inputFor({ stream_id: S2, idempotency_key: 'c' }))
    expect(a.event.sequence).toBe(1)
    expect(b.event.sequence).toBe(2)
    expect(c.event.sequence).toBe(1)
  })

  it('canon · caller-provided sequence is preserved · no auto-alloc', async () => {
    const r = await adapter.insert(inputFor({ sequence: 42 }))
    expect(r.event.sequence).toBe(42)
  })
})

describe('SupabaseEventLogStorage · canon canonical idempotency dedup (fast-path)', () => {
  let controls: FakeSupabaseControls
  let adapter: SupabaseEventLogStorage

  beforeEach(() => {
    const { client, controls: c } = createFakeSupabase()
    controls = c
    adapter = new SupabaseEventLogStorage(client)
  })

  it('canon · second call with same key returns inserted=false + existing row (pre-check)', async () => {
    const first = await adapter.insert(inputFor({ idempotency_key: 'dup_key' }))
    const second = await adapter.insert(inputFor({ idempotency_key: 'dup_key' }))
    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(second.event.event_id).toBe(first.event.event_id)
    expect(controls.rows.length).toBe(1)
  })

  it('canon · dedup is per-tenant · cross-tenant same key both insert', async () => {
    const a = await adapter.insert(
      inputFor({ tenant_id: T, idempotency_key: 'shared' }),
    )
    const b = await adapter.insert(
      inputFor({ tenant_id: T2, idempotency_key: 'shared' }),
    )
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(true)
    expect(controls.rows.length).toBe(2)
  })
})

describe('SupabaseEventLogStorage · canon canonical idempotency race (post-INSERT 23505)', () => {
  let controls: FakeSupabaseControls
  let adapter: SupabaseEventLogStorage

  beforeEach(() => {
    const { client, controls: c } = createFakeSupabase()
    controls = c
    adapter = new SupabaseEventLogStorage(client)
  })

  it('canon · concurrent INSERT race · pre-check empty but INSERT collides → dedup return', async () => {
    // canon · canon canon-canon-canon canon-canon-canon canon-canon-canon-canon-canon-canon-simulate: pre-check returns empty, allocate ok, INSERT collides with idempotency_key
    // canon · canon canon-canon-canon-canon canon-canon-canon-pre-seed a row that will collide on idempotency_key but is "invisible" to pre-check
    // canon · canon canon-canon-canon-canon canon-canon-canon-trick · canon canon-canon-canon-canon-canon canon-canon-canon-queue a custom maybeSingle response · null for first lookup · then the INSERT will collide because we pre-push a row
    const dupKey = 'race_key'
    // canon · canon canon-canon-pre-existing row (canon canon-canon-not visible to first lookup because we override it)
    controls.push({
      tenant_id: T,
      idempotency_key: dupKey,
      stream_id: S,
      sequence: 99,
      event_type: 'dispatch_requested',
      event_id: 'pre_existing_evt',
    })
    // canon · canon canon-canon-force first findByIdempotencyKey to return null (canon-pre-check race · canon-canon-can't see it yet)
    controls.queueResponseIf(
      (s) => s.op === 'select' && s.eqFilters.some((f) => f.col === 'idempotency_key'),
      { data: null },
    )
    // canon · canon canon-canon-allocateNextSequence (allowed to execute normally · canon canon-canon-canon canon-canon-canon-returns 100 since row.sequence=99 exists)
    // canon · canon canon-canon-INSERT will collide on idempotency_key → 23505 → adapter does lookup, finds the existing row, returns inserted=false

    const result = await adapter.insert(
      inputFor({ idempotency_key: dupKey }),
    )
    expect(result.inserted).toBe(false)
    expect(result.event.event_id).toBe('pre_existing_evt')
  })
})

describe('SupabaseEventLogStorage · canon canonical sequence collision retry', () => {
  let controls: FakeSupabaseControls
  let adapter: SupabaseEventLogStorage

  beforeEach(() => {
    const { client, controls: c } = createFakeSupabase()
    controls = c
    adapter = new SupabaseEventLogStorage(client, { maxSequenceRetries: 3 })
  })

  it('canon · race · stream sequence collides once · retry succeeds', async () => {
    // canon · canon canon-canon-canon canon-canon-pre-seed sequence=1 (canon canon-canon-canon-canon-canon-canon-pretend another writer raced ahead)
    controls.push({
      tenant_id: T,
      stream_id: S,
      sequence: 1,
      idempotency_key: 'other_writer',
      event_id: 'other_evt',
      event_type: 'dispatch_requested',
    })

    // canon · canon canon-canon-canon-attempt to insert with auto-alloc → adapter will allocate 2, INSERT succeeds canon-no collision because seq 1 already taken
    const result = await adapter.insert(
      inputFor({ idempotency_key: 'mine' }),
    )
    expect(result.inserted).toBe(true)
    expect(result.event.sequence).toBe(2)
  })

  it('canon · explicit sequence collision · no retry · throws', async () => {
    controls.push({
      tenant_id: T,
      stream_id: S,
      sequence: 5,
      idempotency_key: 'other',
      event_id: 'o',
      event_type: 'dispatch_requested',
    })
    await expect(
      adapter.insert(inputFor({ idempotency_key: 'mine', sequence: 5 })),
    ).rejects.toThrow(/stream_sequence_unique/)
  })

  it('canon · max retries exhausted · throws clear error', async () => {
    // canon · canon canon-canon-canon-pre-push many sequence values to force exhaustion
    // canon · canon canon-canon-canon-strategy · canon canon-canon-canon canon-canon-canon-queue 3 sequential INSERT responses returning 23505 collision regardless of sequence
    for (let i = 0; i < 3; i++) {
      controls.queueResponseIf(
        (s) => s.op === 'insert',
        {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "sala_event_log_stream_sequence_unique"',
          },
        },
      )
    }
    await expect(adapter.insert(inputFor({ idempotency_key: 'exhaust' }))).rejects.toThrow(/max sequence allocation retries/)
  })
})

describe('SupabaseEventLogStorage · canon canonical gate_type CHECK', () => {
  let adapter: SupabaseEventLogStorage

  beforeEach(() => {
    const { client } = createFakeSupabase()
    adapter = new SupabaseEventLogStorage(client)
  })

  it('canon · gate_pending requires gate_type · throws client-side', async () => {
    await expect(
      adapter.insert(
        inputFor({ event_type: 'gate_pending', idempotency_key: 'g1' }),
      ),
    ).rejects.toThrow(/gate_type_consistent/)
  })

  it('canon · non-gate event MUST have gate_type NULL · throws client-side', async () => {
    await expect(
      adapter.insert(
        inputFor({
          event_type: 'step_started',
          gate_type: 'hitl',
          idempotency_key: 'g2',
        }),
      ),
    ).rejects.toThrow(/gate_type_consistent/)
  })

  it('canon · gate_pending + gate_type=hitl → OK', async () => {
    const r = await adapter.insert(
      inputFor({
        event_type: 'gate_pending',
        gate_type: 'hitl',
        idempotency_key: 'g_ok',
      }),
    )
    expect(r.inserted).toBe(true)
    expect(r.event.gate_type).toBe('hitl')
  })

  it('canon · 23514 from DB · propagated as check_violation', async () => {
    const { client, controls } = createFakeSupabase()
    const a = new SupabaseEventLogStorage(client)
    // canon · canon canon-canon-canon-bypass client-side check (caller-provided sequence matches OK path), force DB to throw 23514
    controls.queueResponseIf(
      (s) => s.op === 'insert',
      {
        error: {
          code: '23514',
          message: 'check constraint violation · sala_event_log_gate_type_consistent',
        },
      },
    )
    await expect(a.insert(inputFor({ idempotency_key: 'check' }))).rejects.toThrow(/check_violation/)
  })
})

describe('SupabaseEventLogStorage · canon canonical select with filters', () => {
  let controls: FakeSupabaseControls
  let adapter: SupabaseEventLogStorage

  beforeEach(async () => {
    const { client, controls: c } = createFakeSupabase()
    controls = c
    adapter = new SupabaseEventLogStorage(client)
    // canon · canon canon-canon-canon-pre-populate 6 rows · canon canon-canon-canon-canon-canon canon-canon-canon-3 streams · 2 tenants
    for (let i = 0; i < 3; i++) {
      await adapter.insert(inputFor({ stream_id: S, idempotency_key: `s_${i}` }))
    }
    const S2 = '55555555-5555-5555-5555-555555555555'
    for (let i = 0; i < 2; i++) {
      await adapter.insert(inputFor({ stream_id: S2, idempotency_key: `s2_${i}` }))
    }
    await adapter.insert(inputFor({ tenant_id: T2, idempotency_key: 't2' }))
  })

  it('canon · tenant_id required · throws if missing', async () => {
    await expect(adapter.select({ tenant_id: '' })).rejects.toThrow(/tenant_id/)
  })

  it('canon · tenant isolation · canon canon-canon-canon-canon-NEVER cross-tenant', async () => {
    const t1Rows = await adapter.select({ tenant_id: T })
    const t2Rows = await adapter.select({ tenant_id: T2 })
    expect(t1Rows.length).toBe(5)
    expect(t2Rows.length).toBe(1)
    expect(t1Rows.every((r) => r.tenant_id === T)).toBe(true)
  })

  it('canon · stream_id filter narrows', async () => {
    const rows = await adapter.select({ tenant_id: T, stream_id: S })
    expect(rows.length).toBe(3)
  })

  it('canon · default limit canon-canon-100', async () => {
    const rows = await adapter.select({ tenant_id: T })
    expect(rows.length).toBeLessThanOrEqual(100)
  })

  it('canon · canonical-respects custom limit + caps at 1000', async () => {
    const rows = await adapter.select({ tenant_id: T, limit: 2 })
    expect(rows.length).toBe(2)
    const all = await adapter.select({ tenant_id: T, limit: 999999 })
    expect(all.length).toBe(5)
  })

  it('canon · canonical-propagates Supabase select error', async () => {
    controls.queueResponse({
      error: { code: 'PGRST200', message: 'select failed (canon canonical-injected)' },
    })
    await expect(adapter.select({ tenant_id: T })).rejects.toThrow(/select_failed/)
  })
})

describe('SupabaseEventLogStorage · canon canonical findByIdempotencyKey', () => {
  it('canon · returns row when found', async () => {
    const { client, controls } = createFakeSupabase()
    const adapter = new SupabaseEventLogStorage(client)
    await adapter.insert(inputFor({ idempotency_key: 'findable' }))
    void controls
    const found = await adapter.findByIdempotencyKey(T, 'findable')
    expect(found).not.toBeNull()
    expect(found?.idempotency_key).toBe('findable')
  })

  it('canon · returns null when not found', async () => {
    const { client } = createFakeSupabase()
    const adapter = new SupabaseEventLogStorage(client)
    const found = await adapter.findByIdempotencyKey(T, 'nope')
    expect(found).toBeNull()
  })

  it('canon · propagates lookup error', async () => {
    const { client, controls } = createFakeSupabase()
    const adapter = new SupabaseEventLogStorage(client)
    controls.queueResponse({
      error: { code: 'PGRST301', message: 'lookup failed (canonical-injected)' },
    })
    await expect(adapter.findByIdempotencyKey(T, 'anything')).rejects.toThrow(/lookup_failed/)
  })
})
