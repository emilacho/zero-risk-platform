/**
 * Canon canonical · escalón 3 · shadow-handler synthetic verification.
 *
 * Verifies the wiring: event → readJourneyState → libreto_lookup →
 * decide → LOG. Covers the 5 Decision kinds + the "parked" sentinel
 * (empty Decision[]) via deterministic synthetic events.
 *
 * §148 honest · the tests assert on the logged entries to prove the
 * structured log is what the Vercel function dashboard will see in
 * production. No console output is asserted (the logger is injected
 * via createInMemoryShadowLogger).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
  type EventLogStorage,
  type EventType,
  type PersistedEvent,
} from '../src/lib/sala-event-log'
import {
  CANONICAL_LIBRETOS,
  type Libreto,
  type JourneyType,
} from '../src/lib/sala/libretos'
import {
  processSalaEventShadow,
  createInMemoryShadowLogger,
  interpreterStub,
  denyByKeyBudgetStub,
  type LibretoLookup,
} from '../src/lib/sala-router'

// =====================================================================
// Synthetic constants
// =====================================================================

const TENANT = 'tenant-cc3-escalon3'
const CLIENT = 'client-cc3-escalon3'

function syntheticStream(): string {
  return `stream-cc3-escalon3-${randomUUID().slice(0, 8)}`
}

// =====================================================================
// Synthetic libreto fixtures · canon canon § escalón 3 sintéticos
// =====================================================================

// A 3-step libreto with action → gate → terminal · covers dispatch +
// gate_pending + terminal in a single journey
const SYNTH_ONBOARD: Libreto = {
  journey_type: 'ONBOARD',
  version: 1,
  description: 'synthetic onboard for escalón 3 shadow verification',
  entry_step_id: 'step-1',
  steps: [
    {
      step_id: 'step-1',
      step_type: 'action',
      agent_id: 'brand-strategist',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 60000,
        on_exhausted: 'terminal_failure',
      },
      next_step: { kind: 'static', step_id: 'step-2' },
    },
    {
      step_id: 'step-2',
      step_type: 'action',
      agent_id: 'creative-director',
      retry_budget: {
        max_attempts: 3,
        initial_backoff_ms: 1000,
        max_backoff_ms: 60000,
        on_exhausted: 'terminal_failure',
      },
      next_step: { kind: 'static', step_id: 'gate-camino' },
    },
    {
      step_id: 'gate-camino',
      step_type: 'gate_camino_iii',
      gate_config: { panel: ['reviewer-1'] } as never,
      next_step: { kind: 'static', step_id: 'end-ok' },
    },
    { step_id: 'end-ok', step_type: 'terminal_success' },
  ],
  metadata: { status: 'shadow' },
}

const LOOKUP: LibretoLookup = (jt) => {
  if (jt === 'ONBOARD') return SYNTH_ONBOARD
  return undefined
}

// =====================================================================
// Event builders · canonical injector
// =====================================================================

async function injectEvent(
  storage: EventLogStorage,
  stream_id: string,
  overrides: Partial<EventAppendInput> = {},
): Promise<PersistedEvent> {
  const correlation_id = overrides.correlation_id ?? randomUUID()
  const op = overrides.operation_type ?? 'ONBOARD.step-1'
  const period = overrides.logical_period ?? stream_id
  const input: EventAppendInput = {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id,
    correlation_id,
    event_type: 'dispatch_requested',
    journey_type: 'ONBOARD',
    operation_type: op,
    logical_period: period,
    idempotency_key: buildIdempotencyKey({
      operation_type: op,
      client_id: CLIENT,
      logical_period: period,
    }),
    payload: {},
    ...overrides,
  }
  const r = await append(storage, input)
  return r.event
}

// =====================================================================
// 5 synthetic scenarios · the spec calls for these decision kinds
// =====================================================================

describe('escalón 3 · shadow handler · synthetic verification', () => {
  let storage: EventLogStorage

  beforeEach(() => {
    storage = new InMemoryEventLogStorage()
  })

  it('🟢 dispatch · step-1 completed → router decides next action (step-2)', async () => {
    const stream = syntheticStream()

    // Seed history: step-1 was dispatched + completed
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_started',
      step_id: 'step-1',
      step_state: 'running',
    })
    const trigger = await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: inMemLogger.logger,
    })

    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].kind).toBe('dispatch')
    const d = result.decisions[0]
    if (d.kind !== 'dispatch') throw new Error('narrow')
    expect(d.step_id).toBe('step-2')
    expect(d.agent_id).toBe('creative-director')
    expect(d.idempotency_key).toBeTruthy()
    expect(d.libreto_version).toBe(1)

    // Structured log canon canónica
    const logs = inMemLogger.entries()
    expect(logs).toHaveLength(1)
    expect(logs[0].canon).toBe('sala-shadow-router')
    expect(logs[0].mode).toBe('shadow')
    expect(logs[0].decision_kind).toBe('dispatch')
    expect(logs[0].stream_id).toBe(stream)
    expect(logs[0].trigger_event_id).toBe(trigger.event_id)
  })

  it('🟡 gate_pending · step-2 completed → router emits gate_pending for camino_iii', async () => {
    const stream = syntheticStream()
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    const trigger = await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: inMemLogger.logger,
    })

    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].kind).toBe('gate_pending')
    const d = result.decisions[0]
    if (d.kind !== 'gate_pending') throw new Error('narrow')
    expect(d.gate_type).toBe('camino_iii')
    expect(d.step_id).toBe('gate-camino')

    const logs = inMemLogger.entries()
    expect(logs).toHaveLength(1)
    expect(logs[0].decision_kind).toBe('gate_pending')
    expect(logs[0].journey_state_current_step).toBe('step-2')
  })

  it('🟢 terminal · gate resolved → next step is terminal_success', async () => {
    const stream = syntheticStream()
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })
    await injectEvent(storage, stream, {
      event_type: 'gate_pending',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate',
    })
    const trigger = await injectEvent(storage, stream, {
      event_type: 'gate_resolved',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate.resolved',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: inMemLogger.logger,
    })

    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].kind).toBe('terminal')
    const d = result.decisions[0]
    if (d.kind !== 'terminal') throw new Error('narrow')
    expect(d.outcome).toBe('success')
    expect(d.step_id).toBe('end-ok')

    const logs = inMemLogger.entries()
    expect(logs[0].decision_kind).toBe('terminal')
  })

  it('🟠 needs_judgment · unknown journey_type → off-script handler', async () => {
    const stream = syntheticStream()
    const trigger = await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      journey_type: 'UNKNOWN_JOURNEY_X',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: inMemLogger.logger,
    })

    expect(result.decisions[0].kind).toBe('needs_judgment')
    const d = result.decisions[0]
    if (d.kind !== 'needs_judgment') throw new Error('narrow')
    expect(d.reason).toBe('libreto_not_found')

    const logs = inMemLogger.entries()
    expect(logs[0].decision_kind).toBe('needs_judgment')
  })

  it('🔴 budget_blocked · denyByKey stub blocks step-2 dispatch', async () => {
    const stream = syntheticStream()
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    const trigger = await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      budget_check: denyByKeyBudgetStub([
        `${CLIENT}::ONBOARD::ONBOARD.step-2`,
      ]),
      logger: inMemLogger.logger,
    })

    expect(result.decisions[0].kind).toBe('budget_blocked')
    const d = result.decisions[0]
    if (d.kind !== 'budget_blocked') throw new Error('narrow')
    expect(d.step_id).toBe('step-2')
    expect(d.budget_key).toBe(`${CLIENT}::ONBOARD::ONBOARD.step-2`)

    const logs = inMemLogger.entries()
    expect(logs[0].decision_kind).toBe('budget_blocked')
  })

  it('🟡 parked · gate already pending → empty Decision[] + sentinel log', async () => {
    const stream = syntheticStream()
    // Seed history through dispatch + completion + gate_pending
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    await injectEvent(storage, stream, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })
    await injectEvent(storage, stream, {
      event_type: 'gate_pending',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate',
    })

    // A spurious step_started while gate is pending should park
    const trigger = await injectEvent(storage, stream, {
      event_type: 'step_started',
      step_id: 'gate-camino',
      step_state: 'running',
      operation_type: 'ONBOARD.gate-camino.started',
    })

    const inMemLogger = createInMemoryShadowLogger()
    const result = await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: inMemLogger.logger,
    })

    expect(result.decisions).toHaveLength(0)
    const logs = inMemLogger.entries()
    expect(logs).toHaveLength(1)
    expect(logs[0].decision_kind).toBe('parked')
    expect(logs[0].decision_count).toBe(0)
  })
})

describe('escalón 3 · shadow handler · structured log shape', () => {
  it('log entry includes the canon marker + mode=shadow + every key', async () => {
    const storage = new InMemoryEventLogStorage()
    const stream = syntheticStream()
    const trigger = await injectEvent(storage, stream, {
      event_type: 'dispatch_requested',
      step_id: 'step-1',
    })
    const logger = createInMemoryShadowLogger()
    await processSalaEventShadow(trigger, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: logger.logger,
    })
    const entry = logger.entries()[0]
    expect(entry.canon).toBe('sala-shadow-router')
    expect(entry.mode).toBe('shadow')
    expect(entry.trigger_event_id).toBeTruthy()
    expect(entry.stream_id).toBe(stream)
    expect(entry.tenant_id).toBe(TENANT)
    expect(entry.client_id).toBe(CLIENT)
    expect(entry.decision_kind).toBeTruthy()
    expect(entry.decision).toBeTruthy()
    expect(typeof entry.decision_index).toBe('number')
    expect(typeof entry.decision_count).toBe('number')
    expect(entry.logged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
