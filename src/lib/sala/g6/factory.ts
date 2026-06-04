/**
 * G6 budget-hook factory · env-gated mode resolver.
 *
 * Single entry point the router (Track H #149 · paso 3.5) and the
 * in-memory motor (StepRunner) call to obtain a BudgetHook. Defaults
 * to `noopBudgetHook` (never blocks · never calls RPC) until the
 * explicit env opt-in lands.
 *
 * Env contract ·
 *   SALA_G6_HOOK_ENABLED · "true" → use real SupabaseG6BudgetHook
 *                          · anything else → noopBudgetHook (default)
 *   SALA_G6_HOOK_MODE    · "live"   → enforce (block on exhaustion)
 *                          · anything else → "shadow" (log-only · default)
 *
 * Even with SALA_G6_HOOK_ENABLED=true, the default `SALA_G6_HOOK_MODE`
 * is shadow · the cap LOGS would-block decisions without enforcing.
 * Flipping to live = explicit §144 (escalón 5 of the encendido
 * roadmap · `flip enforce`).
 *
 * §148 honest · this factory is the ONLY place where the real hook
 * is constructed. Code that needs a hook should call
 * `createG6BudgetHook()` · NOT `new SupabaseG6BudgetHook()` directly.
 * Tests can pass an explicit supabase mock + mode to short-circuit
 * the env reading.
 */
import type { BudgetHook } from '../budget-hook'
import { noopBudgetHook } from '../budget-hook'
import {
  G6_RPC_INCREMENT,
  SupabaseG6BudgetHook,
  type G6HookMode,
  type G6Logger,
  type SupabaseG6BudgetHookOptions,
} from './supabase-g6-budget-hook'

export interface CreateG6BudgetHookInput {
  /** Provide an explicit supabase client (tests · service role). When
   *  absent, the factory does NOT attempt to lazy-import the admin
   *  client · it returns noopBudgetHook. This keeps the factory
   *  pure + safe to call from edge runtimes that have no admin
   *  credentials. */
  readonly supabase?: SupabaseG6BudgetHookOptions['supabase']
  /** Force a specific mode · overrides env. Tests use this. */
  readonly mode?: G6HookMode
  /** Force the enabled flag · overrides env. */
  readonly enabled?: boolean
  /** Logger injection · default console. */
  readonly logger?: G6Logger
}

/** Resolve the G6 hook for the current process. Defaults to noop ·
 *  the real hook is opt-in via env + supabase client. */
export function createG6BudgetHook(
  input: CreateG6BudgetHookInput = {},
): BudgetHook {
  const enabled =
    input.enabled !== undefined
      ? input.enabled
      : process.env.SALA_G6_HOOK_ENABLED === 'true'

  if (!enabled) {
    return noopBudgetHook
  }

  if (!input.supabase) {
    // Enabled but no client provided · refuse to construct the real
    // hook (we never lazy-import the admin client here to keep this
    // file edge-safe). Caller mis-wire = noop fallback + logged warn.
    // eslint-disable-next-line no-console
    console.warn(
      '[g6/factory] SALA_G6_HOOK_ENABLED=true but no supabase client provided · falling back to noopBudgetHook',
    )
    return noopBudgetHook
  }

  const mode: G6HookMode =
    input.mode ?? (process.env.SALA_G6_HOOK_MODE === 'live' ? 'live' : 'shadow')

  return new SupabaseG6BudgetHook({
    supabase: input.supabase,
    mode,
    logger: input.logger,
  })
}

// Re-export the public surface for downstream consumers.
export {
  G6_RPC_INCREMENT,
  SupabaseG6BudgetHook,
  type G6HookMode,
  type G6Logger,
  type SupabaseG6BudgetHookOptions,
}
