/**
 * InngestExecutor · skeleton implementation of SalaExecutor.
 *
 * This file is a SKELETON · structure, types, and the contract-binding
 * shape are locked. The wires to the real Inngest SDK + the G6
 * atomic-increment RPC are stubs that throw or return safe defaults.
 * Final wiring waits for ·
 *   (1) Opus gate #7 closure on the 5 §4 open questions (PR #136)
 *   (2) Opus gate #8 contract freeze (post-#7)
 *   (3) ADR-009 schema ACCEPTED (event-log shape)
 *   (4) §144 Emilio for SDK install + wire to prod
 *
 * What this skeleton DOES express ·
 * - The contract surface (every SalaExecutor method has a typed stub)
 * - The mapping from contract → Inngest runtime patterns the spike
 *   proved (RESULTS-CC3-inngest-runtime-verify.md) · documented in
 *   block comments next to each method
 * - The budget hook architecture (Opus §H-d · 5th pecado · CAP) ·
 *   the executor receives a `BudgetHook` and calls it at every step
 *   boundary; the BudgetHook is the seam where the real G6
 *   `increment_bucket_atomic` RPC binds later
 * - Idempotency in OUR layer · the executor REQUIRES the input to
 *   carry a precomputed `IdempotencyKey` (per `ExecutionInput`) ·
 *   it never generates one itself, never delegates to the Inngest
 *   native `idempotency` CEL field as the primary dedup mechanism
 *
 * What this skeleton DOES NOT do ·
 * - import { Inngest } from 'inngest' · the SDK is NOT a repo dep yet
 * - call any real database or HTTP endpoint
 * - persist state · runs/handlers live only in process memory of the
 *   skeleton, which is fine because no one wires this yet
 *
 * Spec source · zr-vault/00-meta/opus-4-8-traspaso/
 *               spec-CC4-inngest-executor-skeleton.md
 * Patterns · zr-vault/00-meta/opus-4-8-traspaso/
 *            RESULTS-CC3-inngest-runtime-verify.md (3 runs · 21 trace
 *            lines · durability + idempotency CONFIRMED runtime)
 */
import type {
  BudgetCheckResult,
  BudgetPolicy,
  DurableFunction,
  DurableRunId,
  DurableRunStatus,
  ExecutionInput,
  RetryPolicy,
  SalaExecutor,
} from '../executor-contract'
import {
  BudgetExhaustedError,
  noopBudgetHook,
  type BudgetHook,
} from '../budget-hook'

// The BudgetHook is intentionally a VENDOR-NEUTRAL seam (lives at
// `src/lib/sala/budget-hook.ts` · NOT under `executors/`) so every
// executor implementation consumes the same hook to wire into the
// G6 `rate_limit_buckets.increment_bucket_atomic` RPC. The Inngest
// skeleton just CONSUMES it; the real binding (a SupabaseG6BudgetHook
// or similar) lives wherever the real wire-up runs (post-#8 freeze ·
// §144 Emilio).

// Re-exports for backward compatibility with prior import paths · keeps
// downstream test fixtures working while the genericisation lands.
// Future callers should import from `../budget-hook` directly.
export { BudgetExhaustedError, noopBudgetHook, type BudgetHook }

// ─── Handler registry · internal types ──────────────────────────────

interface RegisteredHandler {
  readonly operationType: string
  readonly fn: DurableFunction<unknown, unknown>
  readonly retry: RetryPolicy
  readonly budget?: BudgetPolicy
}

interface RunRecord {
  readonly runId: DurableRunId
  readonly idempotencyKey: string
  status: DurableRunStatus
  readonly operationType: string
  readonly clientId: string
  readonly enqueuedAt: number
}

// ─── The skeleton ───────────────────────────────────────────────────

export interface InngestExecutorOptions {
  /** Hook to the G6 atomic counter. Default · noopBudgetHook (always
   *  ok=true). Production wire-up replaces this with an implementation
   *  that calls `rate_limit_buckets.increment_bucket_atomic` RPC. */
  readonly budgetHook?: BudgetHook
  /** Override the run-id factory. Default · `run-<random>`. */
  readonly generateRunId?: () => string
}

/**
 * InngestExecutor skeleton.
 *
 * The real implementation will hold an `Inngest` client and convert
 * `register` to `inngest.createFunction({ id: operationType, retries:
 * retry.maxAttempts - 1, idempotency: "event.data.idempotencyKey",
 * triggers: [{ event: operationType }] }, async ({ event, step }) =>
 * fn(event.data, adaptStep(step)))`, and convert `enqueue` to
 * `inngest.send({ name: input.operationType, data: { ...input.payload,
 * idempotencyKey: input.idempotencyKey }, id: input.idempotencyKey })`.
 *
 * The spike proved these patterns work · step.run memoization HOLDS
 * across crash; idempotency CEL HOLDS on duplicate trigger within 24h
 * (RESULTS-CC3-inngest-runtime-verify.md §2.2 + §2.3).
 *
 * For this skeleton, all methods either store to internal Maps or
 * return safe stubs. Tests verify the contract shape; no Inngest
 * runtime is invoked.
 */
export class InngestExecutor implements SalaExecutor {
  private readonly budgetHook: BudgetHook
  private readonly generateRunId: () => string
  private readonly handlers = new Map<string, RegisteredHandler>()
  private readonly runs = new Map<DurableRunId, RunRecord>()
  /** idempotencyKey → DurableRunId · the OUR-layer dedup table. The
   *  real implementation will back this with `outbound_intents`
   *  (ADR-009 §3 outbound dedup table) via a unique constraint. */
  private readonly idempotencyIndex = new Map<string, DurableRunId>()

  constructor(options: InngestExecutorOptions = {}) {
    this.budgetHook = options.budgetHook ?? noopBudgetHook
    this.generateRunId =
      options.generateRunId ??
      (() => `run-${Math.random().toString(36).slice(2, 12)}`)
  }

  /**
   * Real wiring · `this.client.createFunction({ id: operationType,
   * retries: options.retry.maxAttempts - 1, triggers: [{ event:
   * operationType }] }, async ({ event, step }) => { ... call fn
   * with budget-wrapped step ... })`.
   *
   * Skeleton · stores the handler in the internal Map. No durable
   * registration with a runtime occurs.
   */
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
    this.handlers.set(operationType, {
      operationType,
      fn: fn as DurableFunction<unknown, unknown>,
      retry: options.retry,
      budget: options.budget,
    })
  }

  /**
   * Real wiring · check `outbound_intents` for the idempotency key in
   * a transaction · if present and not terminal, return existing
   * runId · else INSERT new outbound_intent + `inngest.send({ id:
   * input.idempotencyKey, ... })`.
   *
   * Skeleton · checks the in-memory idempotencyIndex · if present,
   * returns the existing runId · else mints a new one + records it.
   * Demonstrates the OUR-layer dedup behaviour without persistence.
   */
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
      enqueuedAt: Date.now(),
    })
    this.idempotencyIndex.set(input.idempotencyKey, runId)
    return runId
  }

  /**
   * Real wiring · query Inngest REST `/v1/runs/{id}` and map their
   * state machine to `DurableRunStatus` · `Queued / Running /
   * Completed / Failed / Cancelled` map directly; `Sleeping / Waiting`
   * collapse to `waiting`.
   *
   * Skeleton · reads the in-memory record's status.
   */
  async getStatus(runId: DurableRunId): Promise<DurableRunStatus> {
    const record = this.runs.get(runId)
    if (!record) {
      throw new Error(`getStatus · unknown runId "${runId}"`)
    }
    return record.status
  }

  /**
   * Real wiring · POST to Inngest cancel endpoint · idempotent on the
   * Inngest side · terminal states no-op.
   *
   * Skeleton · marks the record as cancelled in-memory · idempotent.
   */
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

  // ─── Internal · exposed for tests + future wiring ────────────────

  /** Test-only · inspect the registered handler for an operationType.
   *  The real Inngest wiring will not expose this; tests assert
   *  registration succeeded by inspecting this map. */
  getRegisteredHandler(operationType: string): RegisteredHandler | undefined {
    return this.handlers.get(operationType)
  }

  /** Test-only · mark a run as completed (simulates the durable
   *  runtime finishing). Real wiring drives this via the Inngest
   *  webhook completion callback. */
  markCompleted(runId: DurableRunId): void {
    const record = this.runs.get(runId)
    if (record && record.status !== 'cancelled') {
      record.status = 'completed'
    }
  }

  /** Test-only · invoke the budget hook directly with the registered
   *  budget policy. Demonstrates the wiring seam between executor and
   *  G6 without needing a real durable run in flight. Throws
   *  `BudgetExhaustedError` if the hook returns ok=false. */
  async checkBudgetForOperation(
    operationType: string,
    estimatedCostUsd?: number,
  ): Promise<BudgetCheckResult> {
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
