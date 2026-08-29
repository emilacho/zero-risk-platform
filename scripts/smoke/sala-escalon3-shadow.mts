/**
 * Canon canonical · escalón 3 · shadow-handler runnable smoke.
 *
 * Spec · `ENCENDIDO-escalon-3-router-2026-06-04.md`.
 *
 * Runs 5 synthetic scenarios + a parked-gate sentinel through the
 * shadow handler and prints the structured logs to stdout · canon §148
 * evidence-grade. Used to attach evidence to PRs + the §144 RESULTS doc.
 *
 * Execute via · `pnpm exec tsx scripts/smoke/sala-escalon3-shadow.mts`
 * (no DB · cero side-effect · in-memory storage).
 */
import { randomUUID } from 'node:crypto'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
  type EventLogStorage,
  type PersistedEvent,
} from '../../src/lib/sala-event-log'
import type { Libreto, JourneyType } from '../../src/lib/sala/libretos'
import {
  processSalaEventShadow,
  interpreterStub,
  denyByKeyBudgetStub,
  consoleShadowLogger,
  type LibretoLookup,
} from '../../src/lib/sala-router'

const TENANT = 'tenant-cc3-escalon3-smoke'
const CLIENT = 'client-cc3-escalon3-smoke'

const SYNTH_ONBOARD: Libreto = {
  journey_type: 'ONBOARD',
  version: 1,
  description: 'shadow smoke onboard · 4-step · gate + terminal',
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

const LOOKUP: LibretoLookup = (jt) =>
  jt === 'ONBOARD' ? SYNTH_ONBOARD : undefined

async function inj(
  storage: EventLogStorage,
  stream_id: string,
  o: Partial<EventAppendInput> = {},
): Promise<PersistedEvent> {
  const op = o.operation_type ?? 'ONBOARD.step-1'
  const period = o.logical_period ?? stream_id
  const correlation_id = o.correlation_id ?? randomUUID()
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
    ...o,
  }
  const r = await append(storage, input)
  return r.event
}

async function run() {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      canon: 'sala-escalon3-smoke',
      mode: 'shadow',
      started_at: new Date().toISOString(),
      tenant_id: TENANT,
      client_id: CLIENT,
      message:
        'CC#3 escalón 3 shadow handler synthetic smoke · §148 evidence run',
    }),
  )

  // ── Scenario 1 · dispatch ───────────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-dispatch-${randomUUID().slice(0, 8)}`
    await inj(storage, s, { event_type: 'dispatch_requested', step_id: 'step-1' })
    const trig = await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: consoleShadowLogger,
    })
  }

  // ── Scenario 2 · gate_pending ───────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-gate-${randomUUID().slice(0, 8)}`
    await inj(storage, s, { event_type: 'dispatch_requested', step_id: 'step-1' })
    await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await inj(storage, s, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    const trig = await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: consoleShadowLogger,
    })
  }

  // ── Scenario 3 · terminal (gate resolved → terminal_success) ────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-terminal-${randomUUID().slice(0, 8)}`
    await inj(storage, s, { event_type: 'dispatch_requested', step_id: 'step-1' })
    await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await inj(storage, s, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })
    await inj(storage, s, {
      event_type: 'gate_pending',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate',
    })
    const trig = await inj(storage, s, {
      event_type: 'gate_resolved',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate.resolved',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: consoleShadowLogger,
    })
  }

  // ── Scenario 4 · needs_judgment ────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-judge-${randomUUID().slice(0, 8)}`
    const trig = await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      journey_type: 'UNKNOWN_JOURNEY_X',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: consoleShadowLogger,
    })
  }

  // ── Scenario 5 · budget_blocked ────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-budget-${randomUUID().slice(0, 8)}`
    await inj(storage, s, { event_type: 'dispatch_requested', step_id: 'step-1' })
    const trig = await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      budget_check: denyByKeyBudgetStub([
        `${CLIENT}::ONBOARD::ONBOARD.step-2`,
      ]),
      logger: consoleShadowLogger,
    })
  }

  // ── Scenario 6 · parked sentinel ───────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const s = `stream-parked-${randomUUID().slice(0, 8)}`
    await inj(storage, s, { event_type: 'dispatch_requested', step_id: 'step-1' })
    await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-1',
      step_state: 'done',
    })
    await inj(storage, s, {
      event_type: 'dispatch_requested',
      step_id: 'step-2',
      operation_type: 'ONBOARD.step-2',
    })
    await inj(storage, s, {
      event_type: 'step_completed',
      step_id: 'step-2',
      step_state: 'done',
      operation_type: 'ONBOARD.step-2',
    })
    await inj(storage, s, {
      event_type: 'gate_pending',
      step_id: 'gate-camino',
      gate_type: 'camino_iii',
      operation_type: 'ONBOARD.gate-camino.gate',
    })
    const trig = await inj(storage, s, {
      event_type: 'step_started',
      step_id: 'gate-camino',
      step_state: 'running',
      operation_type: 'ONBOARD.gate-camino.started',
    })
    await processSalaEventShadow(trig, {
      storage,
      libreto_lookup: LOOKUP,
      resolve_next_step: interpreterStub,
      logger: consoleShadowLogger,
    })
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      canon: 'sala-escalon3-smoke',
      mode: 'shadow',
      finished_at: new Date().toISOString(),
      message:
        '6 scenarios complete · 5 Decision kinds + parked sentinel · §148 evidence captured',
    }),
  )
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ canon: 'sala-escalon3-smoke', error: String(err) }))
  process.exit(1)
})
