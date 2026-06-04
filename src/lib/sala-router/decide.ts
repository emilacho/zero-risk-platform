/**
 * Canon canonical · `decide` · the stateless router function ·
 * Sprint 12 Fase 0 Ronda 3 Track H.
 *
 * Spec · `SALA-FASE0-ronda3-router.md` §5 + Opus ronda 1 (#equipo
 * 2026-06-03 20:15).
 *
 * Composes 4 upstream contracts:
 *   1. Track F journey-state projection · where the stream is.
 *   2. Track G libreto lookup · which playbook for this journey.
 *   3. Track G interpreter (stubbed) · the next step inside the libreto.
 *   4. G6 budget-check (stubbed) · whether the bucket allows the dispatch.
 *
 * Returns `Decision[]` · 1 entry per emitted decision. Most decisions
 * are singletons; `fork` steps are the only multi-decision case in
 * Ronda 3 (1 dispatch per branch). The Ronda 4 router build extends
 * fork-handling and parallel orchestration.
 *
 * Function TOTAL · every `{event_type, current_step, libreto}` triple
 * resolves to one of 5 decision kinds. The switch on `event.event_type`
 * is exhaustive at compile time; missing libreto / unresolved step /
 * unknown kickstart route to `needs_judgment`.
 */

import { buildIdempotencyKey } from '@/lib/sala-event-log'
import type { GateType } from '@/lib/sala-event-log'
import { buildBucketKey } from './stubs'
import type {
  Libreto,
  JourneyType,
  Step,
  ActionStep,
  GateStep,
  TerminalStep,
  ForkStep,
} from '@/lib/sala/libretos'
import type {
  DecideInput,
  Decision,
  DispatchDecision,
  GatePendingDecision,
  TerminalDecision,
  NeedsJudgmentDecision,
  BudgetBlockedDecision,
  NeedsJudgmentReason,
  IdempotencyInputs,
} from './types'

// =====================================================================
// Public entrypoint
// =====================================================================

export async function decide(input: DecideInput): Promise<Decision[]> {
  const { event, journey_state } = input

  // ─── Step 1 · sanity check the event vs the projection ─────────
  // The router consumes the projection that Track F derives FROM the
  // log; we sanity-check that the trigger event matches the same stream.
  // A mismatch is a `needs_judgment` signal because the caller wired the
  // wrong projection · cero crash, cero silent drop.
  if (event.stream_id !== journey_state.stream_id) {
    return [
      buildNeedsJudgment(input, {
        reason: 'event_type_not_handled',
        detail: `event stream_id ${event.stream_id} != journey_state.stream_id ${journey_state.stream_id}`,
      }),
    ]
  }

  // ─── Step 2 · resolve libreto from event journey_type ──────────
  const libreto = input.libreto_lookup(event.journey_type)
  if (!libreto) {
    return [
      buildNeedsJudgment(input, {
        reason: 'libreto_not_found',
        detail: `no libreto registered for journey_type "${event.journey_type}"`,
      }),
    ]
  }
  if (libreto.metadata.status === 'pending_144') {
    return [
      buildNeedsJudgment(input, {
        reason: 'libreto_pending_144',
        detail: `libreto "${libreto.journey_type}" v${libreto.version} is pending §144 Emilio decision`,
      }),
    ]
  }

  // ─── Step 3 · find the current step inside the libreto ────────
  const current_step_id = journey_state.current_step ?? libreto.entry_step_id
  const current_step = libreto.steps.find((s) => s.step_id === current_step_id)
  if (!current_step) {
    return [
      buildNeedsJudgment(input, {
        reason: 'current_step_not_in_libreto',
        detail: `step "${current_step_id}" not found in libreto ${libreto.journey_type} v${libreto.version}`,
      }),
    ]
  }

  // ─── Step 4 · dispatch the per-event-type handler ──────────────
  // EXHAUSTIVE on EventType · adding a new event type triggers a
  // compile error (the `never` assertion below).
  switch (event.event_type) {
    case 'dispatch_requested':
    case 'step_started':
    case 'step_completed':
    case 'step_failed':
    case 'handoff':
    case 'gate_pending':
    case 'gate_resolved':
    case 'needs_judgment':
    case 'judgment_resolved':
    case 'budget_blocked':
      return resolveDecision(input, libreto, current_step)
    default:
      // Compile-time exhaustiveness · this `never` shouts if a new
      // event_type is added to the schema without updating the router.
      const _exhaustive: never = event.event_type
      void _exhaustive
      return [
        buildNeedsJudgment(input, {
          reason: 'event_type_not_handled',
          detail: `event_type "${event.event_type}" has no router rule`,
        }),
      ]
  }
}

// =====================================================================
// Core resolution · drives the next step decision
// =====================================================================

async function resolveDecision(
  input: DecideInput,
  libreto: Libreto,
  current_step: Step,
): Promise<Decision[]> {
  const { event, journey_state } = input

  // ─── Terminal first · libreto says we're done on this branch ──
  // If the current step itself is terminal, emit terminal and stop.
  // (Typically reached after a step_completed event lands on the
  // entry of a terminal step · rare but valid.)
  if (
    current_step.step_type === 'terminal_success' ||
    current_step.step_type === 'terminal_failure'
  ) {
    return [buildTerminal(input, libreto, current_step as TerminalStep)]
  }

  // ─── Gates · the branch is frozen waiting for resolution ──────
  // If the event is a `gate_pending` we already emitted, we don't
  // re-emit. If the projection shows pending gates and the current
  // step is a gate, we sit tight (no decision · empty array).
  const has_unresolved_gate = journey_state.pending_gates.some(
    (g) => g.step_id === current_step.step_id,
  )
  if (has_unresolved_gate && event.event_type !== 'gate_resolved') {
    // The branch is parked · no new decision until gate_resolved lands.
    return []
  }

  // ─── If the current step is a GATE ───────────────────────────
  // 3 sub-cases:
  //   (a) gate not yet pending AND event isn't `gate_resolved` →
  //       emit `gate_pending` (initial fire).
  //   (b) gate is pending → covered by the `has_unresolved_gate`
  //       branch above; we never reach here with pending=true.
  //   (c) event IS `gate_resolved` for THIS gate → advance via the
  //       interpreter to the next step after the gate (handled by the
  //       fall-through to the interpreter below).
  if (
    current_step.step_type === 'gate_camino_iii' ||
    current_step.step_type === 'gate_hitl' ||
    current_step.step_type === 'gate_144'
  ) {
    if (event.event_type !== 'gate_resolved') {
      // Initial fire of the gate · emit gate_pending · the projection
      // will accumulate it · the next call sees pending and parks
      // (handled by the has_unresolved_gate branch above).
      return [buildGatePending(input, libreto, current_step as GateStep)]
    }
    // event_type === 'gate_resolved' · the gate completed · fall
    // through to the interpreter to find the post-gate step.
  }

  // ─── Forward via the interpreter ──────────────────────────────
  const resolution = input.resolve_next_step({
    libreto,
    current_step_id: current_step.step_id,
    journey_state,
    trigger_event: event,
  })

  switch (resolution.kind) {
    case 'unresolved':
      return [
        buildNeedsJudgment(input, {
          reason: 'interpreter_unresolved',
          detail: resolution.reason,
        }),
      ]
    case 'terminal':
      // Synthesize a terminal "anchor" step from the resolution.
      return [
        buildTerminal(input, libreto, {
          step_id: resolution.step_id,
          step_type:
            resolution.outcome === 'success'
              ? 'terminal_success'
              : 'terminal_failure',
        }),
      ]
    case 'gate':
      return [buildGatePending(input, libreto, resolution.gate_step as GateStep)]
    case 'next': {
      // The next step in the libreto. ACTION → budget-check + dispatch.
      // FORK → fan out N dispatches via the join's branches metadata.
      const next = resolution.next_step
      if (next.step_type === 'action') {
        return await dispatchAction(input, libreto, next)
      }
      if (
        next.step_type === 'gate_camino_iii' ||
        next.step_type === 'gate_hitl' ||
        next.step_type === 'gate_144'
      ) {
        return [buildGatePending(input, libreto, next as GateStep)]
      }
      if (
        next.step_type === 'terminal_success' ||
        next.step_type === 'terminal_failure'
      ) {
        return [buildTerminal(input, libreto, next as TerminalStep)]
      }
      if (next.step_type === 'fork') {
        return await dispatchFork(input, libreto, next as ForkStep)
      }
      // 'join' is structural · no dispatch happens at the join itself,
      // only at the next_step after the join. The interpreter SHOULD
      // resolve through the join to the next action; if we land here
      // it means the interpreter handed back the join itself, which is
      // a contract bug · `needs_judgment` (cero silent drop).
      return [
        buildNeedsJudgment(input, {
          reason: 'event_type_not_handled',
          detail: `interpreter returned join step "${next.step_id}" as next · expected the post-join step`,
        }),
      ]
    }
    default: {
      const _exhaustive: never = resolution
      void _exhaustive
      return [
        buildNeedsJudgment(input, {
          reason: 'interpreter_unresolved',
          detail: `unexpected NextStepResolution.kind`,
        }),
      ]
    }
  }
}

// =====================================================================
// Dispatch builders · budget-check gates them all
// =====================================================================

async function dispatchAction(
  input: DecideInput,
  libreto: Libreto,
  step: ActionStep,
): Promise<Decision[]> {
  const idempotency_inputs = buildIdempotencyInputs(input, libreto, step)
  const idempotency_key = buildIdempotencyKey({
    operation_type: idempotency_inputs.operation_type,
    client_id: idempotency_inputs.client_id,
    logical_period: idempotency_inputs.logical_period,
    input_hash: idempotency_inputs.input_hash,
  })
  // Canon canonical bucket-key · per-operation granularity per escalón 4
  // desbloqueo spec · the router COMPOSES the key, the G6 seam MATCHES
  // on the same string. Seeds in `rate_limit_buckets` keyed by this
  // exact format. Centralized in `buildBucketKey()` (stubs.ts) so any
  // change ripples through the wire automatically.
  const bucket_key = buildBucketKey({
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type: libreto.journey_type,
    operation_type: idempotency_inputs.operation_type,
  })

  // ─── Paso 3.5 · budget-check BEFORE dispatch ──────────────────
  // Opus ronda 1 §2 · the cap is enforced inside the router atomically
  // (read-then-act in the bucket); if the bucket says no, we emit
  // `budget_blocked` and the dispatch DID NOT happen.
  //
  // ASYNC per escalón 4 desbloqueo (Option B 2026-06-04) · the real G6
  // hook calls `supabase.rpc('increment_bucket_atomic', ...)` and that
  // is inherently async. We await here so the seam can preserve the
  // atomic increment semantics (Option A · sync cache · would lose it).
  const budget = await input.budget_check({
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type: libreto.journey_type,
    operation_type: idempotency_inputs.operation_type,
    step_id: step.step_id,
    bucket_key,
  })
  if (!budget.allowed) {
    const blocked: BudgetBlockedDecision = {
      kind: 'budget_blocked',
      stream_id: input.event.stream_id,
      correlation_id: input.event.correlation_id,
      tenant_id: input.event.tenant_id,
      client_id: input.event.client_id,
      journey_type: libreto.journey_type,
      step_id: step.step_id,
      budget_key: budget.budget_key,
      reason: budget.reason ?? 'budget exceeded',
      libreto_version: libreto.version,
      caused_by_event_id: input.event.event_id,
    }
    return [blocked]
  }

  // ─── Attempt counter · current_step_attempt + 1 on retry ─────
  const current_attempt = input.journey_state.current_step_attempt ?? 0
  const next_attempt =
    input.journey_state.current_step === step.step_id ? current_attempt + 1 : 1

  const dispatch: DispatchDecision = {
    kind: 'dispatch',
    stream_id: input.event.stream_id,
    correlation_id: input.event.correlation_id,
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type: libreto.journey_type,
    step_id: step.step_id,
    agent_id: step.agent_id,
    attempt: next_attempt,
    idempotency_key,
    idempotency_inputs,
    libreto_version: libreto.version,
    caused_by_event_id: input.event.event_id,
  }
  return [dispatch]
}

async function dispatchFork(
  input: DecideInput,
  libreto: Libreto,
  fork_step: ForkStep,
): Promise<Decision[]> {
  // Each branch is resolved as its own dispatch · the join collects them.
  const decisions: Decision[] = []
  for (const branch_step_id of fork_step.branches) {
    const branch_step = libreto.steps.find((s) => s.step_id === branch_step_id)
    if (!branch_step) {
      decisions.push(
        buildNeedsJudgment(input, {
          reason: 'current_step_not_in_libreto',
          detail: `fork branch "${branch_step_id}" not found in libreto`,
        }),
      )
      continue
    }
    if (branch_step.step_type === 'action') {
      decisions.push(...(await dispatchAction(input, libreto, branch_step)))
    } else if (
      branch_step.step_type === 'gate_camino_iii' ||
      branch_step.step_type === 'gate_hitl' ||
      branch_step.step_type === 'gate_144'
    ) {
      decisions.push(buildGatePending(input, libreto, branch_step as GateStep))
    } else {
      decisions.push(
        buildNeedsJudgment(input, {
          reason: 'event_type_not_handled',
          detail: `fork branch "${branch_step_id}" has unsupported step_type ${branch_step.step_type}`,
        }),
      )
    }
  }
  return decisions
}

// =====================================================================
// Builders for non-action decisions
// =====================================================================

function buildGatePending(
  input: DecideInput,
  libreto: Libreto,
  gate_step: GateStep,
): GatePendingDecision {
  const gate_type = stepTypeToGateType(gate_step.step_type)
  const idempotency_inputs: IdempotencyInputs = {
    operation_type: `${libreto.journey_type}.${gate_step.step_id}.gate`,
    client_id: input.event.client_id,
    logical_period: input.journey_state.stream_id,
  }
  return {
    kind: 'gate_pending',
    stream_id: input.event.stream_id,
    correlation_id: input.event.correlation_id,
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type: libreto.journey_type,
    step_id: gate_step.step_id,
    gate_type,
    idempotency_key: buildIdempotencyKey({
      operation_type: idempotency_inputs.operation_type,
      client_id: idempotency_inputs.client_id,
      logical_period: idempotency_inputs.logical_period,
    }),
    idempotency_inputs,
    libreto_version: libreto.version,
    caused_by_event_id: input.event.event_id,
  }
}

function buildTerminal(
  input: DecideInput,
  libreto: Libreto,
  terminal_step: { step_id: string; step_type: 'terminal_success' | 'terminal_failure' },
): TerminalDecision {
  return {
    kind: 'terminal',
    stream_id: input.event.stream_id,
    correlation_id: input.event.correlation_id,
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type: libreto.journey_type,
    step_id: terminal_step.step_id,
    outcome: terminal_step.step_type === 'terminal_success' ? 'success' : 'failure',
    libreto_version: libreto.version,
    caused_by_event_id: input.event.event_id,
  }
}

function buildNeedsJudgment(
  input: DecideInput,
  args: { reason: NeedsJudgmentReason; detail: string },
): NeedsJudgmentDecision {
  const journey_type = (input.journey_state.journey ??
    (input.event.journey_type as JourneyType | null)) as JourneyType | null
  const idempotency_inputs: IdempotencyInputs = {
    operation_type: `judgment.${args.reason}`,
    client_id: input.event.client_id,
    logical_period: input.event.stream_id,
  }
  return {
    kind: 'needs_judgment',
    stream_id: input.event.stream_id,
    correlation_id: input.event.correlation_id,
    tenant_id: input.event.tenant_id,
    client_id: input.event.client_id,
    journey_type,
    step_id: input.journey_state.current_step,
    reason: args.reason,
    detail: args.detail,
    idempotency_key: buildIdempotencyKey({
      operation_type: idempotency_inputs.operation_type,
      client_id: idempotency_inputs.client_id,
      logical_period: idempotency_inputs.logical_period,
    }),
    idempotency_inputs,
    caused_by_event_id: input.event.event_id,
  }
}

// =====================================================================
// Helpers
// =====================================================================

function buildIdempotencyInputs(
  input: DecideInput,
  libreto: Libreto,
  step: ActionStep,
): IdempotencyInputs {
  return {
    operation_type: `${libreto.journey_type}.${step.step_id}`,
    client_id: input.event.client_id,
    // The router uses stream_id as the logical_period for per-stream
    // operations · cron-triggered libretos can override by setting a
    // distinct logical_period in the trigger event's payload (consumed
    // by a future router enrichment hook · Mitad 2).
    logical_period: input.journey_state.stream_id,
  }
}

function stepTypeToGateType(
  step_type: 'gate_camino_iii' | 'gate_hitl' | 'gate_144',
): GateType {
  if (step_type === 'gate_camino_iii') return 'camino_iii'
  if (step_type === 'gate_hitl') return 'hitl'
  return '§144'
}
