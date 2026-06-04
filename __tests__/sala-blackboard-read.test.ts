/**
 * Tests · `readBlackboard()` · canon canonical canon canon canon-roundtrip
 *
 * Canon canon canon-write → read → project: blackboard state is correct.
 * Cross-campaign isolation. Time-window. Cumulative growth across writes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readBlackboard } from '../src/lib/sala-blackboard/read'
import { writeArtifacts } from '../src/lib/sala-blackboard/write'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'

const T = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const S = '44444444-4444-4444-4444-444444444444'
const S2 = '55555555-5555-5555-5555-555555555555'

function inputFor(
  storage: InMemoryEventLogStorage,
  o: Partial<{
    operation_type: string
    artifacts: Array<{ key: string; value: unknown; written_by?: string }>
    campaign_id: string
    tenant_id: string
    occurred_at: string
    logical_period: string
  }> = {},
) {
  return {
    storage,
    input: {
      tenant_id: o.tenant_id ?? T,
      campaign_id: o.campaign_id ?? S,
      client_id: C,
      correlation_id: randomUUID(),
      journey_type: 'PRODUCE',
      operation_type: o.operation_type ?? 'op_' + Math.random().toString(36).slice(2),
      logical_period: o.logical_period ?? '2026-W23',
      artifacts: o.artifacts ?? [{ key: 'k', value: 'v' }],
      ...(o.occurred_at ? { occurred_at: o.occurred_at } : {}),
    },
  }
}

describe('readBlackboard · canon canonical required scope', () => {
  it('canon · throws when tenant_id missing', async () => {
    const s = new InMemoryEventLogStorage()
    await expect(readBlackboard(s, { tenant_id: '', campaign_id: S })).rejects.toThrow(/tenant_id/)
  })

  it('canon · throws when campaign_id missing', async () => {
    const s = new InMemoryEventLogStorage()
    await expect(readBlackboard(s, { tenant_id: T, campaign_id: '' })).rejects.toThrow(/campaign_id/)
  })
})

describe('readBlackboard · canon canonical empty + populated', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('canon · empty log returns empty state with requested scope', async () => {
    const state = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    expect(state.artifacts).toEqual({})
    expect(state.last_sequence).toBe(0)
    expect(state.tenant_id).toBe(T)
    expect(state.campaign_id).toBe(S)
  })

  it('canon · single write canon canon-1 artifact projected', async () => {
    const a = inputFor(storage)
    await writeArtifacts(a.storage, a.input)
    const state = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    expect(Object.keys(state.artifacts)).toEqual(['k'])
    expect(state.artifacts.k?.value).toBe('v')
  })

  it('canon · roundtrip · canon canon-multiple keys + overwrite version increment', async () => {
    const a = inputFor(storage, {
      operation_type: 'set_voice',
      artifacts: [{ key: 'brand_voice', value: 'professional' }],
    })
    await writeArtifacts(a.storage, a.input)

    const b = inputFor(storage, {
      operation_type: 'set_voice',
      logical_period: '2026-W24', // canon · canon canon-different period · canon canon-NOT dedup
      artifacts: [{ key: 'brand_voice', value: 'casual', written_by: 'brand-strategist' }],
    })
    await writeArtifacts(b.storage, b.input)

    const c = inputFor(storage, {
      operation_type: 'set_audience',
      artifacts: [{ key: 'target_audience', value: 'millennials' }],
    })
    await writeArtifacts(c.storage, c.input)

    const state = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    expect(state.artifacts.brand_voice?.value).toBe('casual') // canon · canon-last write
    expect(state.artifacts.brand_voice?.version).toBe(2)
    expect(state.artifacts.brand_voice?.written_by).toBe('brand-strategist')
    expect(state.artifacts.target_audience?.value).toBe('millennials')
    expect(state.artifacts.target_audience?.version).toBe(1)
  })
})

describe('readBlackboard · canon canonical cross-campaign isolation', () => {
  it('canon · canon canon-each campaign blackboard isolated', async () => {
    const storage = new InMemoryEventLogStorage()

    const a = inputFor(storage, {
      campaign_id: S,
      operation_type: 'op_x',
      artifacts: [{ key: 'k', value: 'campA' }],
    })
    await writeArtifacts(a.storage, a.input)

    const b = inputFor(storage, {
      campaign_id: S2,
      operation_type: 'op_y',
      artifacts: [{ key: 'k', value: 'campB' }],
    })
    await writeArtifacts(b.storage, b.input)

    const stateA = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    const stateB = await readBlackboard(storage, { tenant_id: T, campaign_id: S2 })
    expect(stateA.artifacts.k?.value).toBe('campA')
    expect(stateB.artifacts.k?.value).toBe('campB')
  })
})

describe('readBlackboard · canon canonical cross-tenant isolation (RLS)', () => {
  it('canon · canon canon-canon canon-different tenants NEVER see each other artifacts', async () => {
    const storage = new InMemoryEventLogStorage()

    const a = inputFor(storage, {
      tenant_id: T,
      operation_type: 'op_a',
      artifacts: [{ key: 'k', value: 'tenant_A' }],
    })
    await writeArtifacts(a.storage, a.input)

    const b = inputFor(storage, {
      tenant_id: T2,
      operation_type: 'op_b',
      artifacts: [{ key: 'k', value: 'tenant_B' }],
    })
    await writeArtifacts(b.storage, b.input)

    const stateA = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    const stateB = await readBlackboard(storage, { tenant_id: T2, campaign_id: S })
    expect(stateA.artifacts.k?.value).toBe('tenant_A')
    expect(stateB.artifacts.k?.value).toBe('tenant_B')
  })
})

describe('readBlackboard · canon canonical time window', () => {
  let storage: InMemoryEventLogStorage
  beforeEach(async () => {
    storage = new InMemoryEventLogStorage()
    // canon · canon-3 writes at different times canon-2026-06-01 · 06-02 · 06-03
    const w1 = inputFor(storage, {
      operation_type: 'op_1',
      occurred_at: '2026-06-01T00:00:00.000Z',
      artifacts: [{ key: 'k', value: 'v_jun_1' }],
    })
    await writeArtifacts(w1.storage, w1.input)

    const w2 = inputFor(storage, {
      operation_type: 'op_2',
      occurred_at: '2026-06-02T00:00:00.000Z',
      artifacts: [{ key: 'k', value: 'v_jun_2' }],
    })
    await writeArtifacts(w2.storage, w2.input)

    const w3 = inputFor(storage, {
      operation_type: 'op_3',
      occurred_at: '2026-06-03T00:00:00.000Z',
      artifacts: [{ key: 'k', value: 'v_jun_3' }],
    })
    await writeArtifacts(w3.storage, w3.input)
  })

  it('canon · canon canon-no window · canon canon-canon-current state = last write', async () => {
    const state = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    expect(state.artifacts.k?.value).toBe('v_jun_3')
    expect(state.artifacts.k?.version).toBe(3)
  })

  it('canon · canon-until snapshot canon canon-canonical-rollback view', async () => {
    const state = await readBlackboard(storage, {
      tenant_id: T,
      campaign_id: S,
      until: '2026-06-02T12:00:00.000Z',
    })
    expect(state.artifacts.k?.value).toBe('v_jun_2')
    expect(state.artifacts.k?.version).toBe(2)
  })

  it('canon · canon-since canon canon-canonical-recent-only view', async () => {
    const state = await readBlackboard(storage, {
      tenant_id: T,
      campaign_id: S,
      since: '2026-06-02T12:00:00.000Z',
    })
    expect(state.artifacts.k?.value).toBe('v_jun_3')
    // canon · canon-version=1 since canonical-only the jun_3 write canonical-was scanned
    expect(state.artifacts.k?.version).toBe(1)
  })
})

describe('readBlackboard · canon canonical canon-NEXUS gap #5 scenario', () => {
  it('canon · canon canon canon-multiple agents writing to canon canon-shared blackboard', async () => {
    // canon · canon canon-canon canon-NEXUS pattern · multiple agents contribute artifacts
    // canon · canon-historically merged ad-hoc in JS · canon-now derived from log
    const storage = new InMemoryEventLogStorage()

    // canon · brand-strategist sets voice
    await writeArtifacts(
      storage,
      {
        tenant_id: T,
        campaign_id: S,
        client_id: C,
        correlation_id: randomUUID(),
        journey_type: 'PRODUCE',
        operation_type: 'brand_strategist_phase',
        logical_period: '2026-W23',
        artifacts: [
          {
            key: 'brand_voice',
            value: 'casual',
            written_by: 'brand-strategist',
          },
          {
            key: 'target_audience',
            value: 'millennials',
            written_by: 'brand-strategist',
          },
        ],
      },
    )

    // canon · creative-director sets concept
    await writeArtifacts(
      storage,
      {
        tenant_id: T,
        campaign_id: S,
        client_id: C,
        correlation_id: randomUUID(),
        journey_type: 'PRODUCE',
        operation_type: 'creative_director_phase',
        logical_period: '2026-W23',
        artifacts: [
          {
            key: 'creative_concept',
            value: { headline: 'X', cta: 'Y' },
            written_by: 'creative-director',
          },
        ],
      },
    )

    // canon · content-creator adds copy
    await writeArtifacts(
      storage,
      {
        tenant_id: T,
        campaign_id: S,
        client_id: C,
        correlation_id: randomUUID(),
        journey_type: 'PRODUCE',
        operation_type: 'content_creator_phase',
        logical_period: '2026-W23',
        artifacts: [
          {
            key: 'final_copy',
            value: { body: '...', hashtags: ['#a', '#b'] },
            written_by: 'content-creator',
          },
        ],
      },
    )

    const state = await readBlackboard(storage, { tenant_id: T, campaign_id: S })
    expect(Object.keys(state.artifacts).sort()).toEqual([
      'brand_voice',
      'creative_concept',
      'final_copy',
      'target_audience',
    ])
    expect(state.artifacts.brand_voice?.written_by).toBe('brand-strategist')
    expect(state.artifacts.creative_concept?.written_by).toBe('creative-director')
    expect(state.artifacts.final_copy?.written_by).toBe('content-creator')
    expect(state.last_sequence).toBe(3)
    expect(state.total_events_scanned).toBe(3)
  })
})
