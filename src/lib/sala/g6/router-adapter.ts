/**
 * Router-adapter · wires the G6 BudgetHook (PR #155) into the async
 * BudgetCheckFn shape the sala-router expects (PR #158).
 *
 * Sprint 12 Fase 0 Escalón 4 · §144 luz verde 2026-06-04.
 *
 * Direction · sala-router/decide() paso 3.5 calls `budget_check(input)`
 * where input = `BudgetCheckInput { tenant_id, client_id, journey_type,
 * operation_type, step_id, projected_cost_usd? }`. The router expects a
 * `Promise<BudgetCheckResult { allowed, budget_key, reason? }>`.
 *
 * This adapter ·
 *   1. Builds the canonical bucket key via `buildBucketKey()`
 *      (sala-router/stubs · `t:{tenant}:c:{client}:j:{journey}:o:{operation}`).
 *   2. Calls `BudgetHook.checkAndIncrement(bucketKey, projected_cost_usd)`.
 *   3. Maps the hook's `BudgetCheckResult { ok, ... }` to the router's
 *      `BudgetCheckResult { allowed, budget_key, reason? }`.
 *
 * Use `createG6RouterBudgetCheck()` to construct a wired `BudgetCheckFn`
 * the caller passes to `RealSalaIntegration` (or any future call site).
 * Default supabase = `getSupabaseAdmin()` (deferred require so this
 * file can be imported on the edge runtime when not wired).
 *
 * §148 honest · this adapter is SHADOW-by-default. The `G6` hook
 * (createG6BudgetHook · PR #155 factory) reads `SALA_G6_HOOK_ENABLED`
 * + `SALA_G6_HOOK_MODE` env at runtime. When the env says shadow OR
 * the flag is off, the adapter returns `allowed: true` always · the
 * router NEVER emits `budget_blocked` unless the env is fully flipped
 * (escalón 5 territory).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBucketKey } from '../../sala-router/stubs'
import type {
  BudgetCheckFn,
  BudgetCheckInput,
  BudgetCheckResult,
} from '../../sala-router/types'
import { createG6BudgetHook } from './factory'
import type { G6HookMode, G6Logger } from './supabase-g6-budget-hook'
import type { BudgetHook } from '../budget-hook'

export interface CreateG6RouterBudgetCheckInput {
  /** Supabase client · production callers pass `getSupabaseAdmin()`. */
  readonly supabase?: Pick<SupabaseClient, 'rpc'>
  /** Force the mode · default reads env. */
  readonly mode?: G6HookMode
  /** Force the enabled flag · default reads env. */
  readonly enabled?: boolean
  /** Logger injection · default console. */
  readonly logger?: G6Logger
  /** Optional · inject an already-constructed BudgetHook (tests use this
   *  to skip the factory entirely). Takes precedence over supabase/
   *  mode/enabled when present. */
  readonly hook?: BudgetHook
}

/**
 * Construct an async `BudgetCheckFn` that routes through the G6 RPC.
 *
 * Default (no input) · returns a checker that defers to the env-
 * driven factory. When `SALA_G6_HOOK_ENABLED !== 'true'`, the factory
 * yields `noopBudgetHook` and the router behaves identically to the
 * legacy `allowAllBudgetStub` shipped in stubs.ts.
 */
export function createG6RouterBudgetCheck(
  input: CreateG6RouterBudgetCheckInput = {},
): BudgetCheckFn {
  const hook: BudgetHook =
    input.hook ??
    createG6BudgetHook({
      supabase: input.supabase,
      mode: input.mode,
      enabled: input.enabled,
      logger: input.logger,
    })

  return async (
    routerInput: BudgetCheckInput,
  ): Promise<BudgetCheckResult> => {
    // The router pre-computes `bucket_key` via `buildBucketKey()`. We
    // honour it if present (zero re-parsing) · fall back to recompute
    // if absent for backward compat with older callers / tests.
    const bucket_key =
      routerInput.bucket_key ??
      buildBucketKey({
        tenant_id: routerInput.tenant_id,
        client_id: routerInput.client_id,
        journey_type: routerInput.journey_type,
        operation_type: routerInput.operation_type,
      })

    const hookResult = await hook.checkAndIncrement(
      bucket_key,
      routerInput.projected_cost_usd,
    )

    if (hookResult.ok) {
      return {
        allowed: true,
        budget_key: bucket_key,
      }
    }

    return {
      allowed: false,
      budget_key: bucket_key,
      reason: hookResult.reason ?? 'bucket-exhausted',
    }
  }
}
