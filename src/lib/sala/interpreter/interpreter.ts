/**
 * Libreto interpreter · pure functions · Sprint 12 Fase 0 Ronda 3
 * Track G.
 *
 * Composable primitives the router (Track H · CC#3) calls to walk
 * a libreto step-by-step. Every function is PURE · no IO, no
 * mutation, no thrown exceptions (errors are tagged-union returns).
 * The router is the orchestrator; the interpreter is the analyzer.
 *
 * Public surface ·
 * - `getStep`            · find a step by id
 * - `resolveNextStepRef` · static or conditional next-step resolution
 * - `resolveAction`      · what to dispatch for an action step
 * - `resolveGateInvocation` · gate_pending payload from a gate step
 * - `resolveGateOutcome` · next step when a gate resolves (approve/reject)
 * - `resolveFork`        · branches + join_at for a fork step
 * - `resolveJoin`        · whether branches completed (blackboard signal)
 * - `evaluateValidationRules` · check action output against rules
 * - `resolveStep`        · unified dispatch by step_type (router convenience)
 *
 * §H-b · zero `eval`, zero `new Function`, zero inline string code.
 * Every conditional consults the predicate registry by NAME.
 */
import type {
  ActionStep,
  ForkStep,
  GateStep,
  JoinStep,
  Libreto,
  NextStepRef,
  Step,
  ValidationRules,
} from '../libretos/types'
import { canonicalPredicateRegistry } from './predicates'
import type {
  ActionResolution,
  ForkResolution,
  GateInvocation,
  GateOutcomeResult,
  InterpreterBlackboard,
  InterpreterEvent,
  JoinResolution,
  NextStepRefResult,
  PredicateContext,
  PredicateRegistry,
  StepResolution,
  ValidationResult,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────

/** Default to the canonical registry when the caller omits one ·
 *  tests inject fresh stub registries. */
function reg(registry?: PredicateRegistry): PredicateRegistry {
  return registry ?? canonicalPredicateRegistry
}

/** Index a libreto's steps by id · O(N) once, used by callers that
 *  iterate. */
function indexSteps(libreto: Libreto): Map<string, Step> {
  const m = new Map<string, Step>()
  for (const s of libreto.steps) m.set(s.step_id, s)
  return m
}

// ─── getStep ─────────────────────────────────────────────────────────

/** Find a step by id within a libreto. Returns undefined when the
 *  id is not present (the caller decides whether that is an error). */
export function getStep(
  libreto: Libreto,
  step_id: string,
): Step | undefined {
  for (const s of libreto.steps) {
    if (s.step_id === step_id) return s
  }
  return undefined
}

// ─── resolveNextStepRef ──────────────────────────────────────────────

/** Resolve a `NextStepRef` to a concrete step_id. For `static` it
 *  echoes the step_id. For `conditional` it evaluates each `when`
 *  in order against the predicate registry; the first true wins,
 *  else `default` wins. Unknown predicate names short-circuit with
 *  a typed failure so the router can surface `needs_judgment`. */
export function resolveNextStepRef(
  ref: NextStepRef,
  ctx: PredicateContext,
  registry?: PredicateRegistry,
): NextStepRefResult {
  if (ref.kind === 'static') {
    return { ok: true, next_step_id: ref.step_id }
  }
  const r = reg(registry)
  for (const branch of ref.conditions) {
    const result = r.evaluate(branch.when, ctx)
    if (result === undefined) {
      return {
        ok: false,
        reason: 'unknown_predicate',
        predicate_name: branch.when,
      }
    }
    if (result === true) {
      return { ok: true, next_step_id: branch.then }
    }
  }
  return { ok: true, next_step_id: ref.default }
}

// ─── Per-step resolution ────────────────────────────────────────────

/** Action step · the interpreter declares the agent + retry policy
 *  the router should dispatch. The router itself emits the
 *  `dispatch_requested` event. */
export function resolveAction(step: ActionStep): ActionResolution {
  return {
    kind: 'dispatch',
    agent_id: step.agent_id,
    retry_budget: step.retry_budget,
    next_step: step.next_step,
  }
}

/** Gate step · the interpreter declares the gate invocation the
 *  router posts as `gate_pending`. Resolution comes later via
 *  `resolveGateOutcome`. */
export function resolveGateInvocation(step: GateStep): GateInvocation {
  return {
    step_id: step.step_id,
    gate_type: step.step_type,
    gate_config: step.gate_config,
    next_step_on_approve: step.next_step,
    next_step_on_reject_id: step.next_step_rejected ?? null,
    description: step.description,
  }
}

/** Gate outcome · the router calls this when a `gate_resolved` event
 *  lands. `approved=true` follows the gate's `next_step`; `approved
 *  =false` follows `next_step_rejected` if set, else the failure is
 *  surfaced (the router emits a synthetic terminal_failure). */
export function resolveGateOutcome(
  step: GateStep,
  approved: boolean,
  ctx: PredicateContext,
  registry?: PredicateRegistry,
): GateOutcomeResult {
  if (approved) {
    const result = resolveNextStepRef(step.next_step, ctx, registry)
    if (!result.ok) {
      if (result.reason === 'unknown_predicate') {
        return {
          ok: false,
          reason: 'unknown_predicate',
          predicate_name: result.predicate_name,
        }
      }
      return {
        ok: false,
        reason: 'unknown_step_ref',
        step_id: result.step_id,
      }
    }
    return { ok: true, next_step_id: result.next_step_id }
  }
  // Rejected · use next_step_rejected if declared.
  if (step.next_step_rejected) {
    return { ok: true, next_step_id: step.next_step_rejected }
  }
  return { ok: false, reason: 'rejected_without_handler' }
}

/** Fork step · returns the branches and join_at for the router to
 *  dispatch in parallel. */
export function resolveFork(step: ForkStep): ForkResolution {
  return {
    branches: step.branches,
    join_at: step.join_at,
  }
}

/** Join step · check whether all required branches have signalled
 *  completion via the blackboard. The router writes per-branch
 *  completion to `branch.<step_id>.completed` (convention · this is
 *  the contract the blackboard adapter must honour).
 *
 *  Returns ready=true with next_step_id when ALL waits_for branches
 *  show completed; ready=false with the pending list otherwise. */
export function resolveJoin(
  step: JoinStep,
  ctx: PredicateContext,
  registry?: PredicateRegistry,
): JoinResolution {
  const pending: string[] = []
  for (const branch_id of step.waits_for) {
    const completed = ctx.blackboard.read<boolean>(
      `branch.${branch_id}.completed`,
    )
    if (completed !== true) {
      pending.push(branch_id)
    }
  }
  if (pending.length > 0) {
    return { ready: false, pending_branches: pending }
  }
  const result = resolveNextStepRef(step.next_step, ctx, registry)
  if (!result.ok) {
    if (result.reason === 'unknown_predicate') {
      return {
        ok: false,
        reason: 'unknown_predicate',
        predicate_name: result.predicate_name,
      }
    }
    return {
      ok: false,
      reason: 'unknown_step_ref',
      step_id: result.step_id,
    }
  }
  return { ready: true, next_step_id: result.next_step_id }
}

// ─── Validation rules ────────────────────────────────────────────────

/** Evaluate validation rules against an action's output (carried in
 *  `event.payload`). `required_fields` must each appear with a
 *  non-null/non-undefined value. `schema` is a stub for Mitad 2
 *  (named schema lookup · NOT implemented here; surfaced verbatim
 *  in the result so callers can route to a schema validator). */
export function evaluateValidationRules(
  rules: ValidationRules,
  ctx: PredicateContext,
): ValidationResult {
  if (!rules.required_fields || rules.required_fields.length === 0) {
    return { ok: true }
  }
  const missing: string[] = []
  for (const field of rules.required_fields) {
    const value = readPath(ctx.event.payload, field)
    if (value === undefined || value === null) {
      missing.push(field)
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      missing_fields: missing,
      schema: rules.schema,
    }
  }
  return { ok: true }
}

/** Read a dotted path from an object · supports nested fields like
 *  `client.brain.summary`. Stops at the first non-object segment;
 *  returns undefined if any segment is missing. */
function readPath(obj: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = obj
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

// ─── Unified resolveStep (router convenience) ───────────────────────

/** Dispatch by step_type · single entry point the router calls when
 *  it does not need per-type specifics. Returns a tagged union
 *  matching every step kind. */
export function resolveStep(
  libreto: Libreto,
  step_id: string,
  ctx: PredicateContext,
  registry?: PredicateRegistry,
): StepResolution {
  const step = getStep(libreto, step_id)
  if (!step) {
    return { kind: 'error', reason: 'unknown_step', step_id }
  }
  switch (step.step_type) {
    case 'action':
      return { kind: 'action', action: resolveAction(step) }
    case 'gate_camino_iii':
    case 'gate_hitl':
    case 'gate_144':
      return { kind: 'gate', gate: resolveGateInvocation(step) }
    case 'fork':
      return { kind: 'fork', fork: resolveFork(step) }
    case 'join': {
      const j = resolveJoin(step, ctx, registry)
      return { kind: 'join', join: j }
    }
    case 'terminal_success':
      return { kind: 'terminal', outcome: 'success', step_id: step.step_id }
    case 'terminal_failure':
      return { kind: 'terminal', outcome: 'failure', step_id: step.step_id }
  }
}

// ─── Static analysis helper · predicate name validation ─────────────

/** Walk a libreto and return every predicate name it references in
 *  conditional next_step branches. Used by tests + by a future lint
 *  hook to verify every name resolves to a registered predicate
 *  BEFORE the router runs (catches typos at boot, not in flight). */
export function collectPredicateNames(
  libreto: Libreto,
): ReadonlyArray<string> {
  const out = new Set<string>()
  for (const step of libreto.steps) {
    const ref = nextStepRefOf(step)
    if (ref && ref.kind === 'conditional') {
      for (const branch of ref.conditions) out.add(branch.when)
    }
  }
  return [...out].sort()
}

function nextStepRefOf(step: Step): NextStepRef | undefined {
  switch (step.step_type) {
    case 'action':
      return step.next_step
    case 'gate_camino_iii':
    case 'gate_hitl':
    case 'gate_144':
      return step.next_step
    case 'join':
      return step.next_step
    case 'fork':
    case 'terminal_success':
    case 'terminal_failure':
      return undefined
  }
}

/** Verify every predicate name referenced by a libreto exists in
 *  the registry. Returns the list of unknown names (empty if all
 *  resolve). The boot script + tests call this on every canonical
 *  libreto. */
export function verifyPredicatesRegistered(
  libreto: Libreto,
  registry?: PredicateRegistry,
): ReadonlyArray<string> {
  const r = reg(registry)
  const used = collectPredicateNames(libreto)
  return used.filter((name) => !r.has(name))
}

// Indexing helper re-export · not strictly needed but useful for the
// router when it wants to do many lookups against the same libreto.
export { indexSteps }
