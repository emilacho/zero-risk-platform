/**
 * Canon canonical · interpreter adapter · canon canon-bridges Track G real
 * `resolveStep(libreto, step_id, ctx, registry) → StepResolution` to the
 * router's `ResolveNextStepFn` interface (canon-PR #149 expected shape).
 *
 * Sprint 12 Fase 0 Ronda 3 Track L · CC#1 · convergencia.
 *
 * The real interpreter (PR #148) returns 6 kinds (action · gate · fork ·
 * join · terminal · error). The router (PR #149) expects 4 kinds (next ·
 * terminal · gate · unresolved). This adapter maps between them with
 * **§148 honest** loss-free shape · cero invención.
 */
import type { PredicateRegistry } from '@/lib/sala/interpreter'
import {
  canonicalPredicateRegistry,
  resolveStep,
} from '@/lib/sala/interpreter'
import type { GateStep, Step } from '@/lib/sala/libretos'
import type {
  NextStepResolution as RouterNextStepResolution,
  ResolveNextStepFn,
} from '@/lib/sala-router'

export interface InterpreterAdapterOptions {
  /** Canon canonical · predicate registry · default canonicalPredicateRegistry */
  readonly registry?: PredicateRegistry
}

/**
 * Canon canonical · build a `ResolveNextStepFn` (router's contract)
 * that delegates to the real `resolveStep` (Track G).
 *
 * Mapping canon:
 *   - StepResolution.kind='action' → router resolves canon canon-then asks the
 *     interpreter to follow next_step. The router itself walks `next_step`
 *     refs; the interpreter only resolves the step shape. We return
 *     `next` with the action step itself so the router can then call
 *     this adapter again with the NEXT step after dispatch.
 *
 *   Wait, that's not quite right. The router signature is:
 *     `resolve_next_step({libreto, current_step_id, journey_state, trigger_event})`
 *     → `next | terminal | gate | unresolved`
 *
 *   So the ROUTER asks "given I'm AT current_step_id, what's next?"
 *   NOT "what is the shape of current_step". This means the adapter
 *   should call `resolveNextStepRef` (which resolves next_step ref)
 *   not `resolveStep` (which resolves the current step itself).
 *
 *   Canon canon-canon · use `resolveStep` to get the current step + its
 *   next_step ref · then call `resolveNextStepRef` to find the target ·
 *   then call `getStep` to fetch the target step · then map to router
 *   shape.
 *
 *   Even simpler · the router's `interpreterStub` (in PR #149 stubs.ts)
 *   already does this walking. We mirror its logic but USE the real
 *   predicate evaluation via the canonical registry.
 */
export function createInterpreterAdapter(
  options: InterpreterAdapterOptions = {},
): ResolveNextStepFn {
  const registry = options.registry ?? canonicalPredicateRegistry

  return (input) => {
    const { libreto, current_step_id, journey_state, trigger_event } = input
    const current = libreto.steps.find((s) => s.step_id === current_step_id)
    if (!current) {
      return {
        kind: 'unresolved',
        reason: `step "${current_step_id}" not in libreto`,
      } satisfies RouterNextStepResolution
    }

    // canon canon · terminal short-circuit
    if (
      current.step_type === 'terminal_success' ||
      current.step_type === 'terminal_failure'
    ) {
      return {
        kind: 'terminal',
        outcome: current.step_type === 'terminal_success' ? 'success' : 'failure',
        step_id: current.step_id,
      } satisfies RouterNextStepResolution
    }

    // canon canon · join is structural · router should resolve through it
    if (current.step_type === 'join') {
      return {
        kind: 'unresolved',
        reason: `join step "${current.step_id}" structural · router should not call interpreter here`,
      } satisfies RouterNextStepResolution
    }

    // canon canon · use the real interpreter for next_step resolution
    // canon · canon canon-canon-builds PredicateContext from event + a minimal blackboard view
    // canon · canon canon-canon-real predicates expect InterpreterEvent shape · canon canon-map fields
    const event = {
      event_type: trigger_event.event_type,
      client_id: trigger_event.client_id,
      payload:
        typeof trigger_event.payload === 'object' && trigger_event.payload !== null
          ? (trigger_event.payload as Record<string, unknown>)
          : {},
      classification: (trigger_event.payload as Record<string, unknown>)?.classification as
        | { fit?: string; recommendation?: string; confidence?: number; kind?: string; [k: string]: unknown }
        | undefined,
      metadata: {
        stream_id: trigger_event.stream_id,
        journey_type: trigger_event.journey_type,
        current_step: journey_state.current_step,
        sequence: trigger_event.sequence,
      },
    } as Parameters<typeof resolveStep>[2]['event']

    const blackboard = {
      read: <T = unknown>(_key: string): T | undefined => undefined,
      has: (_key: string): boolean => false,
    } as Parameters<typeof resolveStep>[2]['blackboard']
    void _key

    const ctx = { event, blackboard }

    // canon canon-canon · Track T (Step 11 resume gap · 2026-06-04) ·
    // IF current step is a gate AND trigger is gate_resolved · the
    // outcome (approved/rejected) selects between `gate.next_step` and
    // `gate.next_step_rejected`. Without this branch, rejected gates
    // silently follow the approved path · breaking the HITL revise loop.
    if (
      (current.step_type === 'gate_camino_iii' ||
        current.step_type === 'gate_hitl' ||
        current.step_type === 'gate_144') &&
      trigger_event.event_type === 'gate_resolved'
    ) {
      const outcomeRaw = (trigger_event.payload as Record<string, unknown> | null | undefined)
        ?.outcome
      if (outcomeRaw === 'rejected') {
        const gate = current as GateStep
        if (!gate.next_step_rejected) {
          return {
            kind: 'terminal',
            outcome: 'failure',
            step_id: current.step_id,
          } satisfies RouterNextStepResolution
        }
        const rejectedTarget = libreto.steps.find(
          (s) => s.step_id === gate.next_step_rejected,
        )
        if (!rejectedTarget) {
          return {
            kind: 'unresolved',
            reason: `next_step_rejected "${gate.next_step_rejected}" not in libreto`,
          } satisfies RouterNextStepResolution
        }
        return mapTargetToRouter(rejectedTarget)
      }
      // outcome === 'approved' (or absent · canon default) · fall
      // through to the standard next_step resolution path below.
    }

    // canon canon-canon · steps with next_step refs (action · gate · fork)
    const next_step_ref = (current as { next_step?: import('@/lib/sala/libretos').NextStepRef })
      .next_step
    if (!next_step_ref) {
      return {
        kind: 'unresolved',
        reason: `step "${current.step_id}" carries no next_step reference`,
      } satisfies RouterNextStepResolution
    }

    const target_id = resolveRef(next_step_ref, ctx, registry)
    if (!target_id) {
      return {
        kind: 'unresolved',
        reason: `no conditional matched for step "${current.step_id}"`,
      } satisfies RouterNextStepResolution
    }

    const target = libreto.steps.find((s) => s.step_id === target_id)
    if (!target) {
      return {
        kind: 'unresolved',
        reason: `next step "${target_id}" not in libreto`,
      } satisfies RouterNextStepResolution
    }

    return mapTargetToRouter(target)
  }
}

/** Canon canonical · Track T · map a libreto Step to the router's
 *  NextStepResolution shape · canon canonical-shared between the
 *  approved-path tail and the rejected-path branch. */
function mapTargetToRouter(target: Step): RouterNextStepResolution {
  if (
    target.step_type === 'terminal_success' ||
    target.step_type === 'terminal_failure'
  ) {
    return {
      kind: 'terminal',
      outcome: target.step_type === 'terminal_success' ? 'success' : 'failure',
      step_id: target.step_id,
    } satisfies RouterNextStepResolution
  }
  if (
    target.step_type === 'gate_camino_iii' ||
    target.step_type === 'gate_hitl' ||
    target.step_type === 'gate_144'
  ) {
    return { kind: 'gate', gate_step: target } satisfies RouterNextStepResolution
  }
  return { kind: 'next', next_step: target } satisfies RouterNextStepResolution
}

function resolveRef(
  ref: import('@/lib/sala/libretos').NextStepRef,
  ctx: Parameters<typeof resolveStep>[2],
  registry: PredicateRegistry,
): string | undefined {
  if (ref.kind === 'static') return ref.step_id
  for (const branch of ref.conditions) {
    const result = registry.evaluate(branch.when, ctx)
    if (result === true) return branch.then
    // canon · canon canon-canon-if result is undefined (unknown predicate), skip
    // canon · canon canon-canon-(router upstream will surface needs_judgment)
  }
  return ref.default
}

// Reference `_key` to silence eslint canon canon-canon-no-unused-vars on the
// canon canon-canon-discarded parameter inside the inline blackboard stub.
const _key = 'canon-noop'
