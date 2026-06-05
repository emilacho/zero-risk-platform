/**
 * Canon canonical · Model B canonical n8n expression for §149 correlation.
 *
 * Sprint 12 SEAM-CLOSE Ronda 2 (2026-06-05 convergencia) · CC#4 ran 3/3
 * round-trip smoke against this expression in their worker
 * `LyVoKcrypS5uLyuu` (Client Onboarding E2E v2) · this constant
 * encodes that ground-truth so the sala-side contract test + the
 * dispatch docs reference a SINGLE canonical string.
 *
 * Drift detection · if CC#4 changes the n8n node expression (or moves
 * the `Validate Deal Data` predecessor node), this constant must
 * follow + the contract test breaks until aligned.
 *
 * Why `$('Validate Deal Data').item.json._journey_id` (vs `$json.body._journey_id`) ·
 * n8n nodes consume the OUTPUT of their immediate predecessor · in the
 * worker `LyVoKcrypS5uLyuu`, the run-sdk node sits AFTER `Validate Deal
 * Data` (which reshapes the webhook payload), so `$json.body` refers to
 * Validate Deal Data's output (post-reshape) · not the raw webhook body.
 * Referencing the source-node directly by name (`$('Validate Deal Data').item.json`)
 * is the canonical n8n pattern when the data path needs the original
 * webhook fields preserved through a transformation chain. CC#4
 * confirmed via runtime inspection 2026-06-05.
 *
 * §148 honest · this file is READ-ONLY DOCUMENTATION · no behavior
 * is gated on it · the sala adapter just needs `agent_invocations`
 * rows to carry the sala stream as `workflow_id` (which the n8n
 * expression produces). Drift is a CC#3 ↔ CC#4 alignment concern.
 */

/**
 * Canon canonical · the exact n8n expression CC#4 placed in the
 * `Call Onboarding Specialist: Auto-Discovery` node body template
 * (and any subsequent `/api/agents/run-sdk` invocation in the worker).
 *
 * Source-of-truth · MODELB-ADAPTER-LyVoKcrypS5uLyuu-contract V2 + CC#4
 * runtime smoke 3/3 PASS 2026-06-05 (per SEAM-CLOSE-modelb-shadow §RONDA 2).
 *
 * Behavior · when the sala dispatches the worker with `_journey_id` in
 * the webhook body, the predecessor node `Validate Deal Data` preserves
 * it through the reshape → this expression reads it from that node's
 * output → passes it as `workflow_id` to `/api/agents/run-sdk` · the
 * `||` fallback to `$workflow.id` safe-defaults to the n8n workflow_id
 * for legacy direct webhook runs (NOT sala-dispatched).
 */
export const MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION =
  "{{ $('Validate Deal Data').item.json._journey_id || $workflow.id }}"

/**
 * Canon canonical · the predecessor node name in the worker that the
 * expression references. If CC#4 ever moves/renames `Validate Deal
 * Data`, this constant updates in lock-step.
 */
export const MODELB_PREDECESSOR_NODE_NAME = 'Validate Deal Data'

/**
 * Canon canonical · the worker node where the expression lives.
 * Currently the only run-sdk invocation in `LyVoKcrypS5uLyuu`. If
 * CC#4 adds more run-sdk nodes in the worker, this list grows.
 */
export const MODELB_RUNSDK_NODE_NAMES = Object.freeze([
  'Call Onboarding Specialist: Auto-Discovery',
] as const)

/**
 * Canon canonical · the worker_id this expression applies to.
 * Other workers (PRODUCE NEXUS, ACQUIRE, etc) have their own expressions
 * when their journeys opt-in to Model B per §144.
 */
export const MODELB_WORKER_ID = 'LyVoKcrypS5uLyuu'

/**
 * Canon canonical · validation invariants for the expression. Used by
 * the contract test to detect drift if the string mutates.
 */
export const MODELB_EXPRESSION_INVARIANTS = Object.freeze({
  contains_predecessor_node_name: true, // references $('Validate Deal Data')
  contains_journey_id_field: true, // reads ._journey_id
  has_fallback_to_n8n_workflow_id: true, // || $workflow.id
  wraps_in_n8n_expression_braces: true, // {{ ... }}
} as const)

/**
 * Canon canonical · self-validator · returns the violations array for
 * the canonical expression. Used by the contract test to assert no
 * drift on any invariant.
 */
export function checkExpressionInvariants(
  expression: string,
): ReadonlyArray<keyof typeof MODELB_EXPRESSION_INVARIANTS> {
  const violations: Array<keyof typeof MODELB_EXPRESSION_INVARIANTS> = []
  if (!expression.includes(`$('${MODELB_PREDECESSOR_NODE_NAME}')`)) {
    violations.push('contains_predecessor_node_name')
  }
  if (!expression.includes('._journey_id')) {
    violations.push('contains_journey_id_field')
  }
  if (!expression.includes('|| $workflow.id')) {
    violations.push('has_fallback_to_n8n_workflow_id')
  }
  if (!expression.startsWith('{{') || !expression.endsWith('}}')) {
    violations.push('wraps_in_n8n_expression_braces')
  }
  return violations
}
