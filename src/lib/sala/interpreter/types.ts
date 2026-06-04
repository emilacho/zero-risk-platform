/**
 * Libreto interpreter · types · Sprint 12 Fase 0 Ronda 3 Track G.
 *
 * The interpreter is the pure function set the router (Track H ·
 * CC#3) composes to evaluate libretos. Given a libreto (data · PR
 * #145) + the current event + the blackboard projection, the
 * interpreter answers · "what is the next step?".
 *
 * Design principle (§H-b · libretos = datos · NO lógica inline) ·
 * the libreto NEVER carries arbitrary code. Conditionals reference
 * NAMED predicates from a registry. Adding a new predicate is a
 * code change reviewed at commit time. The interpreter REJECTS
 * unknown predicate names (returns an explicit failure mode so the
 * router can surface `needs_judgment`).
 *
 * Spec source · zr-vault/00-meta/opus-4-8-traspaso/
 *               SALA-FASE0-ronda3-router.md (§4 Track G)
 * Insumo · libretos PR #145 (data layer) · Opus modelo §H-b
 * Frozen contract · PR #136 (executor-contract.ts)
 */
import type {
  ActionStep,
  ForkStep,
  GateStep,
  JoinStep,
  NextStepRef,
  Step,
  ValidationRules,
} from '../libretos/types'

// ─── Interpreter views over Event + Blackboard ───────────────────────
//
// The full event-log row (ADR-009 · 22 cols) and the full blackboard
// (Track D · CC#1 PR #144) are large. The interpreter only reads a
// minimal subset · these interfaces declare what it consumes. The
// router wires the real implementations (Tracks F + D + LOG) when
// they aterrize · the interpreter stays decoupled.

/** Read-only event view the interpreter consumes. */
export interface InterpreterEvent {
  readonly event_type: string
  readonly client_id: string
  /** Business payload of the event (e.g., agent output, classification
   *  result). Predicates read fields from here. */
  readonly payload: Record<string, unknown>
  /** Optional RUFLO classification on inbound triggers. */
  readonly classification?: {
    readonly kind?: string
    readonly fit?: 'high' | 'medium' | 'low' | string
    readonly recommendation?: 'reach_out' | 'nurture' | 'drop' | string
    readonly confidence?: number
    readonly [k: string]: unknown
  }
  /** Metadata · sequence, journey, current_step, etc. */
  readonly metadata?: Record<string, unknown>
}

/** Read-only blackboard view the interpreter consumes. Minimal
 *  interface · the full blackboard (Track D · CC#1) provides
 *  richer methods; the interpreter only needs key/value read. */
export interface InterpreterBlackboard {
  /** Return the value stored under `key`, or undefined. */
  read<T = unknown>(key: string): T | undefined
  /** Whether a value exists under `key`. */
  has(key: string): boolean
}

/** Context passed to every named predicate. */
export interface PredicateContext {
  readonly event: InterpreterEvent
  readonly blackboard: InterpreterBlackboard
}

// ─── Predicate · pure (event + blackboard) → boolean ────────────────

export type Predicate = (ctx: PredicateContext) => boolean

/** Registry of NAMED predicates. The libreto `when` field references
 *  entries here by name · the interpreter NEVER evaluates raw
 *  expressions. Production code uses the canonical registry; tests
 *  may build a fresh registry seeded with stubs. */
export interface PredicateRegistry {
  /** Check if a predicate name is registered. */
  has(name: string): boolean
  /** Evaluate a predicate by name. Returns the boolean result, or
   *  `undefined` when the name is not registered (caller surfaces
   *  the unknown-predicate failure mode). */
  evaluate(name: string, ctx: PredicateContext): boolean | undefined
  /** List all registered predicate names · for introspection +
   *  validation tooling. */
  list(): ReadonlyArray<string>
  /** Register a new predicate. Tests use this to add stubs ·
   *  production builds the registry once at boot from the canonical
   *  map and does NOT mutate at runtime. */
  register(name: string, fn: Predicate): void
}

// ─── Resolution results ──────────────────────────────────────────────
//
// Every interpreter call returns a tagged union. The router pattern-
// matches and emits the corresponding `Dispatch` to the event log.

/** Static-or-conditional next-step resolution result. */
export type NextStepRefResult =
  | { readonly ok: true; readonly next_step_id: string }
  | {
      readonly ok: false
      readonly reason: 'unknown_predicate'
      readonly predicate_name: string
    }
  | { readonly ok: false; readonly reason: 'unknown_step_ref'; readonly step_id: string }

/** Action-step resolution · the interpreter does NOT execute the
 *  action (that is the executor's job · PR #142). It returns where
 *  the router should dispatch + which agent. */
export type ActionResolution =
  | {
      readonly kind: 'dispatch'
      readonly agent_id: string
      readonly retry_budget: ActionStep['retry_budget']
      /** The step the router transitions to AFTER the action
       *  completes successfully · driven by next_step. The router
       *  computes this when it receives the step_completed event;
       *  the interpreter just surfaces the reference so the router
       *  can stash it. */
      readonly next_step: ActionStep['next_step']
    }
  | { readonly kind: 'unknown_step' }

/** Gate-step resolution · the interpreter declares the gate
 *  invocation the router posts to the log. The router emits
 *  `gate_pending` with this shape; later, a `gate_resolved` event
 *  flips the rama via `resolveGateOutcome`. */
export interface GateInvocation {
  readonly step_id: string
  readonly gate_type: GateStep['step_type']
  readonly gate_config: GateStep['gate_config']
  /** Next step on approve. */
  readonly next_step_on_approve: GateStep['next_step']
  /** Next step on reject (defaults to a synthetic terminal_failure
   *  if the libreto did not declare one). */
  readonly next_step_on_reject_id: string | null
  readonly description?: string
}

/** Gate-resolved outcome · the router calls this when a
 *  `gate_resolved` event lands. `approved=true` follows `next_step`;
 *  `approved=false` follows `next_step_rejected` if set, otherwise
 *  the libreto's terminal_failure is implied (interpreter returns a
 *  synthetic terminal). */
export type GateOutcomeResult =
  | { readonly ok: true; readonly next_step_id: string }
  | {
      readonly ok: false
      readonly reason: 'rejected_without_handler' | 'unknown_predicate' | 'unknown_step_ref'
      readonly predicate_name?: string
      readonly step_id?: string
    }

/** Fork-step resolution · the interpreter returns the parallel
 *  branches the router should dispatch (one per branch) + the
 *  step_id of the join that will gather them. */
export interface ForkResolution {
  readonly branches: ReadonlyArray<string>
  readonly join_at: string
}

/** Join-step resolution · whether all required branches have
 *  signalled completion (via the blackboard). Returns ready=true
 *  with next_step_id, or ready=false with the pending branch ids. */
export type JoinResolution =
  | {
      readonly ready: true
      readonly next_step_id: string
    }
  | {
      readonly ready: false
      readonly pending_branches: ReadonlyArray<string>
    }
  | {
      readonly ok: false
      readonly reason: 'unknown_predicate' | 'unknown_step_ref'
      readonly predicate_name?: string
      readonly step_id?: string
    }

/** Validation-rules result · pass + which fields, or fail + missing. */
export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly missing_fields: ReadonlyArray<string>
      readonly schema?: string
    }

// ─── Unified step resolution (router convenience) ───────────────────
//
// The router often just wants "what happens at this step right now"
// without caring about the step type. `resolveStep` dispatches to
// the appropriate per-type function and wraps the result in a single
// tagged union.

export type StepResolution =
  | { readonly kind: 'action'; readonly action: ActionResolution }
  | { readonly kind: 'gate'; readonly gate: GateInvocation }
  | { readonly kind: 'fork'; readonly fork: ForkResolution }
  | { readonly kind: 'join'; readonly join: JoinResolution }
  | {
      readonly kind: 'terminal'
      readonly outcome: 'success' | 'failure'
      readonly step_id: string
    }
  | {
      readonly kind: 'error'
      readonly reason: 'unknown_step' | 'unknown_predicate' | 'unknown_step_ref'
      readonly step_id?: string
      readonly predicate_name?: string
    }

// Re-export consumer-facing libreto types for callers that import
// from the interpreter module so they do not need a separate import
// line for the data types.
export type {
  ActionStep,
  ForkStep,
  GateStep,
  JoinStep,
  NextStepRef,
  Step,
  ValidationRules,
}
