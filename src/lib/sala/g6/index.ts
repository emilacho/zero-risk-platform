/**
 * G6 budget hook · public re-exports · Track N (prep escalón 4).
 *
 * Consumers · the router (Track H · paso 3.5) and the in-memory
 * motor (StepRunner) call `createG6BudgetHook()` from this module.
 * Default returns `noopBudgetHook` until `SALA_G6_HOOK_ENABLED=true`
 * (escalón 4 §144).
 */
export {
  G6_RPC_INCREMENT,
  SupabaseG6BudgetHook,
  type G6HookMode,
  type G6Logger,
  type SupabaseG6BudgetHookOptions,
} from './supabase-g6-budget-hook'
export {
  createG6BudgetHook,
  type CreateG6BudgetHookInput,
} from './factory'
