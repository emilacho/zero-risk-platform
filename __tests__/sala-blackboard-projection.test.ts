/**
 * Tests · `projectBlackboard()` · canon canonical pure function projection
 *
 * Canon canon canon-canonical-last-write-wins per key · ordering by sequence
 * · multi-campaign isolation · skip canonical-malformed payloads.
 */
import { describe, it, expect } from 'vitest'
import { projectBlackboard } from '../src/lib/sala-blackboard/projection'
import type { PersistedEvent } from '@/lib/sala-event-log'

const T = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'
const S = '33333333-3333-3333-3333-333333333333'

function ev(overrides: Partial<PersistedEvent>): PersistedEvent {
  return {
    event_id: 'e_' + Math.random().toString(36).slice(2),
    sequence: 1,
    occurred_at: '2026-06-03T00:00:00.000Z',
    tenant_id: T,
    client_id: C,
    stream_id: S,
    correlation_id: 'corr',
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'PRODUCE',
    operation_type: 'test_op',
    idempotency_key: 'k_' + Math.random().toString(36).slice(2),
    logical_period: '2026-W23',
    input_hash: null,
    workflow_run_id: null,
    step_id: null,
    step_state: 'done',
    attempt: null,
    payload: {},
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-03T00:00:00.000Z',
    ...overrides,
  }
}

describe('projectBlackboard · canon canonical empty + skip cases', () => {
  it('empty events array returns empty state', () => {
    const state = projectBlackboard([])
    expect(state.artifacts).toEqual({})
    expect(state.last_sequence).toBe(0)
    expect(state.total_events_scanned).toBe(0)
    expect(state.campaign_id).toBe('')
    expect(state.tenant_id).toBe('')
  })

  it('events without artifact_writes do not produce artifacts', () => {
    const state = projectBlackboard([
      ev({ sequence: 1, payload: { unrelated: 'data' } }),
      ev({ sequence: 2, payload: {} }),
    ])
    expect(state.artifacts).toEqual({})
    expect(state.total_events_scanned).toBe(2)
    expect(state.last_sequence).toBe(2)
  })

  it('canon canon · canon-skips malformed artifact writes silently (canon-defense)', () => {
    const state = projectBlackboard([
      ev({
        sequence: 1,
        payload: {
          artifact_writes: [
            { key: '', value: 'empty-key-skipped' }, // canon-skipped (empty key)
            { value: 'no-key-skipped' } as never, // canon-skipped (missing key)
            { key: 'valid', value: 'ok' },
          ],
        },
      }),
    ])
    expect(Object.keys(state.artifacts)).toEqual(['valid'])
    expect(state.artifacts.valid?.value).toBe('ok')
  })

  it('canon canon · canon-non-array artifact_writes skipped', () => {
    const state = projectBlackboard([
      ev({
        sequence: 1,
        payload: { artifact_writes: 'not-an-array' as never },
      }),
    ])
    expect(state.artifacts).toEqual({})
  })
})

describe('projectBlackboard · canon canonical single + multi writes', () => {
  it('canon · single write produces 1 artifact · version=1', () => {
    const state = projectBlackboard([
      ev({
        event_id: 'e1',
        sequence: 1,
        payload: {
          artifact_writes: [{ key: 'brand_voice', value: 'professional' }],
        },
      }),
    ])
    expect(state.artifacts.brand_voice).toEqual({
      key: 'brand_voice',
      value: 'professional',
      version: 1,
      written_at: '2026-06-03T00:00:00.000Z',
      written_by_event_id: 'e1',
      written_by: undefined,
      semantic_version: undefined,
    })
  })

  it('canon · multiple keys in one event · all canon canon-set version=1', () => {
    const state = projectBlackboard([
      ev({
        sequence: 1,
        payload: {
          artifact_writes: [
            { key: 'brand_voice', value: 'casual' },
            { key: 'target_audience', value: 'millennials' },
            { key: 'tone', value: 'witty' },
          ],
        },
      }),
    ])
    expect(state.artifacts.brand_voice?.value).toBe('casual')
    expect(state.artifacts.target_audience?.value).toBe('millennials')
    expect(state.artifacts.tone?.value).toBe('witty')
    expect(state.artifacts.brand_voice?.version).toBe(1)
  })

  it('canon · written_by + semantic_version propagated', () => {
    const state = projectBlackboard([
      ev({
        sequence: 1,
        payload: {
          artifact_writes: [
            {
              key: 'creative_brief',
              value: { headline: 'X' },
              written_by: 'brand-strategist',
              semantic_version: 'v1.2.0',
            },
          ],
        },
      }),
    ])
    const a = state.artifacts.creative_brief
    expect(a?.written_by).toBe('brand-strategist')
    expect(a?.semantic_version).toBe('v1.2.0')
    expect(a?.value).toEqual({ headline: 'X' })
  })
})

describe('projectBlackboard · canon canonical last-write-wins', () => {
  it('overwrite same key in later sequence · version increments', () => {
    const state = projectBlackboard([
      ev({
        event_id: 'e1',
        sequence: 1,
        payload: {
          artifact_writes: [{ key: 'brand_voice', value: 'v1' }],
        },
      }),
      ev({
        event_id: 'e2',
        sequence: 2,
        occurred_at: '2026-06-03T01:00:00.000Z',
        payload: {
          artifact_writes: [{ key: 'brand_voice', value: 'v2' }],
        },
      }),
      ev({
        event_id: 'e3',
        sequence: 3,
        occurred_at: '2026-06-03T02:00:00.000Z',
        payload: {
          artifact_writes: [{ key: 'brand_voice', value: 'v3' }],
        },
      }),
    ])
    const a = state.artifacts.brand_voice
    expect(a?.value).toBe('v3')
    expect(a?.version).toBe(3)
    expect(a?.written_at).toBe('2026-06-03T02:00:00.000Z')
    expect(a?.written_by_event_id).toBe('e3')
  })

  it('canon · stable sort by sequence even if events arrive out-of-order', () => {
    // canon · canon-shuffled events
    const state = projectBlackboard([
      ev({ event_id: 'e3', sequence: 3, payload: { artifact_writes: [{ key: 'k', value: 'v3' }] } }),
      ev({ event_id: 'e1', sequence: 1, payload: { artifact_writes: [{ key: 'k', value: 'v1' }] } }),
      ev({ event_id: 'e2', sequence: 2, payload: { artifact_writes: [{ key: 'k', value: 'v2' }] } }),
    ])
    expect(state.artifacts.k?.value).toBe('v3')
    expect(state.artifacts.k?.version).toBe(3)
  })

  it('canon · value can be any JSON shape (object · array · null · number)', () => {
    const state = projectBlackboard([
      ev({
        sequence: 1,
        payload: {
          artifact_writes: [
            { key: 'obj', value: { a: 1, b: [2, 3] } },
            { key: 'arr', value: [1, 2, 3] },
            { key: 'null_val', value: null },
            { key: 'num', value: 42 },
            { key: 'bool', value: true },
          ],
        },
      }),
    ])
    expect(state.artifacts.obj?.value).toEqual({ a: 1, b: [2, 3] })
    expect(state.artifacts.arr?.value).toEqual([1, 2, 3])
    expect(state.artifacts.null_val?.value).toBeNull()
    expect(state.artifacts.num?.value).toBe(42)
    expect(state.artifacts.bool?.value).toBe(true)
  })
})

describe('projectBlackboard · canon canonical scope filters', () => {
  const S2 = '44444444-4444-4444-4444-444444444444'
  const T2 = '55555555-5555-5555-5555-555555555555'

  it('canon · campaign_id option filters cross-campaign events', () => {
    const state = projectBlackboard(
      [
        ev({ stream_id: S, sequence: 1, payload: { artifact_writes: [{ key: 'a', value: 'campA' }] } }),
        ev({ stream_id: S2, sequence: 1, payload: { artifact_writes: [{ key: 'b', value: 'campB' }] } }),
      ],
      { campaign_id: S },
    )
    expect(state.artifacts.a?.value).toBe('campA')
    expect(state.artifacts.b).toBeUndefined()
    expect(state.campaign_id).toBe(S)
  })

  it('canon · tenant_id option filters cross-tenant events', () => {
    const state = projectBlackboard(
      [
        ev({ tenant_id: T, sequence: 1, payload: { artifact_writes: [{ key: 'x', value: 'tA' }] } }),
        ev({ tenant_id: T2, sequence: 1, payload: { artifact_writes: [{ key: 'y', value: 'tB' }] } }),
      ],
      { tenant_id: T },
    )
    expect(state.artifacts.x?.value).toBe('tA')
    expect(state.artifacts.y).toBeUndefined()
  })

  it('canon · no filter · canon-derives scope from first event', () => {
    const state = projectBlackboard([
      ev({
        stream_id: S,
        tenant_id: T,
        sequence: 1,
        payload: { artifact_writes: [{ key: 'k', value: 'v' }] },
      }),
    ])
    expect(state.campaign_id).toBe(S)
    expect(state.tenant_id).toBe(T)
  })

  it('canon · last_sequence tracks max sequence seen', () => {
    const state = projectBlackboard([
      ev({ sequence: 1, payload: { artifact_writes: [{ key: 'a', value: 1 }] } }),
      ev({ sequence: 5, payload: { artifact_writes: [{ key: 'b', value: 2 }] } }),
      ev({ sequence: 3, payload: {} }),
    ])
    expect(state.last_sequence).toBe(5)
  })
})

describe('projectBlackboard · canon canonical total_events_scanned + projected_at', () => {
  it('canon · total_events_scanned counts all events (canon-incl. skipped)', () => {
    const state = projectBlackboard([
      ev({ sequence: 1, payload: { artifact_writes: [{ key: 'a', value: 1 }] } }),
      ev({ sequence: 2, payload: {} }),
      ev({ sequence: 3, payload: { artifact_writes: [{ key: 'b', value: 2 }] } }),
    ])
    expect(state.total_events_scanned).toBe(3)
  })

  it('canon · projected_at is ISO 8601 timestamp', () => {
    const state = projectBlackboard([])
    expect(() => new Date(state.projected_at).toISOString()).not.toThrow()
    expect(new Date(state.projected_at).toISOString()).toBe(state.projected_at)
  })
})
