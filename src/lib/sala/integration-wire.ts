/**
 * Integration wire · Track S · synthetic E2E factory.
 *
 * Single entry point to construct a `RealSalaIntegration` with all
 * wires the synthetic canary needs ·
 *   - **Cap-wire** · G6 router-adapter (env-gated default · falls
 *     back to `allowAllBudgetStub` when the G6 hook is disabled or
 *     no supabase client supplied)
 *   - **Storage** · in-memory by default (canary runs are self-
 *     contained · no real DB pollution) · callers can override
 *     with the Supabase adapter when wiring a real client later
 *   - **Interpreter + libreto lookup** · default canonical
 *
 * §148 honest · NO real client data, NO real journey dispatch, NO
 * enforce. Everything opt-in via env or explicit input. Defaults
 * give a noop wire that lets tests run identical to the legacy stubs.
 *
 * Dispatch trace · the integration already writes every decision
 * back to `storage`. After `runUntilHalt` returns, the canary reads
 * `storage` to derive the trace. No extra hook needed.
 */
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'
import type { EventLogStorage } from '@/lib/sala-event-log'
import { RealSalaIntegration } from '@/lib/sala-integration'
import type {
  BudgetCheckFn,
  LibretoLookup,
  ResolveNextStepFn,
} from '@/lib/sala-router'
import { allowAllBudgetStub } from '@/lib/sala-router/stubs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createG6RouterBudgetCheck } from './g6'
import type { G6HookMode, G6Logger } from './g6'

export interface BuildSalaIntegrationInput {
  /** Provide an explicit storage backend. Default · in-memory
   *  (canary self-contained). Tests pass an in-memory instance to
   *  assert appended events. */
  readonly storage?: EventLogStorage

  /** Inject a pre-built budget check (tests). When omitted, the
   *  factory builds via `createG6RouterBudgetCheck` from env. */
  readonly budget_check?: BudgetCheckFn

  /** Forward to `createG6RouterBudgetCheck` · ignored when
   *  `budget_check` is set explicitly. */
  readonly supabase?: Pick<SupabaseClient, 'rpc'>
  readonly g6_mode?: G6HookMode
  readonly g6_enabled?: boolean
  readonly g6_logger?: G6Logger

  /** Optional override of the interpreter wire (tests). */
  readonly resolve_next_step?: ResolveNextStepFn

  /** Optional libreto lookup override (tests). */
  readonly libreto_lookup?: LibretoLookup
}

export interface BuildSalaIntegrationOutput {
  readonly integration: RealSalaIntegration
  /** The storage the integration uses · the canary reads from this
   *  to derive the loop trace post `runUntilHalt`. */
  readonly storage: EventLogStorage
  /** The budget_check that was wired · exposed for assertions /
   *  introspection (e.g., tests verify the G6 adapter was selected). */
  readonly budget_check: BudgetCheckFn
}

/** Build a fully-wired `RealSalaIntegration` for synthetic E2E
 *  runs. Defaults are safe · no real client data flows through. */
export function buildSalaIntegration(
  input: BuildSalaIntegrationInput = {},
): BuildSalaIntegrationOutput {
  const storage = input.storage ?? new InMemoryEventLogStorage()

  // Cap-wire · the G6 router-adapter is the canon binding.
  // If neither explicit `budget_check` nor supabase + g6_enabled is
  // present, fall back to `allowAllBudgetStub` so default tests
  // remain identical to the legacy harness behaviour.
  const budget_check: BudgetCheckFn =
    input.budget_check ??
    (input.g6_enabled || input.supabase
      ? createG6RouterBudgetCheck({
          supabase: input.supabase,
          mode: input.g6_mode,
          enabled: input.g6_enabled,
          logger: input.g6_logger,
        })
      : allowAllBudgetStub)

  const integration = new RealSalaIntegration({
    storage,
    budget_check,
    resolve_next_step: input.resolve_next_step,
    libreto_lookup: input.libreto_lookup,
  })

  return { integration, storage, budget_check }
}
