/**
 * Canonical types for `src/lib/agent-safety/`.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §1.2
 *
 * All gates and the killSwitch orchestrator consume/produce these shapes.
 * Stable contract · changes require a minor-version bump and migration of
 * `agent_safety_audit.gates` JSONB shape downstream.
 */

export type GateName =
  | 'validate_workflow_id'  // §149 · workflow_id NOT NULL
  | 'check_idempotency'     // §150 G3 · dedup per request hash
  | 'check_rate_limit'      // §150 G6 · rate_limit_buckets exhaustion

export type AbortAction =
  | 'warn'              // log + Slack #ops warn ping · no kill
  | 'rate_limit_kill'   // 429 response (handled by caller)
  | 'circuit_break'     // Slack #ops + #equipo P0 · no auto-pause
  | 'pause_workflow'    // pauseN8nWorkflow + Slack P1
  | 'twilio_emilio'     // Twilio SMS to EMILIO_PHONE + Slack P0

/**
 * Caller-supplied context for one invocation. Every gate sees the same ctx.
 *
 * `workflow_id` is nullable because that nullability IS the signal validated
 * by §149 · the gate would_reject when it's null/empty/whitespace.
 */
export interface InvocationContext {
  workflow_id: string | null
  workflow_execution_id: string | null
  client_id: string | null
  agent_id: string                     // canonical slug post alias-resolution
  task: string                         // input text · used by idempotency hash
  tool_name?: string
  estimated_cost_usd?: number
  caller: 'n8n' | 'pipeline' | 'api' | 'smoke' | 'cron'
  request_id?: string                  // upstream-supplied idempotency key (preferred)
}

/**
 * Per-gate decision · one of these is returned by each gate function.
 *
 * `shadow_mode` reflects the gate's current toggle state (env or DB) ·
 * `would_reject` is true if the gate computed a reject condition this run ·
 * `enforced` is `would_reject && !shadow_mode` · the only thing that actually
 * blocks the request.
 */
export interface GateDecision {
  gate: GateName
  shadow_mode: boolean
  would_reject: boolean
  enforced: boolean
  reason?: string
  // Per-gate metadata · gate-specific shape stored as opaque jsonb in audit.
  metadata?: Record<string, unknown>
  // Populated by check_rate_limit only.
  bucket_id?: string
  abort_action?: AbortAction
}

/**
 * Orchestrator output. `allow=false` ONLY if any gate enforced=true.
 *
 * `shadow_blocks` lists the gates that would_reject but did NOT enforce
 * (per-gate shadow_mode=true). These rows are the baseline-building signal
 * during the shadow phase.
 */
export interface SafetyDecision {
  allow: boolean
  gates: GateDecision[]
  block_gate?: GateName
  block_reason?: string
  shadow_blocks: GateName[]
  request_id: string                   // canonical UUID minted by killSwitch
}
