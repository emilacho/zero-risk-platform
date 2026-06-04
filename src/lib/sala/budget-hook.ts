/**
 * BudgetHook · vendor-NEUTRAL hook for the CAP (5th pecado, Opus §H-d).
 *
 * Lives at the Sala root (NOT under `executors/`) to make it concretely
 * generic · every executor implementation (Inngest, Vercel WF, future
 * X) consumes the same BudgetHook interface to wire into the G6
 * atomic counter. The hook does not reference any specific durable
 * runtime; it is the seam between the contract (`BudgetPolicy` +
 * `BudgetCheckResult` in `executor-contract.ts`) and the actual G6
 * RPC (`rate_limit_buckets.increment_bucket_atomic`).
 *
 * Wire-up sequence (post-#8 freeze · §144 Emilio decides) ·
 *   1. Implement `SupabaseG6BudgetHook` (or similar) that calls
 *      `supabase.rpc('increment_bucket_atomic', { bucket_key, ... })`.
 *   2. Inject it into the executor constructor.
 *   3. Per-handler budget policies (`BudgetPolicy.bucketKey`) point at
 *      rows in `rate_limit_buckets`.
 *   4. The router does NOT need to know which vendor backs the
 *      executor · the bucket cap is enforced uniformly.
 */
import type { BudgetCheckResult } from './executor-contract'

/** The CAP-binding seam. An executor calls `checkAndIncrement` at
 *  every `step.run` boundary (or equivalent) BEFORE invoking the
 *  user's step body. If the bucket is exhausted, the implementation
 *  returns `{ ok: false }` with a reason and the executor MUST
 *  surface this as a step failure (so retry policy applies). The
 *  bucket remains exhausted during the retry window, so the retry
 *  also fails fast · this is the circuit-break behaviour the cap
 *  design assumes.
 *
 *  This interface is vendor-NEUTRAL · NO reference to Inngest /
 *  Vercel / any durable runtime. It is the same hook for every
 *  executor implementation. */
export interface BudgetHook {
  checkAndIncrement(
    bucketKey: string,
    estimatedCostUsd?: number,
  ): Promise<BudgetCheckResult>
}

/** No-op default · ok=true always. Used until wired to the real G6
 *  RPC. Lets tests assert the executor calls the hook without
 *  needing a Supabase instance. */
export const noopBudgetHook: BudgetHook = {
  async checkAndIncrement(bucketKey: string) {
    return { ok: true, bucketKey }
  },
}

/** Error thrown by the executor when the BudgetHook returns ok=false.
 *  Caught by the durable runtime · counted as a step failure · subject
 *  to RetryPolicy. */
export class BudgetExhaustedError extends Error {
  readonly bucketKey: string
  readonly reason: string | undefined
  constructor(result: BudgetCheckResult) {
    super(
      `Budget exhausted for bucket "${result.bucketKey}"${result.reason ? ` · ${result.reason}` : ''}`,
    )
    this.name = 'BudgetExhaustedError'
    this.bucketKey = result.bucketKey
    this.reason = result.reason
  }
}
