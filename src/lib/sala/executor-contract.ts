/**
 * SalaExecutor · contract for the durable execution engine of the Sala
 * de Reunión (ADR-018 control plane).
 *
 * Purpose · abstract the durable executor so the orchestration logic
 * and the event-log schema (ADR-009) do NOT depend on a specific
 * runtime. Swapping the runtime should be a one-file change in the
 * adapter, zero changes elsewhere.
 *
 * Opus gate (Sprint 12 Fase 0 close) · LEAK-FREE · ZERO vendor type /
 * name / assumption may appear in this file. The mapping of how each
 * candidate runtime satisfies this contract lives in a separate doc,
 * not here.
 *
 * Spec source · zr-vault/00-meta/opus-4-8-traspaso/
 *               spec-CC4-salaexecutor-interface-contract.md
 * Mapping + leak-free verification ·
 *               docs/sala/CC4-salaexecutor-contract-deliverable-2026-06-01.md
 *
 * Build state · DOCUMENT + TYPES only. NO runtime implementation, NO
 * registration of handlers, NO wiring into the request path. Build of
 * the Sala happens after the event-log schema (ADR-009) is ACCEPTED
 * and the runtime spike confirms the runtime assumptions.
 */

// ─── 1 · Brand opaque identifiers ───────────────────────────────────
//
// Vendors carry their own native ids (function id + run id, workflow
// id + step id, etc). The Sala treats them as opaque strings: it
// stores them in the event-log for correlation, never parses them
// nor infers structure. Branded types prevent accidental mixing.

/** Opaque handle to a durable execution. The Sala persists this in the
 *  event-log to correlate later status queries with the original
 *  enqueue. Implementation may compose multiple vendor ids inside —
 *  irrelevant to callers. */
export type DurableRunId = string & { readonly __brand: "DurableRunId" }

/** Opaque handle to a single step within a durable run. Used for
 *  correlating event-log entries with a specific step boundary. */
export type DurableStepId = string & { readonly __brand: "DurableStepId" }

/** Idempotency key · computed by OUR layer from business identity, NOT
 *  by the durable engine. See `computeIdempotencyKey` below for the
 *  canonical derivation. The brand makes it impossible to pass a raw
 *  string by accident, forcing the caller through the deriver. */
export type IdempotencyKey = string & { readonly __brand: "IdempotencyKey" }

// ─── 2 · Public status vocabulary ───────────────────────────────────
//
// Each vendor exposes its own internal state machine. This interface
// requires implementations to map their native states to this neutral
// six-state vocabulary. The Sala only reasons about these six.

export type DurableRunStatus =
  /** Accepted by the executor, not yet started. */
  | "queued"
  /** Actively executing (or a step is). */
  | "running"
  /** Suspended awaiting an external event, timer, or HITL signal. */
  | "waiting"
  /** Finished successfully. */
  | "completed"
  /** Terminal failure after retries exhausted. */
  | "failed"
  /** Cancelled by an external call to `cancel`. */
  | "cancelled"

// ─── 3 · Retry policy (explicit contract method input) ──────────────
//
// Per Opus gate · retry is an EXPLICIT contract concern, not implicit.
// The interface defines a small policy shape; each implementation
// adapts it to its native runtime knobs. The retry algorithm itself
// is opaque to callers — only the policy ceiling matters at the
// contract level.

export interface RetryPolicy {
  /** Total attempts including the first try. `maxAttempts === 1` means
   *  no retries; `maxAttempts === 3` means initial + 2 retries. Must
   *  be ≥ 1. */
  readonly maxAttempts: number

  /** Floor for the first retry delay, milliseconds. The implementation
   *  may apply exponential growth and jitter on top, capped by
   *  `maxBackoffMs`. */
  readonly initialBackoffMs: number

  /** Ceiling for any retry delay, milliseconds. Prevents unbounded
   *  exponential growth in pathological cases. */
  readonly maxBackoffMs: number
}

// ─── 4 · Execution input ────────────────────────────────────────────
//
// Carries the business identity (operation + client + period) that
// drives idempotency, plus the arbitrary payload that the durable
// function will receive. The Sala enforces idempotency BEFORE calling
// enqueue — by the time we hit the executor, the key is already a
// computed business hash, not a vendor-generated technical id.

export interface ExecutionInput<TPayload = unknown> {
  /** Logical operation type, dot-separated namespace. Example ·
   *  "campaign.create_brief". Forms part of the idempotency key. */
  readonly operationType: string

  /** Target tenant/client. Forms part of the idempotency key. */
  readonly clientId: string

  /** Logical period or cause identifier. Forms part of the idempotency
   *  key. Examples · ISO week "2026-W23" for periodic ops, ULID
   *  "manual-trigger-{ulid}" for ad-hoc, or campaign id for per-
   *  campaign ops. The KEY POINT (Opus Q2 ADR-009 ronda 1) is that
   *  THIS is the field whose presence/absence decides whether two
   *  triggers collapse or duplicate — so the Sala must choose it with
   *  business semantics in mind, NOT mechanical timestamps. */
  readonly logicalPeriod: string

  /** Business payload handed to the durable function as-is. Opaque to
   *  the executor. */
  readonly payload: TPayload

  /** Idempotency key derived from {operationType, clientId,
   *  logicalPeriod} by `computeIdempotencyKey`. REQUIRED · forcing it
   *  in the type system prevents the entire class of "I forgot the
   *  key and the vendor used a per-call uuid → no dedup" bugs that
   *  caused the 24-may daemon burst. */
  readonly idempotencyKey: IdempotencyKey
}

// ─── 5 · Step API · passed to durable functions ─────────────────────
//
// The step primitive is the resumable unit: when the function crashes
// and is replayed, completed steps return their persisted result
// without re-executing. Sleep + waitForEvent are durable variants of
// JS primitives that survive crashes and run-quiescent waits.
//
// Step names are stable identifiers within a run; the executor uses
// them to dedupe completed steps on replay. Callers must pick names
// that are unique within their function body and stable across
// deploys (NEVER include a timestamp or random in the name).

export interface StepRunner {
  /** Run a function as a durable step. On replay, returns the
   *  previously-persisted result without invoking `fn` again. Step
   *  name must be unique within the enclosing durable function. */
  run<T>(stepName: string, fn: () => Promise<T>): Promise<T>

  /** Durable sleep · suspends execution. The run is freed from compute
   *  during the wait and resumed when the timer fires. Survives
   *  redeploys of the worker. */
  sleep(stepName: string, durationMs: number): Promise<void>

  /** Wait durably for an external event posted to the Sala that
   *  matches `eventName` (and optional `filter` predicate). Returns
   *  the matched event payload, or `null` if `timeoutMs` elapses
   *  first.
   *
   *  `timeoutMs: null` means wait indefinitely · but the Sala's
   *  anti-"reunión eterna" rule (ADR-018) caps practical lifetimes
   *  to 7 days at the orchestration level, not here. */
  waitForEvent<TEvent = unknown>(
    stepName: string,
    eventName: string,
    options: {
      readonly timeoutMs: number | null
      readonly filter?: (event: TEvent) => boolean
    },
  ): Promise<TEvent | null>
}

// ─── 6 · Durable function shape ─────────────────────────────────────

/** A user-defined durable function. Receives the business payload and
 *  the step API, returns the final output. The executor guarantees
 *  durability, retry, and step-level replay. */
export type DurableFunction<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  step: StepRunner,
) => Promise<TOutput>

// ─── 7 · The contract ───────────────────────────────────────────────

export interface SalaExecutor {
  /** Register a durable function as the handler for an `operationType`.
   *  Idempotent · calling twice with the same `operationType` replaces
   *  the handler (last write wins). Registration is a startup-time
   *  concern; the Sala registers all handlers at boot.
   *
   *  The `retry` policy is part of the handler config (not per-call) ·
   *  every run of this operation uses the same retry shape. Per-call
   *  retry overrides are an optimisation deferred until proven needed. */
  register<TInput, TOutput>(
    operationType: string,
    fn: DurableFunction<TInput, TOutput>,
    options: { readonly retry: RetryPolicy },
  ): void

  /** Enqueue a durable execution.
   *
   *  IDEMPOTENCY GUARANTEE · if an `ExecutionInput` with the same
   *  `idempotencyKey` has been enqueued before AND not yet in a
   *  terminal failed/cancelled state, this call returns the existing
   *  `DurableRunId` and does NOT create a duplicate run. The
   *  enforcement mechanism (database unique constraint on an
   *  `outbound_intents` table · check-then-act in the same
   *  transaction · etc) lives in the implementation — but it is OUR
   *  layer, not a vendor-supplied dedup that might fail silently when
   *  the vendor changes behaviour.
   *
   *  DURABILITY GUARANTEE · once this method resolves, the execution
   *  is persisted in the durable store of the implementation. A crash
   *  of the calling process after this point does NOT lose the
   *  scheduled work. */
  enqueue<TInput>(input: ExecutionInput<TInput>): Promise<DurableRunId>

  /** Query the public status of a run. Implementations map their
   *  native state machine to `DurableRunStatus`. */
  getStatus(runId: DurableRunId): Promise<DurableRunStatus>

  /** Cancel a queued or running execution. Idempotent · cancelling a
   *  run that is already in a terminal state (completed, failed,
   *  cancelled) is a no-op and resolves successfully. */
  cancel(runId: DurableRunId): Promise<void>
}

// ─── 8 · Health probe · auxiliary, separate from the contract ───────
//
// Kept as a sibling interface (not a method on SalaExecutor) so the
// main contract remains tight. Monitoring code that needs liveness
// of the durable engine asks for SalaExecutorHealth specifically.

export interface SalaExecutorHealth {
  /** Liveness probe of the durable engine. Returns latency on success;
   *  throws / rejects on engine unreachable. */
  ping(): Promise<{ readonly ok: boolean; readonly latencyMs: number }>
}

// ─── 9 · Idempotency key derivation · OUR layer, canonical ──────────
//
// This function is the SINGLE place the Sala computes idempotency
// keys. It is NOT a method on the executor — it is a pure utility
// that lives in our codebase, deliberately separated from any
// implementation, so that swapping the executor cannot change the
// hashing behaviour. If this function changes, EVERY caller is
// affected uniformly.
//
// The derivation MUST be deterministic across processes, deploys, and
// machines. SHA-256 of the canonical "{operationType}|{clientId}|
// {logicalPeriod}" string, hex-encoded · cheap, collision-resistant,
// vendor-neutral. Truncation to a prefix is an implementation
// optimisation deferred · full hash is the safe default.
//
// The implementation body lives in a sibling file
// (`./idempotency-key.ts` · NOT created in this dispatch — types
// only per spec "NO build"). The signature here documents the
// contract that the Sala depends on.

export interface IdempotencyKeyDeriver {
  /** Derive the canonical key from business identity. Pure ·
   *  deterministic · zero IO. */
  derive(parts: {
    readonly operationType: string
    readonly clientId: string
    readonly logicalPeriod: string
  }): IdempotencyKey
}
