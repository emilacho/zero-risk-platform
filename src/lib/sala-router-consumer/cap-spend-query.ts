/**
 * Canon canonical · cap §150 production spend query wire (SPEC lazo agentico
 * 2026-06-05).
 *
 * Builds a `CapSpendQuery` closure that sums `agent_invocations.cost_usd`
 * for the client within a bounded window. Window canon ·
 *
 *   - Strategy A (canonical) · SUM by `journey_id` (per-stream) · the §149
 *     correlation chain · tightest scope · matches "per-run" canon
 *   - Strategy B (fallback) · SUM by `client_id` since wall-clock floor
 *     (`started_at`) · for cases where journey propagation hasn't landed yet
 *
 * DB-column canon (§148 fix 2026-06-27) · `agent_invocations` has
 * `client_id` + `journey_id` + `started_at` · NOT `tenant_id`/`correlation_id`.
 * The sala closure params keep the abstract names (tenant_id/correlation_id);
 * the `.eq()` targets the REAL columns. The prior code queried non-existent
 * columns → every query errored → returned 0 → the $5 cap never fired.
 *
 * The closure is INJECTED into `dispatchOneIntake` via the orchestrator so
 * the dispatch lib stays pure (testable without Supabase).
 *
 * §148 honest · errors return 0 (under_cap pass) · the cap canon §150 is
 * a SAFETY NET · backstops G6 + G5 stay enforce-live independently.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CapSpendQuery } from './dispatch'

export interface WireCapSpendQueryOptions {
  /** Canon canonical · strategy A (correlation_id) is canonical. */
  readonly strategy?: 'correlation' | 'tenant_window'
  /**
   * Used only by strategy='tenant_window' · default 24h ago.
   * Tests pass explicit floor.
   */
  readonly window_floor_iso?: string
}

/**
 * Canon canonical · production wire · returns a closure usable by
 * `dispatchOneIntake({ cap_spend_query })`.
 */
export function wireCapSpendQuerySupabase(
  supabase: SupabaseClient,
  options: WireCapSpendQueryOptions = {},
): CapSpendQuery {
  const strategy = options.strategy ?? 'correlation'
  return async ({ tenant_id, correlation_id }) => {
    try {
      if (strategy === 'correlation') {
        // Strategy A · SUM by journey_id (per-stream · the §149 chain).
        // DB columns canon · the sala param `tenant_id` maps to the real
        // column `client_id`, and `correlation_id` maps to `journey_id`
        // (agent_invocations has NO tenant_id/correlation_id columns · the
        // old names made the query error → return 0 → cap never fired).
        const { data, error } = await supabase
          .from('agent_invocations')
          .select('cost_usd')
          .eq('client_id', tenant_id)
          .eq('journey_id', correlation_id)
        if (error) return 0
        return sumCost(data)
      }
      // Strategy B · SUM by client_id since window floor (started_at).
      const floor =
        options.window_floor_iso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('agent_invocations')
        .select('cost_usd')
        .eq('client_id', tenant_id)
        .gte('started_at', floor)
      if (error) return 0
      return sumCost(data)
    } catch {
      return 0
    }
  }
}

function sumCost(rows: Array<{ cost_usd?: number | string | null }> | null): number {
  if (!rows) return 0
  return rows.reduce((acc, r) => {
    const v = r.cost_usd
    const n = typeof v === 'string' ? Number(v) : (v ?? 0)
    return acc + (Number.isFinite(n) ? Number(n) : 0)
  }, 0)
}
