/**
 * Track Q · Sprint 12 Fase 0 · `dispatchSalaTrigger` tests.
 *
 * Cobertura · canon · cubre canon-canonical ·
 *   - happy path · synthetic trigger appends + decide() + logs
 *   - idempotency · same (source + external_id) twice → 1 row · inserted=false · NO double-log
 *   - safety · master flag OFF → refused · NO append
 *   - safety · real-source con sub-gate OFF → refused · NO append
 *   - safety · real-source con sub-gate ON → flows through
 *   - safety · synthetic ignores sub-gate · canon-canon-allowed cuando master ON
 *   - validation · missing required fields → refused
 *   - validation · unsupported journey (Track Q ships ONBOARD only) → refused
 *   - log shape · canon canonical-PR #154-compatible
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  InMemoryEventLogStorage,
  read as readEventLog,
} from '@/lib/sala-event-log'
import {
  buildInMemoryDispatchConfig,
  createInMemorySalaTriggerLogger,
  dispatchSalaTrigger,
  evaluateTriggerSafety,
  type SalaTriggerInput,
} from '@/lib/sala-trigger'

const T = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'

function baseInput(over: Partial<SalaTriggerInput> = {}): SalaTriggerInput {
  return {
    tenant_id: T,
    client_id: C,
    journey_type: 'ONBOARD',
    source: 'synthetic',
    external_id: 'tally-submission-001',
    logical_period: '2026-W23',
    payload: { company_name: 'Smoke Test Co', website_url: 'https://example.com' },
    ...over,
  }
}

describe('Track Q · canon canonical · safety · synthetic siempre permitido cuando master ON', () => {
  it('canon · master OFF · cualquier source → refused', () => {
    const dec = evaluateTriggerSafety({ source: 'synthetic', shadowFlag: 'false' })
    expect(dec.allowed).toBe(false)
    expect(dec.reason).toMatch(/flag_disabled/)
  })

  it('canon · master ON + synthetic · allowed', () => {
    const dec = evaluateTriggerSafety({ source: 'synthetic', shadowFlag: 'true' })
    expect(dec.allowed).toBe(true)
  })

  it('canon · master ON + cron-scan · allowed (sub-gate ignored)', () => {
    const dec = evaluateTriggerSafety({
      source: 'cron_new_clients_scan',
      shadowFlag: 'true',
      realSourcesFlag: 'false',
    })
    expect(dec.allowed).toBe(true)
  })

  it('canon · master ON + real-webhook + sub-gate OFF · refused', () => {
    const dec = evaluateTriggerSafety({
      source: 'webhook_onboarding_form',
      shadowFlag: 'true',
      realSourcesFlag: 'false',
    })
    expect(dec.allowed).toBe(false)
    expect(dec.reason).toMatch(/real_source_blocked/)
  })

  it('canon · master ON + real-webhook + sub-gate ON · allowed', () => {
    const dec = evaluateTriggerSafety({
      source: 'webhook_onboarding_form',
      shadowFlag: 'true',
      realSourcesFlag: 'true',
    })
    expect(dec.allowed).toBe(true)
  })
})

describe('Track Q · canon canonical · happy path · synthetic trigger', () => {
  let storage: InMemoryEventLogStorage
  let captured: ReturnType<typeof createInMemorySalaTriggerLogger>

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
    captured = createInMemorySalaTriggerLogger()
  })

  it('canon · canon-appends step_completed at entry_step + emits Decision[] + logs', async () => {
    const result = await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({ storage, logger: captured.logger }),
    )

    expect(result.mode).toBe('shadow')
    expect(result.inserted).toBe(true)
    expect(result.trigger_event).not.toBeNull()
    expect(result.trigger_event!.event_type).toBe('step_completed')
    expect(result.trigger_event!.journey_type).toBe('ONBOARD')
    expect(result.trigger_event!.step_id).toBe('onboarding_specialist')

    // canon · canon-canonical-decisions should be 1+ (router emits something for entry-step done)
    expect(result.decisions.length).toBeGreaterThanOrEqual(1)
    // canon · canon-canonical-logs match decisions count + carry trigger info
    expect(result.logs.length).toBe(result.decisions.length)
    expect(captured.entries.length).toBe(result.logs.length)
    expect(captured.entries[0].trigger_event_id).toBe(result.trigger_event!.event_id)
    expect(captured.entries[0].canon).toBe('sala-shadow-router')
    expect(captured.entries[0].mode).toBe('shadow')
    expect(captured.entries[0].trigger_source).toBe('synthetic')
  })

  it('canon · canon-canonical-trigger appends EXACTLY one row to the event-log (NO speculation)', async () => {
    await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({ storage, logger: captured.logger }),
    )
    const rows = await readEventLog(storage, { tenant_id: T, order: 'sequence_asc' })
    expect(rows).toHaveLength(1)
    expect(rows[0].event_type).toBe('step_completed')
    expect(rows[0].step_id).toBe('onboarding_specialist')
  })

  it('canon · canon-canonical-derived stream_id is deterministic across calls', async () => {
    const r1 = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-001' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    // canon · canon-canon-second call with different external_id → different stream
    const r2 = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-002' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(r1.stream_id).not.toEqual(r2.stream_id)
    // canon · canon-canon-recall with same external_id · canon-canonical-NEW storage instance to avoid dedup
    const fresh = new InMemoryEventLogStorage()
    const r3 = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-001' }),
      buildInMemoryDispatchConfig({ storage: fresh }),
    )
    expect(r3.stream_id).toEqual(r1.stream_id)
  })
})

describe('Track Q · canon canonical · idempotency · same external_id 2× → 1 row', () => {
  it('canon · canon-canonical-second call returns inserted=false + 0 new decisions', async () => {
    const storage = new InMemoryEventLogStorage()
    const c1 = createInMemorySalaTriggerLogger()
    const c2 = createInMemorySalaTriggerLogger()

    const r1 = await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({ storage, logger: c1.logger }),
    )
    const r2 = await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({ storage, logger: c2.logger }),
    )

    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(false)
    expect(r2.mode).toBe('shadow')
    // canon · canon-canonical-dedup path canon-canonical-does NOT re-invoke router · canon-NO new logs
    expect(r2.decisions).toHaveLength(0)
    expect(r2.logs).toHaveLength(0)
    expect(c2.entries).toHaveLength(0)
    // canon · canon-canonical-storage still has 1 row
    const rows = await readEventLog(storage, { tenant_id: T })
    expect(rows).toHaveLength(1)
  })

  it('canon · canon-canonical-different external_id in same client/period → 2 rows + 2 streams', async () => {
    const storage = new InMemoryEventLogStorage()
    const r1 = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-A' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    const r2 = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-B' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(true)
    expect(r1.stream_id).not.toEqual(r2.stream_id)
    const rows = await readEventLog(storage, { tenant_id: T })
    expect(rows).toHaveLength(2)
  })

  it('canon · canon-canonical-same external_id but different logical_period → new stream', async () => {
    const storage = new InMemoryEventLogStorage()
    const r1 = await dispatchSalaTrigger(
      baseInput({ logical_period: '2026-W23' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    const r2 = await dispatchSalaTrigger(
      baseInput({ logical_period: '2026-W24' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(r1.stream_id).not.toEqual(r2.stream_id)
    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(true)
  })
})

describe('Track Q · canon canonical · safety enforcement at dispatch level', () => {
  it('canon · canon-canonical-master flag OFF · refused · NO append', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({
        storage,
        safety_override: { shadow_flag: 'false', real_sources_flag: 'true' },
      }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/flag_disabled/)
    expect(result.inserted).toBeNull()
    const rows = await readEventLog(storage, { tenant_id: T })
    expect(rows).toHaveLength(0)
  })

  it('canon · canon-canonical-real-webhook · sub-gate OFF · refused', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ source: 'webhook_onboarding_form' }),
      buildInMemoryDispatchConfig({
        storage,
        safety_override: { shadow_flag: 'true', real_sources_flag: 'false' },
      }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/real_source_blocked/)
    const rows = await readEventLog(storage, { tenant_id: T })
    expect(rows).toHaveLength(0)
  })

  it('canon · canon-canonical-real-webhook · sub-gate ON · flows through', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ source: 'webhook_onboarding_form' }),
      buildInMemoryDispatchConfig({
        storage,
        safety_override: { shadow_flag: 'true', real_sources_flag: 'true' },
      }),
    )
    expect(result.mode).toBe('shadow')
    expect(result.inserted).toBe(true)
  })

  it('canon · canon-canonical-cron-scan · sub-gate OFF · still allowed (canon-master gate suffices)', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ source: 'cron_new_clients_scan' }),
      buildInMemoryDispatchConfig({
        storage,
        safety_override: { shadow_flag: 'true', real_sources_flag: 'false' },
      }),
    )
    expect(result.mode).toBe('shadow')
    expect(result.inserted).toBe(true)
  })
})

describe('Track Q · canon canonical · input validation', () => {
  it('canon · canon-canonical-missing tenant_id → refused', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ tenant_id: '' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/validation_error/)
  })

  it('canon · canon-canonical-missing external_id → refused', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ external_id: '' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/validation_error/)
  })

  it('canon · canon-canonical-unsupported journey (Track Q ships ONBOARD only) → refused', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ journey_type: 'PRODUCE' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/source_not_supported/)
  })

  it('canon · canon-canonical-unknown journey → libreto_not_found', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ journey_type: 'NOPE_MADE_UP' as unknown as SalaTriggerInput['journey_type'] }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(result.mode).toBe('refused')
    expect(result.refused_reason).toMatch(/libreto_not_found/)
  })
})

describe('Track Q · canon canonical · log shape · PR #154 compatible', () => {
  it('canon · canon-canonical-ShadowDecisionLog parity · canon-canon-pre #154 merge', async () => {
    const storage = new InMemoryEventLogStorage()
    const captured = createInMemorySalaTriggerLogger()
    await dispatchSalaTrigger(
      baseInput(),
      buildInMemoryDispatchConfig({ storage, logger: captured.logger }),
    )
    expect(captured.entries.length).toBeGreaterThan(0)
    const entry = captured.entries[0]
    // canon · canon-canon-required keys from PR #154 ShadowDecisionLog
    expect(entry).toMatchObject({
      canon: 'sala-shadow-router',
      mode: 'shadow',
      logged_at: expect.any(String) as unknown,
      trigger_event_id: expect.any(String) as unknown,
      trigger_event_type: expect.any(String) as unknown,
      stream_id: expect.any(String) as unknown,
      correlation_id: expect.any(String) as unknown,
      tenant_id: T,
      client_id: C,
      journey_type: 'ONBOARD',
      decision_index: 0,
      decision_count: expect.any(Number) as unknown,
    })
    expect(['dispatch', 'gate_pending', 'terminal', 'needs_judgment', 'budget_blocked']).toContain(
      entry.decision_kind,
    )
  })
})

describe('Track Q · canon canonical · trigger payload preserves source + external_id', () => {
  it('canon · canon-canonical-event payload includes __sala_trigger metadata', async () => {
    const storage = new InMemoryEventLogStorage()
    const result = await dispatchSalaTrigger(
      baseInput({ external_id: 'tally-XYZ-789', source: 'synthetic' }),
      buildInMemoryDispatchConfig({ storage }),
    )
    expect(result.trigger_event).not.toBeNull()
    const payload = result.trigger_event!.payload as Record<string, unknown>
    expect(payload.__sala_trigger).toMatchObject({
      canon: 'sala-trigger-v1',
      source: 'synthetic',
      external_id: 'tally-XYZ-789',
      mode: 'shadow',
    })
    // canon · canon-canon-user payload preserved
    expect(payload.company_name).toBe('Smoke Test Co')
  })
})

afterEach(() => {
  // canon · canon-canon-no global state to reset
})
