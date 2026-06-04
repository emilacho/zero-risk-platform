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

// ─── 3b · Budget policy (Opus §H-d · 5th pecado · CAP convergence) ──
//
// Per Opus stress-test ronda 1 §H (d) · the cap is MORE essential
// in the Sala than in the daemon (cascades + fan-out gates create
// more amplification surface than flat polling). Idempotency stops
// duplicate work; only the budget stops a legitimate-but-runaway
// cascade.
//
// The interface exposes the GUARANTEE that a registered handler can
// be capped; the enforcement mechanism (atomic counter against the
// G6 `rate_limit_buckets` table via `increment_bucket_atomic` RPC)
// lives in the implementation, NOT in the durable runtime. The cap
// remains in OUR layer — same architectural choice as idempotency-
// in-our-layer (Q2 ADR-009).
//
// Two granularities exposed · per-run cost ceiling, per-run step
// count ceiling. Either is optional; absence means unbounded at the
// contract level (orchestration layer is free to enforce a default
// via lint or by always passing a policy).

export interface BudgetPolicy {
  /** Identifier of the `rate_limit_buckets` row (or equivalent) that
   *  the implementation atomically increments. Matches the G6
   *  `bucket_key` column shape. */
  readonly bucketKey: string

  /** Maximum cumulative cost (USD) one run of this handler may
   *  spend before the implementation aborts further steps. Absent
   *  means no per-run cost cap (the bucket may still have a window
   *  cap enforced externally). */
  readonly maxCostPerRunUsd?: number

  /** Maximum number of `step.run` calls one run of this handler may
   *  execute before the implementation aborts further steps. Absent
   *  means no per-run step cap. */
  readonly maxStepsPerRun?: number
}

/** Result of a budget check at a step boundary. Implementations call
 *  the G6 atomic-increment RPC; if the bucket is exhausted the
 *  result carries `ok: false` with a reason and the executor aborts
 *  the step.
 *
 *  This shape is consumed by `BudgetHook.checkAndIncrement` (see
 *  `src/lib/sala/budget-hook.ts`). The contract exposes the SHAPE
 *  only; binding to the actual G6 RPC happens at executor wire-up
 *  time (post-#8 freeze · §144 Emilio). */
export interface BudgetCheckResult {
  readonly ok: boolean
  readonly bucketKey: string
  readonly remainingCostUsd?: number
  readonly remainingSteps?: number
  readonly reason?: string
}

// ─── 4 · Logical period (Opus #7 Q5 freeze · typed union) ───────────
//
// The logical period drives idempotency · it is THE field whose
// presence/absence decides whether two triggers collapse or
// duplicate. A free `string` here was the original recommendation
// (deferred-narrowing); Opus #7 rejected that path with a security
// rationale · a free string lets a caller pass a timestamp or an
// execution_id by accident, producing a unique period per call,
// which makes idempotency a no-op and re-creates the 24-may $19
// burst silently.
//
// The closed-discriminant union below FORCES the caller to choose
// one of the known kinds; the `custom` variant keeps the catalogue
// extensible without freezing it, but requires an explicit `note`
// so a reviewer can audit why the canonical kinds did not fit.
//
// Adding a new kind = additive change to this union + an updated
// catalogue review · NOT a string lint rule that can drift. The
// lint/checklist remains a defence-in-depth but is no longer the
// only barrier.

export type LogicalPeriod =
  /** ISO week, e.g. `"2026-W23"`. Use for weekly periodic operations
   *  (weekly report, weekly cron). */
  | { readonly kind: 'iso_week'; readonly value: string }
  /** ISO month, e.g. `"2026-06"`. Use for monthly periodic
   *  operations (QBR build, monthly billing). */
  | { readonly kind: 'iso_month'; readonly value: string }
  /** ISO date, e.g. `"2026-06-02"`. Use for daily operations or
   *  one-off scheduled events tied to a calendar day. */
  | { readonly kind: 'iso_date'; readonly value: string }
  /** Campaign identifier, e.g. `"camp-7f3a"`. Use for per-campaign
   *  operations (create brief, run audit) where the campaign is
   *  the natural idempotency boundary. */
  | { readonly kind: 'campaign_id'; readonly value: string }
  /** Manual / ad-hoc trigger ULID, e.g. `"01HQX..."`. Use when the
   *  triggering event itself is the idempotency boundary (one user
   *  click = one ULID = one logical operation). */
  | { readonly kind: 'trigger_ulid'; readonly value: string }
  /** Escape hatch for periods that do not fit the canonical kinds
   *  above. REQUIRES `note` · a short human explanation so
   *  reviewers can audit whether a new canonical kind should be
   *  added. The `note` is METADATA · it does NOT participate in
   *  the idempotency key (two `custom` periods with the same value
   *  and different notes still collapse to the same key). */
  | { readonly kind: 'custom'; readonly value: string; readonly note: string }

// ─── 5 · Execution input ────────────────────────────────────────────
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

  /** Logical period or cause identifier · the kind+value pair that
   *  decides whether two triggers collapse or duplicate. See
   *  `LogicalPeriod` above for the closed catalogue + the `custom`
   *  escape hatch. This field is the load-bearing business-identity
   *  axis of the idempotency key (Opus #7 Q5 freeze). */
  readonly logicalPeriod: LogicalPeriod

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
    options: {
      readonly retry: RetryPolicy
      /** Optional per-handler budget cap. When present, the
       *  implementation enforces this cap at step boundaries via the
       *  atomic counter (G6 `rate_limit_buckets.increment_bucket_atomic`).
       *  Absent means no per-run cap from this layer · external
       *  window-based caps may still apply.
       *
       *  Opus §H-d (5th pecado · CAP convergence) · the cap is more
       *  essential in the Sala than in the daemon because cascades +
       *  fan-out gates amplify a single trigger into many legitimate
       *  dispatches. Idempotency stops duplicates; only this stops a
       *  legitimate runaway. */
      readonly budget?: BudgetPolicy
    },
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
   *  deterministic · zero IO.
   *
   *  The `logicalPeriod` is typed as the discriminated union (Opus
   *  #7 Q5 freeze) · the implementation serialises both `kind` and
   *  `value` into the canonical hashed string. Two `custom` periods
   *  with the same `value` and different `note` fields produce the
   *  same key (the `note` is metadata, not identity · see
   *  `LogicalPeriod` for the rationale). */
  derive(parts: {
    readonly operationType: string
    readonly clientId: string
    readonly logicalPeriod: LogicalPeriod
  }): IdempotencyKey
}
