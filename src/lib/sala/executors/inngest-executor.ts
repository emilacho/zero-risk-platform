/**
 * InngestExecutor · Motor Mitad 1 (CÓDIGO) · Sprint 12 Fase 0 Track B.
 *
 * In-memory durable executor against the frozen `SalaExecutor`
 * contract. Implements the runtime semantics the spike (RESULTS-CC3-
 * inngest-runtime-verify.md) proved against the real Inngest SDK ·
 * `step.run` memoisation that survives retries · idempotency
 * deduplication in OUR layer by business key · retry policy with
 * exponential backoff capped + dead-letter queue · budget hook seam
 * at every step boundary (G6 atomic bucket binding).
 *
 * Per master plan SALA-FASE0-build-3-capas Track B · this file is
 * **Mitad 1 = CÓDIGO ÚNICAMENTE**. Concretely ·
 * - NO `import { Inngest } from 'inngest'` · the SDK is NOT a repo
 *   dep yet · the in-memory runtime simulates the semantics for
 *   dev + test
 * - NO deploy · NO wire to a live G6 `rate_limit_buckets` RPC · NO
 *   row in any prod table · NO request-path wiring
 * - **Mitad 2** (real Inngest SDK install + Supabase G6 budget hook
 *   binding + `outbound_intents` table persistence + prod deploy) =
 *   §144 Emilio sequenced WITH the router build (master plan §C)
 *
 * What this file DOES express ·
 * - Every SalaExecutor contract method implemented end-to-end
 *   (register / enqueue / execute / getStatus / cancel)
 * - `step.run` memoisation across retry attempts (matches Inngest
 *   spike §2.2 · the load-bearing durability primitive)
 * - Idempotency deduplication keyed by business identity (Q2 ADR-009)
 * - Retry policy enforcement · maxAttempts cap + exponential backoff
 *   capped by maxBackoffMs · same shape as Inngest `retries:` config
 * - Budget hook called at every step (G6 binding seam) · throws
 *   `BudgetExhaustedError` surfaces as step failure · subject to
 *   retry policy
 * - Local `maxStepsPerRun` enforcement at the executor layer
 * - Dead-letter queue · runs that exhaust retries land here for
 *   forensics with full attempt history
 *
 * What this file DOES NOT do (Mitad 2 territory) ·
 * - Wire to the real Inngest SDK runtime
 * - Bind the BudgetHook to the real Supabase RPC
 *   `rate_limit_buckets.increment_bucket_atomic`
 * - Persist runs / dedup index / dead-letter to any database
 * - Real `step.waitForEvent` (in-memory motor stubs this · the spike
 *   §2.3 proved Inngest's native primitive works · Mitad 2 will use it)
 *
 * Spec source · zr-vault/00-meta/opus-4-8-traspaso/
 *               SALA-FASE0-build-3-capas-master-plan.md (Track B)
 * Frozen contract · PR #136 merged 2026-06-02 · commit e649f323
 * Skeleton ancestor · PR #140 (this file evolves the skeleton in place)
 * Patterns reflected · RESULTS-CC3-inngest-runtime-verify.md (3 runs ·
 *                      21 trace lines · durability + idempotency
 *                      CONFIRMED runtime)
 */
import type {
  BudgetPolicy,
  DurableFunction,
  DurableRunId,
  DurableRunStatus,
  ExecutionInput,
  RetryPolicy,
  SalaExecutor,
  StepRunner,
} from '../executor-contract'
import {
  BudgetExhaustedError,
  noopBudgetHook,
  type BudgetHook,
} from '../budget-hook'

// The BudgetHook is intentionally a VENDOR-NEUTRAL seam (lives at
// `src/lib/sala/budget-hook.ts` · NOT under `executors/`) so every
// executor implementation consumes the same hook to wire into the
// G6 `rate_limit_buckets.increment_bucket_atomic` RPC. The motor
// here just CONSUMES it; the real binding (a SupabaseG6BudgetHook
// or similar) lives wherever the real wire-up runs (Mitad 2 · §144).

// Re-exports for backward compatibility with prior import paths.
// Future callers should import from `../budget-hook` directly.
export { BudgetExhaustedError, noopBudgetHook, type BudgetHook }

// ─── Internal types ─────────────────────────────────────────────────

interface RegisteredHandler {
  readonly operationType: string
  readonly fn: DurableFunction<unknown, unknown>
  readonly retry: RetryPolicy
  readonly budget?: BudgetPolicy
}

/** Per-attempt audit record · captured for forensics + dead-letter
 *  trace. Mitad 2 will mirror these to the event-log (ADR-009). */
export interface AttemptRecord {
  readonly attempt: number
  readonly startedAt: number
  readonly endedAt: number
  readonly status: 'completed' | 'failed' | 'budget_exhausted'
  readonly error?: string
}

interface RunRecord {
  readonly runId: DurableRunId
  readonly idempotencyKey: string
  status: DurableRunStatus
  readonly operationType: string
  readonly clientId: string
  readonly enqueuedAt: number
  /** Original input · kept so `execute` can re-run with the payload. */
  readonly input: ExecutionInput<unknown>
  /** Current attempt count (1-indexed · 0 before first attempt). */
  attempt: number
  /** Append-only attempt history · forensics-ready. */
  readonly attempts: AttemptRecord[]
  /** Memoised results keyed by step name. SURVIVES retry attempts ·
   *  this is the durability primitive that makes the motor "durable"
   *  (matches Inngest `step.run` semantics · spike §2.2). */
  readonly stepResults: Map<string, unknown>
  /** Final output (only set when status === 'completed'). */
  output?: unknown
  /** Last error message · for cancel mid-flight / dead-letter trace. */
  lastError?: string
}

/** Dead-letter entry · run that exhausted all retry attempts. The
 *  router consumes this queue to decide whether to escalate (HITL /
 *  Slack ping / silently drop). Mitad 2 will persist this. */
export interface DeadLetterEntry {
  readonly runId: DurableRunId
  readonly operationType: string
  readonly clientId: string
  readonly idempotencyKey: string
  readonly attempts: ReadonlyArray<AttemptRecord>
  readonly finalError: string
  readonly deadLetteredAt: number
}

// ─── Options + constructor ──────────────────────────────────────────

export interface InngestExecutorOptions {
  /** Hook to the G6 atomic counter. Default · `noopBudgetHook`
   *  (always ok=true). Mitad 2 wire-up replaces this with an
   *  implementation that calls `rate_limit_buckets.increment_bucket_atomic`
   *  via Supabase. */
  readonly budgetHook?: BudgetHook
  /** Override the run-id factory. Default · `run-<random>`. Tests
   *  may inject a counter-based factory for deterministic output. */
  readonly generateRunId?: () => string
  /** Override the sleep primitive used between retry attempts. Default
   *  · `setTimeout`-backed Promise. Tests may inject a no-op to skip
   *  backoff delays without needing fake timers. */
  readonly sleep?: (ms: number) => Promise<void>
  /** Clock source for timestamps · default `Date.now`. Tests may
   *  inject a monotonic counter for stable trace output. */
  readonly now?: () => number
}

// ─── The motor ──────────────────────────────────────────────────────

/**
 * InngestExecutor · in-memory motor implementation against the frozen
 * SalaExecutor contract. Mitad 1 = CÓDIGO únicamente.
 *
 * The real Inngest wiring (Mitad 2) will replace this in-process
 * runtime with the SDK · `inngest.createFunction({ id: operationType,
 * retries: retry.maxAttempts - 1, triggers: [{ event: operationType }] },
 * async ({ event, step }) => fn(event.data, adaptStep(step)))` for
 * registration · `inngest.send({ name: input.operationType, data:
 * { ...input.payload, idempotencyKey: input.idempotencyKey }, id:
 * input.idempotencyKey })` for enqueue. The semantics implemented here
 * are the contract that wire-up must preserve.
 */
export class InngestExecutor implements SalaExecutor {
  private readonly budgetHook: BudgetHook
  private readonly generateRunId: () => string
  private readonly sleepImpl: (ms: number) => Promise<void>
  private readonly nowImpl: () => number
  private readonly handlers = new Map<string, RegisteredHandler>()
  private readonly runs = new Map<DurableRunId, RunRecord>()
  /** idempotencyKey → DurableRunId · the OUR-layer dedup table.
   *  Mitad 2 will back this with `outbound_intents` (ADR-009 §3
   *  outbound dedup table) via a unique constraint. */
  private readonly idempotencyIndex = new Map<string, DurableRunId>()
  /** Dead-letter queue · runs that exhausted retry attempts. */
  private readonly deadLetterQueue: DeadLetterEntry[] = []

  constructor(options: InngestExecutorOptions = {}) {
    this.budgetHook = options.budgetHook ?? noopBudgetHook
    this.generateRunId =
      options.generateRunId ??
      (() => `run-${Math.random().toString(36).slice(2, 12)}`)
    this.sleepImpl =
      options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    this.nowImpl = options.now ?? (() => Date.now())
  }

  // ─── SalaExecutor contract ──────────────────────────────────────

  register<TInput, TOutput>(
    operationType: string,
    fn: DurableFunction<TInput, TOutput>,
    options: { readonly retry: RetryPolicy; readonly budget?: BudgetPolicy },
  ): void {
    if (!operationType || operationType.trim().length === 0) {
      throw new Error('register · operationType must be a non-empty string')
    }
    if (options.retry.maxAttempts < 1) {
      throw new Error('register · retry.maxAttempts must be >= 1')
    }
    if (options.retry.initialBackoffMs < 0 || options.retry.maxBackoffMs < 0) {
      throw new Error('register · retry backoff values must be >= 0')
    }
    if (options.retry.maxBackoffMs < options.retry.initialBackoffMs) {
      throw new Error(
        'register · retry.maxBackoffMs must be >= retry.initialBackoffMs',
      )
    }
    this.handlers.set(operationType, {
      operationType,
      fn: fn as DurableFunction<unknown, unknown>,
      retry: options.retry,
      budget: options.budget,
    })
  }

  async enqueue<TInput>(input: ExecutionInput<TInput>): Promise<DurableRunId> {
    if (!input.idempotencyKey) {
      throw new Error(
        'enqueue · ExecutionInput.idempotencyKey is required · derive via canonicalIdempotencyKeyDeriver before calling',
      )
    }
    const handler = this.handlers.get(input.operationType)
    if (!handler) {
      throw new Error(
        `enqueue · no handler registered for operationType "${input.operationType}"`,
      )
    }

    const existing = this.idempotencyIndex.get(input.idempotencyKey)
    if (existing) {
      const record = this.runs.get(existing)
      if (record && record.status !== 'failed' && record.status !== 'cancelled') {
        // Dedup hit · return existing runId, do NOT create a duplicate.
        // Mitad 2 will log a `dispatch_deduped` event to the event-log
        // (per Opus #7 Q2 closure · ADR-009 enum addition).
        return existing
      }
    }

    const runId = this.generateRunId() as DurableRunId
    this.runs.set(runId, {
      runId,
      idempotencyKey: input.idempotencyKey,
      status: 'queued',
      operationType: input.operationType,
      clientId: input.clientId,
      enqueuedAt: this.nowImpl(),
      input: input as ExecutionInput<unknown>,
      attempt: 0,
      attempts: [],
      stepResults: new Map(),
    })
    this.idempotencyIndex.set(input.idempotencyKey, runId)
    return runId
  }

  async getStatus(runId: DurableRunId): Promise<DurableRunStatus> {
    const record = this.runs.get(runId)
    if (!record) {
      throw new Error(`getStatus · unknown runId "${runId}"`)
    }
    return record.status
  }

  async cancel(runId: DurableRunId): Promise<void> {
    const record = this.runs.get(runId)
    if (!record) {
      // Cancel of an unknown run is a no-op per contract (idempotent).
      return
    }
    if (
      record.status === 'completed' ||
      record.status === 'failed' ||
      record.status === 'cancelled'
    ) {
      return
    }
    record.status = 'cancelled'
  }

  // ─── Runtime · execute + StepRunner ─────────────────────────────

  /**
   * Drive a queued or running execution to completion (or terminal
   * failure). Runs the registered handler with a memoising StepRunner;
   * applies the retry policy with exponential backoff on transient
   * failures; pushes to the dead-letter queue when retries are
   * exhausted.
   *
   * In the real Inngest wiring (Mitad 2), this loop lives inside the
   * Inngest runtime · execute is fire-and-forget on enqueue. Here in
   * Mitad 1, the caller drives `execute` explicitly so tests can
   * deterministically observe outcomes.
   *
   * Idempotent on terminal states · calling execute on a completed,
   * failed, or cancelled run is a no-op.
   */
  async execute(runId: DurableRunId): Promise<void> {
    const record = this.runs.get(runId)
    if (!record) {
      throw new Error(`execute · unknown runId "${runId}"`)
    }
    if (
      record.status === 'completed' ||
      record.status === 'failed' ||
      record.status === 'cancelled'
    ) {
      return
    }
    const handler = this.handlers.get(record.operationType)
    if (!handler) {
      throw new Error(
        `execute · no handler registered for "${record.operationType}"`,
      )
    }

    while (record.attempt < handler.retry.maxAttempts) {
      // Cancellation check between attempts.
      if ((record.status as DurableRunStatus) === 'cancelled') return

      record.attempt++
      record.status = 'running'

      const attemptStarted = this.nowImpl()
      try {
        const stepRunner = this.buildStepRunner(record, handler)
        const output = await handler.fn(record.input.payload, stepRunner)
        record.status = 'completed'
        record.output = output
        record.attempts.push({
          attempt: record.attempt,
          startedAt: attemptStarted,
          endedAt: this.nowImpl(),
          status: 'completed',
        })
        return
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const isBudget = err instanceof BudgetExhaustedError
        record.lastError = errMsg
        record.attempts.push({
          attempt: record.attempt,
          startedAt: attemptStarted,
          endedAt: this.nowImpl(),
          status: isBudget ? 'budget_exhausted' : 'failed',
          error: errMsg,
        })

        // Cancellation can also fire from another async path (e.g.,
        // user clicks cancel between attempts) · honour it before any
        // backoff sleep.
        if ((record.status as DurableRunStatus) === 'cancelled') return

        // Backoff before the next attempt, if any.
        if (record.attempt < handler.retry.maxAttempts) {
          const backoffMs = this.computeBackoff(
            handler.retry,
            record.attempt,
          )
          if (backoffMs > 0) {
            await this.sleepImpl(backoffMs)
          }
        }
      }
    }

    // All attempts exhausted · transition to failed + dead-letter.
    record.status = 'failed'
    this.deadLetterQueue.push({
      runId,
      operationType: record.operationType,
      clientId: record.clientId,
      idempotencyKey: record.idempotencyKey,
      attempts: [...record.attempts],
      finalError: record.lastError ?? 'unknown error',
      deadLetteredAt: this.nowImpl(),
    })
  }

  /** Drain all currently queued runs serially. Convenience for tests +
   *  the future in-memory dev mode of the router · production Inngest
   *  runtime will not call this. */
  async executeAll(): Promise<void> {
    const queued: DurableRunId[] = []
    for (const [runId, record] of this.runs) {
      if (record.status === 'queued') queued.push(runId)
    }
    for (const runId of queued) {
      await this.execute(runId)
    }
  }

  // ─── Step runner factory · the per-run primitive ────────────────

  private buildStepRunner(
    record: RunRecord,
    handler: RegisteredHandler,
  ): StepRunner {
    const self = this
    return {
      async run<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
        // Memoisation · returns the previously persisted result
        // without re-executing. Survives retry attempts (the
        // load-bearing durability primitive).
        if (record.stepResults.has(stepName)) {
          return record.stepResults.get(stepName) as T
        }

        // Budget hook · the G6 binding seam. Called BEFORE running
        // the step body so an exhausted bucket blocks the step
        // before any side-effect.
        if (handler.budget) {
          const budgetResult = await self.budgetHook.checkAndIncrement(
            handler.budget.bucketKey,
          )
          if (!budgetResult.ok) {
            throw new BudgetExhaustedError(budgetResult)
          }
        }

        // Local maxStepsPerRun enforcement · the executor layer cap.
        // Counts unique step names invoked on this run · memoised
        // steps from prior attempts do NOT count again (they
        // short-circuited above).
        if (
          handler.budget?.maxStepsPerRun !== undefined &&
          record.stepResults.size >= handler.budget.maxStepsPerRun
        ) {
          throw new BudgetExhaustedError({
            ok: false,
            bucketKey: handler.budget.bucketKey,
            reason: `maxStepsPerRun ${handler.budget.maxStepsPerRun} exceeded`,
          })
        }

        const result = await fn()
        record.stepResults.set(stepName, result)
        return result
      },

      async sleep(stepName: string, durationMs: number): Promise<void> {
        if (record.stepResults.has(stepName)) return
        // In-memory dev · real-time sleep using the injectable
        // sleep impl. Tests can stub this to zero for fast runs.
        if (durationMs > 0) {
          await self.sleepImpl(durationMs)
        }
        record.stepResults.set(stepName, null)
      },

      async waitForEvent<TEvent = unknown>(
        stepName: string,
        eventName: string,
        _options: {
          readonly timeoutMs: number | null
          readonly filter?: (event: TEvent) => boolean
        },
      ): Promise<TEvent | null> {
        // Mitad 1 in-memory motor · the spike §2.3 proved Inngest's
        // native `step.waitForEvent` works · Mitad 2 will bind to it.
        // Here we honour memoisation only (if a previous attempt
        // resolved the wait, return that value).
        if (record.stepResults.has(stepName)) {
          return record.stepResults.get(stepName) as TEvent | null
        }
        throw new Error(
          `waitForEvent('${stepName}', '${eventName}') · NOT IMPLEMENTED in Mitad 1 (in-memory motor) · Mitad 2 binds to Inngest SDK · §144 separated`,
        )
      },
    }
  }

  private computeBackoff(retry: RetryPolicy, completedAttempt: number): number {
    // completedAttempt is 1-indexed · after attempt 1 the backoff
    // before attempt 2 is `initial * 2^0 = initial`; after attempt 2
    // it's `initial * 2^1`; etc. Capped at maxBackoffMs.
    const exponent = Math.max(0, completedAttempt - 1)
    const raw = retry.initialBackoffMs * Math.pow(2, exponent)
    return Math.min(raw, retry.maxBackoffMs)
  }

  // ─── Public accessors ───────────────────────────────────────────

  /** Dead-letter queue read accessor · ordered by insertion. The
   *  router (Mitad 2) will consume this to decide escalation. */
  getDeadLetterQueue(): ReadonlyArray<DeadLetterEntry> {
    return this.deadLetterQueue
  }

  /** Drain the dead-letter queue · returns the entries and clears
   *  internal storage. The Sala router will use this for periodic
   *  archival + escalation triage. */
  drainDeadLetterQueue(): DeadLetterEntry[] {
    const items = this.deadLetterQueue.splice(0, this.deadLetterQueue.length)
    return items
  }

  /** Read-only inspection of attempt history for a run · forensics. */
  getAttemptHistory(runId: DurableRunId): ReadonlyArray<AttemptRecord> {
    const record = this.runs.get(runId)
    if (!record) return []
    return record.attempts
  }

  /** Read the final output of a completed run · undefined if not
   *  completed. */
  getOutput(runId: DurableRunId): unknown {
    const record = this.runs.get(runId)
    return record?.output
  }

  // ─── Test-only helpers ───────────────────────────────────────────

  /** Test-only · inspect the registered handler for an operationType.
   *  The real Inngest wiring will not expose this. */
  getRegisteredHandler(operationType: string): RegisteredHandler | undefined {
    return this.handlers.get(operationType)
  }

  /** Test-only · force a run into the `completed` terminal state
   *  without invoking the handler. Useful for asserting cancel
   *  idempotency on terminal states. */
  markCompleted(runId: DurableRunId): void {
    const record = this.runs.get(runId)
    if (record && record.status !== 'cancelled') {
      record.status = 'completed'
    }
  }

  /** Test-only · invoke the budget hook directly with the registered
   *  budget policy. Demonstrates the wiring seam without driving a
   *  full run. Throws `BudgetExhaustedError` if the hook returns
   *  ok=false. */
  async checkBudgetForOperation(
    operationType: string,
    estimatedCostUsd?: number,
  ): Promise<import('../executor-contract').BudgetCheckResult> {
    const handler = this.handlers.get(operationType)
    if (!handler) {
      throw new Error(
        `checkBudgetForOperation · no handler registered for "${operationType}"`,
      )
    }
    if (!handler.budget) {
      return { ok: true, bucketKey: '(no-budget-policy)' }
    }
    const result = await this.budgetHook.checkAndIncrement(
      handler.budget.bucketKey,
      estimatedCostUsd,
    )
    if (!result.ok) {
      throw new BudgetExhaustedError(result)
    }
    return result
  }
}
