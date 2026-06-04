/**
 * Tests · `writeArtifacts()` · canon canonical canon canon canon-canonical
 *
 * Canon canon canon-event log integration + idempotency + gate event reject
 * + payload validation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeArtifacts } from '../src/lib/sala-blackboard/write'
import { InMemoryEventLogStorage, buildIdempotencyKey } from '@/lib/sala-event-log'
import type { WriteArtifactsInput } from '../src/lib/sala-blackboard/types'

const T = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'
const S = '33333333-3333-3333-3333-333333333333'

function baseInput(overrides: Partial<WriteArtifactsInput> = {}): WriteArtifactsInput {
  return {
    tenant_id: T,
    campaign_id: S,
    client_id: C,
    correlation_id: randomUUID(),
    journey_type: 'PRODUCE',
    operation_type: 'set_brand_voice',
    logical_period: '2026-W23',
    artifacts: [{ key: 'brand_voice', value: 'professional' }],
    ...overrides,
  }
}

describe('writeArtifacts · canon canonical single + multi', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('canon · single artifact write canon canon-appends 1 event', async () => {
    const r = await writeArtifacts(storage, baseInput())
    expect(r.inserted).toBe(true)
    expect(storage.size).toBe(1)
    const payload = r.event.payload as { artifact_writes?: unknown[] }
    expect(Array.isArray(payload.artifact_writes)).toBe(true)
    expect(payload.artifact_writes?.length).toBe(1)
  })

  it('canon · multi artifact writes canon canon-1 event · all canon-in payload', async () => {
    const r = await writeArtifacts(
      storage,
      baseInput({
        artifacts: [
          { key: 'a', value: 1 },
          { key: 'b', value: 2 },
          { key: 'c', value: 3 },
        ],
      }),
    )
    expect(r.inserted).toBe(true)
    const payload = r.event.payload as { artifact_writes: unknown[] }
    expect(payload.artifact_writes.length).toBe(3)
  })

  it('canon · default event_type=step_completed · step_state=done', async () => {
    const r = await writeArtifacts(storage, baseInput())
    expect(r.event.event_type).toBe('step_completed')
    expect(r.event.step_state).toBe('done')
  })

  it('canon · canon canon-respects custom event_type (canon canon-non-gate)', async () => {
    const r = await writeArtifacts(storage, baseInput({ event_type: 'handoff' }))
    expect(r.event.event_type).toBe('handoff')
  })

  it('canon · canon canon-extra_payload keys merged with artifact_writes', async () => {
    const r = await writeArtifacts(
      storage,
      baseInput({
        extra_payload: { metric: 0.95, run_label: 'q3' },
      }),
    )
    const payload = r.event.payload as Record<string, unknown>
    expect(payload.metric).toBe(0.95)
    expect(payload.run_label).toBe('q3')
    expect(Array.isArray(payload.artifact_writes)).toBe(true)
  })

  it('canon · canon canon-step_id + workflow_run_id + agent_invocation_ref propagated', async () => {
    const ag = randomUUID()
    const r = await writeArtifacts(
      storage,
      baseInput({
        step_id: 'step_42',
        workflow_run_id: 'run_xyz',
        agent_invocation_ref: ag,
      }),
    )
    expect(r.event.step_id).toBe('step_42')
    expect(r.event.workflow_run_id).toBe('run_xyz')
    expect(r.event.agent_invocation_ref).toBe(ag)
  })
})

describe('writeArtifacts · canon canonical idempotency dedup', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('canon · same {op, client, period} canon canon-dedup transparently', async () => {
    const a = await writeArtifacts(
      storage,
      baseInput({ artifacts: [{ key: 'k', value: 1 }] }),
    )
    const b = await writeArtifacts(
      storage,
      baseInput({ artifacts: [{ key: 'k', value: 2 }] }),
    )
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(false)
    expect(b.event.event_id).toBe(a.event.event_id) // canon · canon-same row
    expect(storage.size).toBe(1)
  })

  it('canon · different operation_type canon canon-distinct events', async () => {
    const a = await writeArtifacts(
      storage,
      baseInput({ operation_type: 'op_a', artifacts: [{ key: 'k', value: 1 }] }),
    )
    const b = await writeArtifacts(
      storage,
      baseInput({ operation_type: 'op_b', artifacts: [{ key: 'k', value: 2 }] }),
    )
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(true)
    expect(storage.size).toBe(2)
  })

  it('canon · input_hash canon-discriminates content-aware dedup', async () => {
    const a = await writeArtifacts(
      storage,
      baseInput({ input_hash: 'h_1', artifacts: [{ key: 'k', value: 'v1' }] }),
    )
    const b = await writeArtifacts(
      storage,
      baseInput({ input_hash: 'h_2', artifacts: [{ key: 'k', value: 'v2' }] }),
    )
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(true)
    expect(storage.size).toBe(2)
  })

  it('canon · explicit idempotency_key overrides default builder', async () => {
    const k = buildIdempotencyKey({
      operation_type: 'custom_op',
      client_id: C,
      logical_period: 'custom_period',
    })
    const a = await writeArtifacts(
      storage,
      baseInput({ idempotency_key: k, artifacts: [{ key: 'x', value: 1 }] }),
    )
    const b = await writeArtifacts(
      storage,
      baseInput({ idempotency_key: k, artifacts: [{ key: 'x', value: 2 }] }),
    )
    expect(a.inserted).toBe(true)
    expect(b.inserted).toBe(false)
  })
})

describe('writeArtifacts · canon canonical validation + rejects', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('canon · throws on empty artifacts array', async () => {
    await expect(writeArtifacts(storage, baseInput({ artifacts: [] }))).rejects.toThrow(/array required/)
  })

  it('canon · throws on missing artifact key', async () => {
    await expect(
      writeArtifacts(
        storage,
        baseInput({
          artifacts: [{ key: '', value: 'v' }],
        }),
      ),
    ).rejects.toThrow(/key/)
  })

  it('canon · throws when artifact.value missing', async () => {
    await expect(
      writeArtifacts(
        storage,
        baseInput({
          artifacts: [{ key: 'k' } as { key: string; value: unknown }],
        }),
      ),
    ).rejects.toThrow(/value/)
  })

  it('canon · accepts value=null (canon-distinct from missing)', async () => {
    const r = await writeArtifacts(
      storage,
      baseInput({
        artifacts: [{ key: 'tombstone', value: null }],
      }),
    )
    expect(r.inserted).toBe(true)
  })

  it('canon · gate event_type NOT allowed (canon-type system enforces)', () => {
    // canon · canon canon-canon-TypeScript canon-type system already rejects this at compile time.
    // canon · canon canon-runtime check via canon canon-cast to verify the contract holds.
    const input = baseInput({
      // canon · canon canon-canon-canon canon canon-cast to bypass canon-compile check, then expect runtime reject from event log
      event_type: 'gate_pending' as unknown as 'step_completed',
    })
    return expect(writeArtifacts(storage, input)).rejects.toThrow(/gate_type_consistent/)
  })

  it('canon · canon canon-NULL provenance_tag · canon-blackboard writes not ingress', async () => {
    const r = await writeArtifacts(storage, baseInput())
    expect(r.event.provenance_tag).toBeNull()
    expect(r.event.gate_type).toBeNull()
  })
})

describe('writeArtifacts · canon canonical canon-write_by attribution', () => {
  it('canon · canon canon-written_by + semantic_version persist in payload', async () => {
    const storage = new InMemoryEventLogStorage()
    const r = await writeArtifacts(
      storage,
      {
        ...baseInput(),
        artifacts: [
          {
            key: 'brand_voice',
            value: 'casual',
            written_by: 'brand-strategist',
            semantic_version: 'v1.0',
          },
        ],
      },
    )
    const payload = r.event.payload as { artifact_writes: Array<Record<string, unknown>> }
    expect(payload.artifact_writes[0]?.written_by).toBe('brand-strategist')
    expect(payload.artifact_writes[0]?.semantic_version).toBe('v1.0')
  })
})
