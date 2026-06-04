/**
 * SupabaseG6BudgetHook · real Supabase RPC implementation of the
 * Sala BudgetHook contract · Sprint 12 Fase 0 prep escalón 4.
 *
 * Calls the `increment_bucket_atomic` Postgres RPC (SECURITY DEFINER,
 * `FOR UPDATE` lock) that the migration in this PR defines. The RPC
 * atomically reads-checks-increments the bucket counter in one
 * transaction · returns whether the bucket is exhausted + remaining
 * caps + the per-bucket `shadow_mode` flag.
 *
 * Mode hierarchy (most-permissive wins) ·
 *   1. Hook `mode: 'shadow'` (default · this dispatch) · the hook
 *      ALWAYS returns `ok: true` regardless of RPC result. The
 *      exhausted decision is LOGGED for observability ("cap frena en
 *      shadow") but NEVER enforced. This is the canon for prep
 *      escalón 4 · NO live · NO enforce.
 *   2. Hook `mode: 'live'` · the hook returns the real RPC result.
 *      The hook still respects the per-bucket `shadow_mode_db` flag
 *      (DB column) · if a single bucket is marked shadow at the DB
 *      level, that bucket fail-opens even when the hook is live. Per
 *      §150 v1/v2 spec · the per-bucket shadow column is the
 *      canonical bucket-level toggle.
 *   3. RPC errors fail-OPEN with a logged warning (§148 honest ·
 *      the cap is a safety net · NEVER block prod traffic on a
 *      Supabase outage).
 *
 * §148 contract · this hook is the CAP wire seam. The router
 * (Track H #149 · paso 3.5) and the in-memory motor (PR #142
 * StepRunner) both call `checkAndIncrement` BEFORE dispatching a
 * step. Returning `ok: false` surfaces as `budget_blocked` in the
 * event log (router) or `BudgetExhaustedError` (motor).
 *
 * NOT WIRED LIVE in this PR · the hook ships in code · the router
 * + motor pick it up via `createG6BudgetHook()` · the default
 * factory returns `noopBudgetHook` (no real RPC calls). Flipping to
 * the real hook = setting `SALA_G6_HOOK_ENABLED=true` + providing a
 * Supabase admin client · explicit §144 in escalón 4.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetCheckResult } from '../executor-contract'
import type { BudgetHook } from '../budget-hook'

/** RPC return shape · matches the migration in this PR · 1 row. */
interface IncrementBucketAtomicResult {
  readonly exhausted: boolean
  readonly remaining_cost_usd: number | null
  readonly remaining_steps: number | null
  readonly shadow_mode_db: boolean
}

/** Logger sink shape · injectable for Sentry / Slack / console. */
export interface G6Logger {
  warn(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
}

const defaultLogger: G6Logger = {
  warn(msg, ctx) {
    // eslint-disable-next-line no-console
    console.warn(`[g6] ${msg}`, ctx ?? {})
  },
  info(msg, ctx) {
    // eslint-disable-next-line no-console
    console.log(`[g6] ${msg}`, ctx ?? {})
  },
}

/** Mode override · 'shadow' default · 'live' opt-in explicit. */
export type G6HookMode = 'shadow' | 'live'

export interface SupabaseG6BudgetHookOptions {
  /** Supabase client · production callers pass `getSupabaseAdmin()`.
   *  Tests inject a stub. Only `.rpc()` is consumed; we type the
   *  minimum so test stubs do not need to implement the full client. */
  readonly supabase: Pick<SupabaseClient, 'rpc'>
  /** Mode override · 'shadow' default (this dispatch) · NEVER blocks.
   *  Live = blocks when RPC says exhausted + bucket NOT in DB
   *  shadow_mode. */
  readonly mode?: G6HookMode
  /** Logger sink · default console. Wire to Sentry in production. */
  readonly logger?: G6Logger
}

/** RPC name · matches the migration · single source of truth. */
export const G6_RPC_INCREMENT = 'increment_bucket_atomic'

/** Real Supabase G6 hook. NOT wired live by default · see `createG6BudgetHook`. */
export class SupabaseG6BudgetHook implements BudgetHook {
  private readonly supabase: Pick<SupabaseClient, 'rpc'>
  private readonly mode: G6HookMode
  private readonly logger: G6Logger

  constructor(opts: SupabaseG6BudgetHookOptions) {
    this.supabase = opts.supabase
    this.mode = opts.mode ?? 'shadow'
    this.logger = opts.logger ?? defaultLogger
  }

  /** Implements BudgetHook.checkAndIncrement. */
  async checkAndIncrement(
    bucketKey: string,
    estimatedCostUsd?: number,
  ): Promise<BudgetCheckResult> {
    const cost = Number.isFinite(estimatedCostUsd) ? estimatedCostUsd! : 0

    let rpcResult: IncrementBucketAtomicResult | null = null
    try {
      // The RPC returns SETOF (one row · TABLE return type) · supabase
      // returns it as an array OR a single object depending on the
      // wrapper version. Handle both shapes defensively.
      const { data, error } = await this.supabase.rpc(G6_RPC_INCREMENT, {
        p_bucket_key: bucketKey,
        p_cost_usd: cost,
      })
      if (error) {
        // RPC error · fail-OPEN with logged warning · §148 cap is a
        // safety net, NEVER block prod on Supabase outage. This is
        // the same canon as §150 v1 G6 spec.
        this.logger.warn('rpc_error · fail_open', {
          bucket_key: bucketKey,
          error: error.message,
          mode: this.mode,
        })
        return {
          ok: true,
          bucketKey,
          reason: `rpc-error: ${error.message}`,
        }
      }
      rpcResult = this.normaliseRpcRow(data)
    } catch (err) {
      // Network / unknown error · same fail-OPEN policy.
      this.logger.warn('rpc_threw · fail_open', {
        bucket_key: bucketKey,
        error: err instanceof Error ? err.message : String(err),
        mode: this.mode,
      })
      return {
        ok: true,
        bucketKey,
        reason: `rpc-threw: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (!rpcResult) {
      // No row returned · unknown bucket · fail-open. The RPC body
      // returns a row even when the bucket is unknown (with
      // exhausted=false, shadow_mode_db=true) so this branch is
      // defensive.
      this.logger.warn('rpc_no_row · fail_open', {
        bucket_key: bucketKey,
        mode: this.mode,
      })
      return { ok: true, bucketKey, reason: 'no-rpc-row' }
    }

    const { exhausted, remaining_cost_usd, remaining_steps, shadow_mode_db } =
      rpcResult

    // Mode resolution · the most permissive wins.
    //   - hook in 'shadow'  → ALWAYS ok=true (this dispatch default)
    //   - hook in 'live' + per-bucket shadow_mode_db=true → ok=true
    //   - hook in 'live' + per-bucket shadow_mode_db=false + exhausted=true → ok=false
    const enforce = this.mode === 'live' && !shadow_mode_db
    const wouldBlock = exhausted

    if (wouldBlock) {
      // The "cap frena en shadow" signal · canonical observability.
      this.logger.info('cap_would_block', {
        bucket_key: bucketKey,
        hook_mode: this.mode,
        bucket_shadow_db: shadow_mode_db,
        enforced: enforce,
        remaining_cost_usd,
        remaining_steps,
      })
    }

    if (wouldBlock && enforce) {
      return {
        ok: false,
        bucketKey,
        reason: 'bucket-exhausted',
        remainingCostUsd: remaining_cost_usd ?? undefined,
        remainingSteps: remaining_steps ?? undefined,
      }
    }
    return {
      ok: true,
      bucketKey,
      remainingCostUsd: remaining_cost_usd ?? undefined,
      remainingSteps: remaining_steps ?? undefined,
    }
  }

  /** RPC return-row normaliser · handles both array and single-object
   *  shapes that supabase-js may return depending on RPC declaration. */
  private normaliseRpcRow(
    data: unknown,
  ): IncrementBucketAtomicResult | null {
    if (data == null) return null
    if (Array.isArray(data)) {
      return (data[0] as IncrementBucketAtomicResult) ?? null
    }
    return data as IncrementBucketAtomicResult
  }
}
