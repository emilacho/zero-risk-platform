/**
 * Canon canonical · Track H router · `decide` tests.
 *
 * Coverage targets (per spec §5):
 *   1. Happy path · `step_completed` → next action dispatch (with budget OK)
 *   2. Function TOTAL · unknown journey → `needs_judgment`
 *   3. Function TOTAL · libreto found but pending §144 → `needs_judgment`
 *   4. Budget exceeded → `budget_blocked` (no dispatch)
 *   5. Gate step → `gate_pending` (and parks until resolved)
 *   6. NEXUS stress · multi-step state machine through several events
 *   7. Stream mismatch sanity → `needs_judgment`
 *   8. Terminal step → `terminal` decision
 */

import { describe, it, expect } from 'vitest'
import {
  decide,
  interpreterStub,
  allowAllBudgetStub,
  denyByKeyBudgetStub,
} from '../src/lib/sala-router'
import type {
  DecideInput,
  LibretoLookup,
  Decision,
} from '../src/lib/sala-router'
import type { PersistedEvent } from '../src/lib/sala-event-log'
import type { JourneyState } from '../src/lib/sala-journey-state'
import type {
  Libreto,
  JourneyType,
  Step,
  ActionStep,
  GateStep,
  TerminalStep,
} from '../src/lib/sala/libretos'

// =====================================================================
// Builders for deterministic fixtures
// =====================================================================

const TENANT = 'tenant-test-001'
const CLIENT = 'client-test-001'
const STREAM = 'stream-test-001'
const CORRELATION = 'corr-test-001'

function action(step_id: string, agent_id: string, next: string): ActionStep {
  return {
    step_id,
    step_type: 'action',
    agent_id,
    retry_budget: {
      max_attempts: 3,
      initial_backoff_ms: 1000,
      max_backoff_ms: 60000,
      on_exhausted: 'terminal_failure',
    },
    next_step: { kind: 'static', step_id: next },
  }
}

function gate(
  step_id: string,
  type: 'gate_camino_iii' | 'gate_hitl' | 'gate_144',
  next: string,
): GateStep {
  return {
    step_id,
    step_type: type,
    gate_config: { panel: ['reviewer-1'] } as never,
    next_step: { kind: 'static', step_id: next },
  }
}

function terminal(step_id: string, ok: boolean): TerminalStep {
  return {
    step_id,
    step_type: ok ? 'terminal_success' : 'terminal_failure',
  }
}

function buildLibreto(
  journey_type: JourneyType,
  steps: Step[],
  entry: string,
  status: Libreto['metadata']['status'] = 'ready',
): Libreto {
  return {
    journey_type,
    version: 1,
    description: `test libreto ${journey_type}`,
    entry_step_id: entry,
    steps,
    metadata: { status },
  }
}

function buildEvent(overrides: Partial<PersistedEvent> = {}): PersistedEvent {
  return {
    event_id: 'evt-test-001',
    sequence: 1,
    occurred_at: '2026-06-04T10:00:00.000Z',
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id: STREAM,
    correlation_id: CORRELATION,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: 'ONBOARD.step-1',
    idempotency_key: 'key-evt-001',
    logical_period: STREAM,
    input_hash: null,
    workflow_run_id: null,
    step_id: 'step-1',
    step_state: 'done',
    attempt: 1,
    payload: {},
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-04T10:00:00.000Z',
    ...overrides,
  } as PersistedEvent
}

function buildJourneyState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    stream_id: STREAM,
    tenant_id: TENANT,
    journey: 'ONBOARD',
    client_id: CLIENT,
    current_step: 'step-1',
    current_step_state: 'done',
    status: 'step_done',
    pending_gates: [],
    pending_judgments: [],
    budget_blocked_count: 0,
    current_step_attempt: 1,
    correlation_id: CORRELATION,
    last_event_id: 'evt-test-001',
    last_event_at: '2026-06-04T10:00:00.000Z',
    libreto_version: 1,
    ...overrides,
  } as JourneyState
}

function makeLookup(libretos: Libreto[]): LibretoLookup {
  const map = new Map(libretos.map((l) => [l.journey_type, l]))
  return (journey_type: string) => map.get(journey_type as JourneyType)
}

function baseInput(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    event: buildEvent(),
    journey_state: buildJourneyState(),
    libreto_lookup: makeLookup([]),
    resolve_next_step: interpreterStub,
    budget_check: allowAllBudgetStub,
    ...overrides,
  }
}

// =====================================================================
// Tests
// =====================================================================

describe('decide · happy path · dispatch next action', () => {
  it('emits Dispatch when libreto + interpreter + budget all green', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [
        action('step-1', 'brand-strategist', 'step-2'),
        action('step-2', 'creative-director', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const decisions = decide(
      baseInput({ libreto_lookup: makeLookup([libreto]) }),
    )

    expect(decisions).toHaveLength(1)
    const d = decisions[0]
    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') throw new Error('type narrow')
    expect(d.step_id).toBe('step-2')
    expect(d.agent_id).toBe('creative-director')
    expect(d.libreto_version).toBe(1)
    expect(d.idempotency_key).toBeTruthy()
    expect(d.idempotency_inputs.operation_type).toBe('ONBOARD.step-2')
    expect(d.idempotency_inputs.client_id).toBe(CLIENT)
    expect(d.caused_by_event_id).toBe('evt-test-001')
  })
})

describe('decide · function TOTAL · cero drop silente', () => {
  it('unknown journey_type → needs_judgment (libreto_not_found)', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'UNKNOWN_X' }),
        libreto_lookup: makeLookup([]),
      }),
    )
    expect(decisions).toHaveLength(1)
    expect(decisions[0].kind).toBe('needs_judgment')
    if (decisions[0].kind !== 'needs_judgment') throw new Error('narrow')
    expect(decisions[0].reason).toBe('libreto_not_found')
  })

  it('libreto pending_144 → needs_judgment (libreto_pending_144)', () => {
    const libreto = buildLibreto(
      'GROWTH',
      [action('step-1', 'agent-x', 'end-ok'), terminal('end-ok', true)],
      'step-1',
      'pending_144',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'GROWTH' }),
        journey_state: buildJourneyState({ journey: 'GROWTH' }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('needs_judgment')
    if (decisions[0].kind !== 'needs_judgment') throw new Error('narrow')
    expect(decisions[0].reason).toBe('libreto_pending_144')
  })

  it('current_step missing from libreto → needs_judgment', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [action('step-A', 'agent-x', 'end-ok'), terminal('end-ok', true)],
      'step-A',
    )
    const decisions = decide(
      baseInput({
        journey_state: buildJourneyState({ current_step: 'step-ghost' }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('needs_judgment')
    if (decisions[0].kind !== 'needs_judgment') throw new Error('narrow')
    expect(decisions[0].reason).toBe('current_step_not_in_libreto')
  })

  it('stream mismatch between event and projection → needs_judgment', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({ stream_id: 'stream-other' }),
      }),
    )
    expect(decisions[0].kind).toBe('needs_judgment')
  })
})

describe('decide · budget-check (G6 paso 3.5)', () => {
  it('budget denied → budget_blocked (no dispatch)', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [
        action('step-1', 'brand-strategist', 'step-2'),
        action('step-2', 'creative-director', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const deny = denyByKeyBudgetStub([
      `${CLIENT}::ONBOARD::ONBOARD.step-2`,
    ])
    const decisions = decide(
      baseInput({
        libreto_lookup: makeLookup([libreto]),
        budget_check: deny,
      }),
    )
    expect(decisions).toHaveLength(1)
    expect(decisions[0].kind).toBe('budget_blocked')
    if (decisions[0].kind !== 'budget_blocked') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('step-2')
    expect(decisions[0].budget_key).toBe(`${CLIENT}::ONBOARD::ONBOARD.step-2`)
    expect(decisions[0].reason).toBeTruthy()
  })

  it('budget allowed → dispatch (control case for the deny stub)', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [
        action('step-1', 'brand-strategist', 'step-2'),
        action('step-2', 'creative-director', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const deny = denyByKeyBudgetStub(['other-key'])
    const decisions = decide(
      baseInput({
        libreto_lookup: makeLookup([libreto]),
        budget_check: deny,
      }),
    )
    expect(decisions[0].kind).toBe('dispatch')
  })
})

describe('decide · gates as first-class steps', () => {
  it('next step is a gate → gate_pending', () => {
    const libreto = buildLibreto(
      'PRODUCE',
      [
        action('step-1', 'brand-strategist', 'gate-camino'),
        gate('gate-camino', 'gate_camino_iii', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'PRODUCE' }),
        journey_state: buildJourneyState({ journey: 'PRODUCE' }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions).toHaveLength(1)
    expect(decisions[0].kind).toBe('gate_pending')
    if (decisions[0].kind !== 'gate_pending') throw new Error('narrow')
    expect(decisions[0].gate_type).toBe('camino_iii')
    expect(decisions[0].step_id).toBe('gate-camino')
  })

  it('gate already pending → no new decision (branch parked)', () => {
    const libreto = buildLibreto(
      'PRODUCE',
      [
        gate('gate-hitl', 'gate_hitl', 'end-ok'),
        terminal('end-ok', true),
      ],
      'gate-hitl',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'PRODUCE', step_id: null, event_type: 'step_started' }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'gate-hitl',
          status: 'awaiting_gate',
          pending_gates: [
            {
              event_id: 'evt-gate-001',
              opened_at: '2026-06-04T09:00:00.000Z',
              gate_type: 'hitl',
              step_id: 'gate-hitl',
            } as never,
          ],
        }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions).toHaveLength(0)
  })

  it('gate_resolved while gate pending → progresses past gate', () => {
    const libreto = buildLibreto(
      'PRODUCE',
      [
        gate('gate-camino', 'gate_camino_iii', 'final-step'),
        action('final-step', 'qa-agent', 'end-ok'),
        terminal('end-ok', true),
      ],
      'gate-camino',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({
          journey_type: 'PRODUCE',
          event_type: 'gate_resolved',
          gate_type: 'camino_iii' as never,
          step_id: 'gate-camino',
        }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'gate-camino',
          pending_gates: [],
          status: 'running',
        }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('dispatch')
    if (decisions[0].kind !== 'dispatch') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('final-step')
    expect(decisions[0].agent_id).toBe('qa-agent')
  })
})

describe('decide · terminal handling', () => {
  it('current step is terminal_success → terminal decision', () => {
    const libreto = buildLibreto(
      'REVIEW',
      [terminal('end-ok', true)],
      'end-ok',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'REVIEW', step_id: 'end-ok' }),
        journey_state: buildJourneyState({
          journey: 'REVIEW',
          current_step: 'end-ok',
        }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('terminal')
    if (decisions[0].kind !== 'terminal') throw new Error('narrow')
    expect(decisions[0].outcome).toBe('success')
  })

  it('next step is terminal_failure → terminal failure decision', () => {
    const libreto = buildLibreto(
      'REVIEW',
      [action('step-1', 'agent-x', 'end-fail'), terminal('end-fail', false)],
      'step-1',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({ journey_type: 'REVIEW' }),
        journey_state: buildJourneyState({ journey: 'REVIEW' }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('terminal')
    if (decisions[0].kind !== 'terminal') throw new Error('narrow')
    expect(decisions[0].outcome).toBe('failure')
  })
})

describe('decide · NEXUS stress · multi-phase state machine', () => {
  /**
   * NEXUS canon · 7-phase orchestrator with validation gates.
   * Models phase-by-phase progression with Camino III gate between
   * production + approval (the realistic critical-creative gate).
   *
   * This is a stress-test of the most complex libreto shape per
   * Opus ronda 1 §4 "El interpreter evalúa NEXUS = stress-test".
   */
  const NEXUS: Libreto = buildLibreto(
    'PRODUCE',
    [
      action('intake', 'jefe-marketing', 'strategy'),
      action('strategy', 'data-strategist', 'brief'),
      action('brief', 'brand-strategist', 'creative'),
      action('creative', 'creative-director', 'production'),
      action('production', 'campaign-brief-agent', 'camino-iii-gate'),
      gate('camino-iii-gate', 'gate_camino_iii', 'launch'),
      action('launch', 'campaign-launch', 'measure'),
      action('measure', 'analytics-agent', 'optimize-tac'),
      gate('optimize-tac', 'gate_hitl', 'end-ok'),
      terminal('end-ok', true),
    ],
    'intake',
  )

  it('phase 1 → phase 2 (intake done → dispatch strategy)', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({
          journey_type: 'PRODUCE',
          step_id: 'intake',
          event_type: 'step_completed',
        }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'intake',
        }),
        libreto_lookup: makeLookup([NEXUS]),
      }),
    )
    expect(decisions[0].kind).toBe('dispatch')
    if (decisions[0].kind !== 'dispatch') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('strategy')
    expect(decisions[0].agent_id).toBe('data-strategist')
  })

  it('production done → camino-iii-gate (gate_pending)', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({
          journey_type: 'PRODUCE',
          step_id: 'production',
          event_type: 'step_completed',
        }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'production',
        }),
        libreto_lookup: makeLookup([NEXUS]),
      }),
    )
    expect(decisions[0].kind).toBe('gate_pending')
    if (decisions[0].kind !== 'gate_pending') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('camino-iii-gate')
    expect(decisions[0].gate_type).toBe('camino_iii')
  })

  it('camino_iii resolved → dispatch launch', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({
          journey_type: 'PRODUCE',
          event_type: 'gate_resolved',
          gate_type: 'camino_iii' as never,
          step_id: 'camino-iii-gate',
        }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'camino-iii-gate',
          pending_gates: [],
        }),
        libreto_lookup: makeLookup([NEXUS]),
      }),
    )
    expect(decisions[0].kind).toBe('dispatch')
    if (decisions[0].kind !== 'dispatch') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('launch')
    expect(decisions[0].agent_id).toBe('campaign-launch')
  })

  it('NEXUS over-budget on launch → budget_blocked (cap enforcement)', () => {
    const decisions = decide(
      baseInput({
        event: buildEvent({
          journey_type: 'PRODUCE',
          event_type: 'gate_resolved',
          step_id: 'camino-iii-gate',
        }),
        journey_state: buildJourneyState({
          journey: 'PRODUCE',
          current_step: 'camino-iii-gate',
          pending_gates: [],
        }),
        libreto_lookup: makeLookup([NEXUS]),
        budget_check: denyByKeyBudgetStub([
          `${CLIENT}::PRODUCE::PRODUCE.launch`,
        ]),
      }),
    )
    expect(decisions[0].kind).toBe('budget_blocked')
    if (decisions[0].kind !== 'budget_blocked') throw new Error('narrow')
    expect(decisions[0].step_id).toBe('launch')
  })
})

describe('decide · attempt counter on retry', () => {
  it('same step retry → attempt + 1', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [
        action('step-1', 'agent-x', 'step-2'),
        action('step-2', 'agent-y', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const decisions = decide(
      baseInput({
        event: buildEvent({
          event_type: 'step_failed',
          step_id: 'step-1',
        }),
        journey_state: buildJourneyState({
          current_step: 'step-1',
          current_step_attempt: 2,
        }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    expect(decisions[0].kind).toBe('dispatch')
    if (decisions[0].kind !== 'dispatch') throw new Error('narrow')
    // Next step is step-2 (interpreter advanced from step-1) · NOT a retry
    // of the same step. First-time dispatch of step-2 = attempt 1.
    expect(decisions[0].step_id).toBe('step-2')
    expect(decisions[0].attempt).toBe(1)
  })
})

describe('decide · idempotency key computation', () => {
  it('same {operation_type, client_id, logical_period} → same key', () => {
    const libreto = buildLibreto(
      'ONBOARD',
      [
        action('step-1', 'a', 'step-2'),
        action('step-2', 'b', 'end-ok'),
        terminal('end-ok', true),
      ],
      'step-1',
    )
    const d1 = decide(
      baseInput({ libreto_lookup: makeLookup([libreto]) }),
    )
    const d2 = decide(
      baseInput({
        event: buildEvent({ event_id: 'evt-different-id' }),
        libreto_lookup: makeLookup([libreto]),
      }),
    )
    const k1 = (d1[0] as Decision & { kind: 'dispatch' }).idempotency_key
    const k2 = (d2[0] as Decision & { kind: 'dispatch' }).idempotency_key
    expect(k1).toBe(k2)
  })
})
