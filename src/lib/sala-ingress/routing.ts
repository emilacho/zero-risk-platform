/**
 * Canon canonical · routing lookup · sala-ingress.
 *
 * Opus VEREDICTO §3 · routing declarativo · (source, intent) → journey
 * + worker en tabla. JOURNEY_WORKFLOW_MAP se PROMUEVE a tabla
 * (`routing_rules`) · ingress consulta la tabla · NO el mapa en código.
 *
 * §148 honest · pure function · cero IO · DB lookup happens at the
 * orchestrator level via the IngressTablesAdapter contract.
 */
import type { IngressSource, RoutingRule } from './types'

export interface ScopeCheckInput {
  readonly source: IngressSource
  readonly intent: string
}

export type ScopeDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/**
 * Canon canonical · enforces the source's scope · the intent MUST be
 * in `intents_allowed`. Without this, a tier-A source (trusted) could
 * trigger arbitrary intents which contradicts canon "scope per source".
 */
export function checkIntentScope(input: ScopeCheckInput): ScopeDecision {
  if (!input.source.active) {
    return { ok: false, reason: 'source_inactive' }
  }
  if (!input.source.intents_allowed.includes(input.intent)) {
    return {
      ok: false,
      reason: `intent_not_in_scope · "${input.intent}" not in source.intents_allowed [${input.source.intents_allowed.join(', ')}]`,
    }
  }
  return { ok: true }
}

export interface RoutingDecision {
  readonly journey_type: string
  readonly worker_workflow_id: string | null
}

/**
 * Canon canonical · pure mapper · routing rule → journey/worker.
 * The lookup itself is async (DB call) and lives in the orchestrator;
 * this fn is the post-lookup interpreter that validates the rule and
 * extracts the mapping.
 */
export function interpretRoutingRule(
  rule: RoutingRule,
): { readonly ok: true; readonly value: RoutingDecision } | { readonly ok: false; readonly reason: string } {
  if (!rule.active) {
    return { ok: false, reason: 'routing_rule_inactive' }
  }
  if (!rule.journey_type) {
    return { ok: false, reason: 'routing_rule_missing_journey_type' }
  }
  return {
    ok: true,
    value: {
      journey_type: rule.journey_type,
      worker_workflow_id: rule.worker_workflow_id,
    },
  }
}
