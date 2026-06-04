/**
 * NEXUS stress-test · Sprint 12 Fase 0 Ronda 3 Track G.
 *
 * The PRODUCE libreto encodes the NEXUS 7-Phase state machine (CC#3
 * §4 archaeology · pattern 5 phase loop + pattern 4 HITL escalation
 * cascade + pattern 6 DLQ insert). Per dispatch · "expressing NEXUS =
 * the most complex" · this file walks the libreto end-to-end with
 * the interpreter primitives the router (Track H) will compose,
 * proving every transition resolves correctly.
 *
 * Two complete walks ·
 * (1) Happy path · every phase validates · ends at §144 approval +
 *     campaign_ready.
 * (2) Rejection loop · phase 4 validation rejected · loops back to
 *     phase_4_content · proves the `next_step_rejected` re-entry
 *     works (pattern 4 retry budget cascade).
 *
 * Plus integrity checks · every conditional predicate name across
 * the 6 canonical libretos resolves in the canonical registry.
 */
import { describe, it, expect } from 'vitest'
import {
  collectPredicateNames,
  evaluateValidationRules,
  getStep,
  resolveAction,
  resolveGateInvocation,
  resolveGateOutcome,
  resolveNextStepRef,
  resolveStep,
  verifyPredicatesRegistered,
} from '../src/lib/sala/interpreter/interpreter'
import { canonicalPredicateRegistry } from '../src/lib/sala/interpreter/predicates'
import { CANONICAL_LIBRETOS } from '../src/lib/sala/libretos/registry'
import type {
  InterpreterBlackboard,
  PredicateContext,
} from '../src/lib/sala/interpreter/types'

// ─── Helpers ───────────────────────────────────────────────────────

function emptyCtx(): PredicateContext {
  const bb: InterpreterBlackboard = {
    read: () => undefined,
    has: () => false,
  }
  return {
    event: { event_type: 'walk', client_id: 'client-test', payload: {} },
    blackboard: bb,
  }
}

// ─── PRODUCE (NEXUS) walk · happy path ────────────────────────────

describe('NEXUS · PRODUCE libreto · happy path walk', () => {
  const produce = CANONICAL_LIBRETOS.PRODUCE
  const ctx = emptyCtx()

  it('starts at phase_1_strategy', () => {
    expect(produce.entry_step_id).toBe('phase_1_strategy')
  })

  it('walks 7 phases · each phase dispatches jefe-marketing + Camino III validates · approval transitions to next', () => {
    const phaseIds = [
      'phase_1_strategy',
      'phase_2_research',
      'phase_3_creative',
      'phase_4_content',
      'phase_5_assets',
      'phase_6_distribution',
    ]
    for (let i = 0; i < phaseIds.length; i++) {
      const phase = getStep(produce, phaseIds[i]!)
      expect(phase).toBeDefined()
      expect(phase!.step_type).toBe('action')
      const a = resolveAction(phase as Parameters<typeof resolveAction>[0])
      expect(a.kind).toBe('dispatch')
      if (a.kind !== 'dispatch') throw new Error('unreachable')
      expect(a.agent_id).toBe('jefe-marketing')
      // After the phase the libreto routes to validate_phase_N (gate).
      expect(a.next_step.kind).toBe('static')
      const validateId =
        a.next_step.kind === 'static' ? a.next_step.step_id : ''
      expect(validateId).toMatch(/^validate_phase_/)

      // Resolve the validation gate · approve → next phase.
      const gateStep = getStep(produce, validateId)!
      expect(gateStep.step_type).toBe('gate_camino_iii')
      const approvedOutcome = resolveGateOutcome(
        gateStep as Parameters<typeof resolveGateOutcome>[0],
        true,
        ctx,
      )
      expect(approvedOutcome.ok).toBe(true)
      if (!approvedOutcome.ok) throw new Error('unreachable')
      const nextPhaseExpected =
        i < phaseIds.length - 1 ? phaseIds[i + 1]! : 'phase_7_launch_brief'
      expect(approvedOutcome.next_step_id).toBe(nextPhaseExpected)
    }
  })

  it('phase 7 dispatches campaign-brief-agent · ends at §144 approval gate', () => {
    const phase7 = getStep(produce, 'phase_7_launch_brief')!
    const a = resolveAction(phase7 as Parameters<typeof resolveAction>[0])
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    expect(a.agent_id).toBe('campaign-brief-agent')
    expect(a.next_step.kind).toBe('static')
    if (a.next_step.kind !== 'static') throw new Error('unreachable')
    expect(a.next_step.step_id).toBe('launch_approval')

    const launchGate = getStep(produce, 'launch_approval')!
    expect(launchGate.step_type).toBe('gate_144')
    const inv = resolveGateInvocation(
      launchGate as Parameters<typeof resolveGateInvocation>[0],
    )
    expect(inv.gate_type).toBe('gate_144')

    const approved = resolveGateOutcome(
      launchGate as Parameters<typeof resolveGateOutcome>[0],
      true,
      ctx,
    )
    expect(approved.ok).toBe(true)
    if (!approved.ok) throw new Error('unreachable')
    expect(approved.next_step_id).toBe('campaign_ready')
  })

  it('campaign_ready is terminal_success', () => {
    const term = resolveStep(produce, 'campaign_ready', ctx)
    expect(term.kind).toBe('terminal')
    if (term.kind !== 'terminal') throw new Error('unreachable')
    expect(term.outcome).toBe('success')
  })
})

// ─── PRODUCE rejection loop ───────────────────────────────────────

describe('NEXUS · PRODUCE libreto · rejection loops back to the phase', () => {
  const produce = CANONICAL_LIBRETOS.PRODUCE
  const ctx = emptyCtx()

  it.each([
    ['validate_phase_1', 'phase_1_strategy'],
    ['validate_phase_2', 'phase_2_research'],
    ['validate_phase_3', 'phase_3_creative'],
    ['validate_phase_4', 'phase_4_content'],
    ['validate_phase_5', 'phase_5_assets'],
    ['validate_phase_6', 'phase_6_distribution'],
  ])(
    '%s rejected → loops back to %s (pattern 4 retry cascade)',
    (gateId, expectedReentry) => {
      const gate = getStep(produce, gateId)!
      const rejected = resolveGateOutcome(
        gate as Parameters<typeof resolveGateOutcome>[0],
        false,
        ctx,
      )
      expect(rejected.ok).toBe(true)
      if (!rejected.ok) throw new Error('unreachable')
      expect(rejected.next_step_id).toBe(expectedReentry)
    },
  )

  it('launch_approval rejection loops back to phase_4_content (mid-pipeline)', () => {
    const launchGate = getStep(produce, 'launch_approval')!
    const rejected = resolveGateOutcome(
      launchGate as Parameters<typeof resolveGateOutcome>[0],
      false,
      ctx,
    )
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) throw new Error('unreachable')
    expect(rejected.next_step_id).toBe('phase_4_content')
  })
})

// ─── ALWAYS_ON walk · conditional dispatch + needs_judgment ──────

describe('ALWAYS_ON · classification routes deterministically', () => {
  const alwaysOn = CANONICAL_LIBRETOS.ALWAYS_ON

  it('email_lifecycle classification routes to email_responder', () => {
    const c: PredicateContext = {
      event: {
        event_type: 'trigger',
        client_id: 'c',
        payload: {},
        classification: { kind: 'email_lifecycle' },
      },
      blackboard: { read: () => undefined, has: () => false },
    }
    const classifyStep = getStep(alwaysOn, 'classify_trigger')!
    if (classifyStep.step_type !== 'action') throw new Error('unreachable')
    const a = resolveAction(classifyStep)
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    // Now simulate the classification result driving next_step.
    const resolved = resolveActionNext(a, c)
    expect(resolved).toEqual({ ok: true, next_step_id: 'email_responder' })
  })

  it('unknown classification falls through to needs_judgment (Opus §H-a · function TOTAL)', () => {
    const c: PredicateContext = {
      event: {
        event_type: 'trigger',
        client_id: 'c',
        payload: {},
        classification: { kind: 'unknown_kind_never_seen' },
      },
      blackboard: { read: () => undefined, has: () => false },
    }
    const classifyStep = getStep(alwaysOn, 'classify_trigger')!
    if (classifyStep.step_type !== 'action') throw new Error('unreachable')
    const a = resolveAction(classifyStep)
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    const resolved = resolveActionNext(a, c)
    expect(resolved).toEqual({ ok: true, next_step_id: 'needs_judgment' })
  })
})

// Helper · resolve an ActionResolution's next_step against the
// canonical registry. Not part of the public interpreter API (the
// router does this inline) · here for stress-test convenience.
function resolveActionNext(
  action: ReturnType<typeof resolveAction>,
  ctx: PredicateContext,
) {
  if (action.kind !== 'dispatch') throw new Error('unreachable')
  return resolveNextStepRefWithCanon(action.next_step, ctx)
}

function resolveNextStepRefWithCanon(
  ref: Parameters<typeof resolveNextStepRef>[0],
  ctx: PredicateContext,
) {
  return resolveNextStepRef(ref, ctx, canonicalPredicateRegistry)
}

// ─── ACQUIRE walk · fit-tier routing ──────────────────────────────

describe('ACQUIRE · fit tier routes correctly', () => {
  const acquire = CANONICAL_LIBRETOS.ACQUIRE

  it('high fit routes to parallel_fit', () => {
    const c: PredicateContext = {
      event: {
        event_type: 'trigger',
        client_id: 'c',
        payload: {},
        classification: { fit: 'high' },
      },
      blackboard: { read: () => undefined, has: () => false },
    }
    const step = getStep(acquire, 'classify_lead')!
    if (step.step_type !== 'action') throw new Error('unreachable')
    const a = resolveAction(step)
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    expect(
      resolveNextStepRefWithCanon(a.next_step, c),
    ).toEqual({ ok: true, next_step_id: 'parallel_fit' })
  })

  it('low fit routes to low_fit_nurture', () => {
    const c: PredicateContext = {
      event: {
        event_type: 'trigger',
        client_id: 'c',
        payload: {},
        classification: { fit: 'low' },
      },
      blackboard: { read: () => undefined, has: () => false },
    }
    const step = getStep(acquire, 'classify_lead')!
    if (step.step_type !== 'action') throw new Error('unreachable')
    const a = resolveAction(step)
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    expect(
      resolveNextStepRefWithCanon(a.next_step, c),
    ).toEqual({ ok: true, next_step_id: 'low_fit_nurture' })
  })

  it('unknown fit value routes to needs_judgment (default branch)', () => {
    const c: PredicateContext = {
      event: {
        event_type: 'trigger',
        client_id: 'c',
        payload: {},
        classification: { fit: 'unknown' },
      },
      blackboard: { read: () => undefined, has: () => false },
    }
    const step = getStep(acquire, 'classify_lead')!
    if (step.step_type !== 'action') throw new Error('unreachable')
    const a = resolveAction(step)
    if (a.kind !== 'dispatch') throw new Error('unreachable')
    expect(
      resolveNextStepRefWithCanon(a.next_step, c),
    ).toEqual({ ok: true, next_step_id: 'needs_judgment' })
  })
})

// ─── Cross-libreto integrity · every name resolves ────────────────

describe('Canonical libretos · every predicate name resolves in the canonical registry', () => {
  for (const journey of Object.keys(CANONICAL_LIBRETOS) as Array<
    keyof typeof CANONICAL_LIBRETOS
  >) {
    it(`${journey} · zero unknown predicate names`, () => {
      const libreto = CANONICAL_LIBRETOS[journey]
      const unknown = verifyPredicatesRegistered(
        libreto,
        canonicalPredicateRegistry,
      )
      if (unknown.length > 0) {
        throw new Error(
          `${journey} references unregistered predicates · ${unknown.join(', ')} · add to CANONICAL_PREDICATES or rename in the libreto`,
        )
      }
      expect(unknown).toEqual([])
    })
  }

  it('collects the union of predicate names across all libretos', () => {
    const allNames = new Set<string>()
    for (const journey of Object.keys(CANONICAL_LIBRETOS) as Array<
      keyof typeof CANONICAL_LIBRETOS
    >) {
      for (const name of collectPredicateNames(CANONICAL_LIBRETOS[journey])) {
        allNames.add(name)
      }
    }
    // The current libretos (after rename) reference 9 names · matches
    // the canonical registry. If new conditionals land, both sides
    // need updating in lockstep.
    expect(allNames.size).toBeGreaterThanOrEqual(9)
    for (const name of allNames) {
      expect(canonicalPredicateRegistry.has(name)).toBe(true)
    }
  })
})

// ─── Validation rules · interpreter handles libreto-provided rules ─

describe('evaluateValidationRules · libreto-level invariant', () => {
  it('libreto validation_rules schemas pass through when payload satisfies', () => {
    // The 6 canonical libretos do not currently declare
    // validation_rules · the interpreter is forward-compatible · this
    // test verifies the function would resolve cleanly on a future
    // libreto that adds them.
    const r = evaluateValidationRules(
      { required_fields: ['brief.summary', 'persona.audience'] },
      {
        event: {
          event_type: 'step_completed',
          client_id: 'c',
          payload: {
            brief: { summary: 'x' },
            persona: { audience: 'y' },
          },
        },
        blackboard: { read: () => undefined, has: () => false },
      },
    )
    expect(r).toEqual({ ok: true })
  })
})
