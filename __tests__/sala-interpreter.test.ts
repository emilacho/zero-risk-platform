/**
 * Tests for src/lib/sala/interpreter/interpreter.ts · Sprint 12 Fase
 * 0 Ronda 3 Track G.
 *
 * Coverage ·
 * - getStep · finds + returns undefined
 * - resolveNextStepRef · static + conditional · predicate order ·
 *   default fallthrough · unknown_predicate failure
 * - resolveAction · returns dispatch shape
 * - resolveGateInvocation · all 3 gate types
 * - resolveGateOutcome · approve path · reject with handler · reject
 *   WITHOUT handler (rejected_without_handler)
 * - resolveFork + resolveJoin · ready / pending / unknown_predicate
 * - evaluateValidationRules · pass · missing fields · nested path
 * - resolveStep · unified dispatch for every step_type
 * - collectPredicateNames + verifyPredicatesRegistered
 */
import { describe, it, expect } from 'vitest'
import {
  collectPredicateNames,
  evaluateValidationRules,
  getStep,
  resolveAction,
  resolveFork,
  resolveGateInvocation,
  resolveGateOutcome,
  resolveJoin,
  resolveNextStepRef,
  resolveStep,
  verifyPredicatesRegistered,
} from '../src/lib/sala/interpreter/interpreter'
import { createPredicateRegistry } from '../src/lib/sala/interpreter/predicates'
import type {
  ActionStep,
  ForkStep,
  GateStep,
  JoinStep,
  Libreto,
  NextStepRef,
} from '../src/lib/sala/libretos/types'
import type {
  InterpreterBlackboard,
  PredicateContext,
} from '../src/lib/sala/interpreter/types'

// ─── Fixtures ──────────────────────────────────────────────────────

const RETRY = {
  max_attempts: 3,
  initial_backoff_ms: 100,
  max_backoff_ms: 1000,
  on_exhausted: 'gate_hitl' as const,
}

function bb(values: Record<string, unknown> = {}): InterpreterBlackboard {
  return {
    read<T = unknown>(key: string): T | undefined {
      return values[key] as T | undefined
    },
    has(key: string): boolean {
      return key in values
    },
  }
}

function ctx(
  blackboard: Record<string, unknown> = {},
  event: Record<string, unknown> = {},
): PredicateContext {
  return {
    event: {
      event_type: 'test',
      client_id: 'client-test',
      payload: {},
      ...event,
    },
    blackboard: bb(blackboard),
  }
}

const action: ActionStep = {
  step_id: 'do_it',
  step_type: 'action',
  agent_id: 'jefe-marketing',
  retry_budget: RETRY,
  next_step: { kind: 'static', step_id: 'done' },
}

const gateCamino: GateStep = {
  step_id: 'review',
  step_type: 'gate_camino_iii',
  gate_config: { timeout_ms: 60_000, description: 'Camino III review' },
  next_step: { kind: 'static', step_id: 'done' },
  next_step_rejected: 'do_it',
}

const gateNoReject: GateStep = {
  step_id: 'gate_no_handler',
  step_type: 'gate_hitl',
  gate_config: { timeout_ms: null, description: 'no rejection path declared' },
  next_step: { kind: 'static', step_id: 'done' },
}

const fork: ForkStep = {
  step_id: 'fan_out',
  step_type: 'fork',
  branches: ['branch_a', 'branch_b'],
  join_at: 'join',
}

const join: JoinStep = {
  step_id: 'join',
  step_type: 'join',
  waits_for: ['branch_a', 'branch_b'],
  next_step: { kind: 'static', step_id: 'done' },
}

const libreto: Libreto = {
  journey_type: 'PRODUCE',
  version: 1,
  description: 'fixture libreto',
  entry_step_id: 'do_it',
  steps: [
    action,
    gateCamino,
    gateNoReject,
    fork,
    join,
    { step_id: 'branch_a', step_type: 'terminal_success' },
    { step_id: 'branch_b', step_type: 'terminal_success' },
    { step_id: 'done', step_type: 'terminal_success' },
  ],
  metadata: { status: 'draft' },
}

// ─── getStep ───────────────────────────────────────────────────────

describe('getStep', () => {
  it('returns the step when it exists', () => {
    expect(getStep(libreto, 'do_it')?.step_type).toBe('action')
  })
  it('returns undefined when the step is missing', () => {
    expect(getStep(libreto, 'ghost')).toBeUndefined()
  })
})

// ─── resolveNextStepRef · static + conditional ─────────────────────

describe('resolveNextStepRef', () => {
  it('resolves static refs by echo', () => {
    const r = resolveNextStepRef(
      { kind: 'static', step_id: 'done' },
      ctx(),
    )
    expect(r).toEqual({ ok: true, next_step_id: 'done' })
  })

  it('resolves conditional · first truthy predicate wins', () => {
    const reg = createPredicateRegistry({})
    reg.register('first.false', () => false)
    reg.register('second.true', () => true)
    reg.register('third.true', () => true)
    const ref: NextStepRef = {
      kind: 'conditional',
      conditions: [
        { when: 'first.false', then: 'A' },
        { when: 'second.true', then: 'B' },
        { when: 'third.true', then: 'C' },
      ],
      default: 'D',
    }
    const r = resolveNextStepRef(ref, ctx(), reg)
    expect(r).toEqual({ ok: true, next_step_id: 'B' })
  })

  it('falls through to default when no predicate matches', () => {
    const reg = createPredicateRegistry({})
    reg.register('a', () => false)
    reg.register('b', () => false)
    const ref: NextStepRef = {
      kind: 'conditional',
      conditions: [
        { when: 'a', then: 'A' },
        { when: 'b', then: 'B' },
      ],
      default: 'D',
    }
    expect(resolveNextStepRef(ref, ctx(), reg)).toEqual({
      ok: true,
      next_step_id: 'D',
    })
  })

  it('returns unknown_predicate when a predicate name is not registered', () => {
    const reg = createPredicateRegistry({})
    const ref: NextStepRef = {
      kind: 'conditional',
      conditions: [{ when: 'ghost', then: 'X' }],
      default: 'D',
    }
    const r = resolveNextStepRef(ref, ctx(), reg)
    expect(r).toEqual({
      ok: false,
      reason: 'unknown_predicate',
      predicate_name: 'ghost',
    })
  })

  it('does NOT eval the predicate name as JS (§H-b · no inline)', () => {
    const reg = createPredicateRegistry({})
    // Pretend a malicious libreto carried a JS expression as the name.
    // The registry has no such name → unknown_predicate (NOT executed).
    const ref: NextStepRef = {
      kind: 'conditional',
      conditions: [{ when: 'event.payload.attacker === "X"', then: 'never' }],
      default: 'D',
    }
    const r = resolveNextStepRef(ref, ctx(), reg)
    expect(r).toEqual({
      ok: false,
      reason: 'unknown_predicate',
      predicate_name: 'event.payload.attacker === "X"',
    })
  })
})

// ─── resolveAction ────────────────────────────────────────────────

describe('resolveAction', () => {
  it('returns the dispatch shape with agent_id + retry_budget + next_step', () => {
    const r = resolveAction(action)
    expect(r.kind).toBe('dispatch')
    if (r.kind !== 'dispatch') throw new Error('unreachable')
    expect(r.agent_id).toBe('jefe-marketing')
    expect(r.retry_budget).toEqual(RETRY)
    expect(r.next_step).toEqual({ kind: 'static', step_id: 'done' })
  })
})

// ─── resolveGateInvocation + resolveGateOutcome ──────────────────

describe('resolveGateInvocation', () => {
  it('returns the gate payload preserving config + next_step + rejected handler', () => {
    const inv = resolveGateInvocation(gateCamino)
    expect(inv.gate_type).toBe('gate_camino_iii')
    expect(inv.step_id).toBe('review')
    expect(inv.next_step_on_approve).toEqual({ kind: 'static', step_id: 'done' })
    expect(inv.next_step_on_reject_id).toBe('do_it')
  })
  it('sets next_step_on_reject_id to null when handler is absent', () => {
    const inv = resolveGateInvocation(gateNoReject)
    expect(inv.next_step_on_reject_id).toBeNull()
  })
})

describe('resolveGateOutcome', () => {
  it('approved path follows next_step (static)', () => {
    const r = resolveGateOutcome(gateCamino, true, ctx())
    expect(r).toEqual({ ok: true, next_step_id: 'done' })
  })
  it('rejected with handler · follows next_step_rejected', () => {
    const r = resolveGateOutcome(gateCamino, false, ctx())
    expect(r).toEqual({ ok: true, next_step_id: 'do_it' })
  })
  it('rejected WITHOUT handler · returns rejected_without_handler', () => {
    const r = resolveGateOutcome(gateNoReject, false, ctx())
    expect(r).toEqual({ ok: false, reason: 'rejected_without_handler' })
  })
  it('approved with conditional next_step + unknown predicate surfaces failure', () => {
    const reg = createPredicateRegistry({})
    const gateConditional: GateStep = {
      step_id: 'g',
      step_type: 'gate_hitl',
      gate_config: { timeout_ms: null, description: 'g' },
      next_step: {
        kind: 'conditional',
        conditions: [{ when: 'ghost', then: 'X' }],
        default: 'Y',
      },
    }
    const r = resolveGateOutcome(gateConditional, true, ctx(), reg)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.reason).toBe('unknown_predicate')
  })
})

// ─── Fork + Join ─────────────────────────────────────────────────

describe('resolveFork', () => {
  it('returns branches + join_at verbatim', () => {
    expect(resolveFork(fork)).toEqual({
      branches: ['branch_a', 'branch_b'],
      join_at: 'join',
    })
  })
})

describe('resolveJoin', () => {
  it('returns ready=true with next_step when all branches completed', () => {
    const result = resolveJoin(
      join,
      ctx({ 'branch.branch_a.completed': true, 'branch.branch_b.completed': true }),
    )
    expect(result).toEqual({ ready: true, next_step_id: 'done' })
  })

  it('returns ready=false with pending branches when some incomplete', () => {
    const result = resolveJoin(
      join,
      ctx({ 'branch.branch_a.completed': true }),
    )
    expect(result).toEqual({
      ready: false,
      pending_branches: ['branch_b'],
    })
  })

  it('returns ready=false for all branches when nothing completed', () => {
    const result = resolveJoin(join, ctx())
    expect(result).toEqual({
      ready: false,
      pending_branches: ['branch_a', 'branch_b'],
    })
  })
})

// ─── evaluateValidationRules ─────────────────────────────────────

describe('evaluateValidationRules', () => {
  it('ok=true when no rules', () => {
    expect(evaluateValidationRules({}, ctx())).toEqual({ ok: true })
  })

  it('ok=true when all required_fields present', () => {
    const c = ctx({}, { payload: { brief: 'x', persona: 'y' } })
    const r = evaluateValidationRules(
      { required_fields: ['brief', 'persona'] },
      c,
    )
    expect(r).toEqual({ ok: true })
  })

  it('ok=false with missing_fields list', () => {
    const c = ctx({}, { payload: { brief: 'x' } })
    const r = evaluateValidationRules(
      { required_fields: ['brief', 'persona', 'budget'] },
      c,
    )
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.missing_fields).toEqual(['persona', 'budget'])
  })

  it('treats null + undefined as missing', () => {
    const c = ctx({}, { payload: { a: null, b: undefined, c: 'ok' } })
    const r = evaluateValidationRules(
      { required_fields: ['a', 'b', 'c'] },
      c,
    )
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.missing_fields).toEqual(['a', 'b'])
  })

  it('reads nested paths (dotted)', () => {
    const c = ctx({}, { payload: { client: { brain: { summary: 'x' } } } })
    expect(
      evaluateValidationRules(
        { required_fields: ['client.brain.summary'] },
        c,
      ),
    ).toEqual({ ok: true })
    expect(
      evaluateValidationRules(
        { required_fields: ['client.brain.missing'] },
        c,
      ).ok,
    ).toBe(false)
  })

  it('returns schema in failure result for forward routing', () => {
    const r = evaluateValidationRules(
      { required_fields: ['x'], schema: 'campaign_brief_v2' },
      ctx({}, { payload: {} }),
    )
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.schema).toBe('campaign_brief_v2')
  })
})

// ─── resolveStep · unified dispatch ──────────────────────────────

describe('resolveStep', () => {
  it('dispatches action steps', () => {
    const r = resolveStep(libreto, 'do_it', ctx())
    expect(r.kind).toBe('action')
  })

  it('dispatches gate steps', () => {
    const r = resolveStep(libreto, 'review', ctx())
    expect(r.kind).toBe('gate')
  })

  it('dispatches fork steps', () => {
    const r = resolveStep(libreto, 'fan_out', ctx())
    expect(r.kind).toBe('fork')
  })

  it('dispatches join steps', () => {
    const r = resolveStep(libreto, 'join', ctx())
    expect(r.kind).toBe('join')
  })

  it('dispatches terminal_success steps', () => {
    const r = resolveStep(libreto, 'done', ctx())
    expect(r.kind).toBe('terminal')
    if (r.kind !== 'terminal') throw new Error('unreachable')
    expect(r.outcome).toBe('success')
  })

  it('returns error · unknown_step for ghost ids', () => {
    const r = resolveStep(libreto, 'ghost', ctx())
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') throw new Error('unreachable')
    expect(r.reason).toBe('unknown_step')
  })
})

// ─── collectPredicateNames + verifyPredicatesRegistered ──────────

describe('collectPredicateNames + verifyPredicatesRegistered', () => {
  it('collects predicate names from conditional branches', () => {
    const libWithConditional: Libreto = {
      journey_type: 'ALWAYS_ON',
      version: 1,
      description: 'with conditional',
      entry_step_id: 'do',
      steps: [
        {
          step_id: 'do',
          step_type: 'action',
          agent_id: 'ruflo',
          retry_budget: RETRY,
          next_step: {
            kind: 'conditional',
            conditions: [
              { when: 'a.true', then: 'done' },
              { when: 'b.maybe', then: 'done' },
            ],
            default: 'done',
          },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const names = collectPredicateNames(libWithConditional)
    expect(names).toEqual(['a.true', 'b.maybe'])
  })

  it('verifyPredicatesRegistered returns the unknown subset', () => {
    const reg = createPredicateRegistry({})
    reg.register('a.true', () => true)
    const libWithConditional: Libreto = {
      journey_type: 'ALWAYS_ON',
      version: 1,
      description: 'mixed',
      entry_step_id: 'do',
      steps: [
        {
          step_id: 'do',
          step_type: 'action',
          agent_id: 'ruflo',
          retry_budget: RETRY,
          next_step: {
            kind: 'conditional',
            conditions: [
              { when: 'a.true', then: 'done' },
              { when: 'b.missing', then: 'done' },
            ],
            default: 'done',
          },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    expect(verifyPredicatesRegistered(libWithConditional, reg)).toEqual([
      'b.missing',
    ])
  })

  it('empty when libreto has zero conditionals', () => {
    expect(collectPredicateNames(libreto)).toEqual([])
  })
})
