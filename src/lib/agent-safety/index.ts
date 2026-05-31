/**
 * Public surface of `src/lib/agent-safety/`.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md
 *
 * Status · BUILD-PHASE · all 3 gates fully implemented · killSwitch
 * orchestrator persists audit rows to `agent_safety_audit` · shadow-mode
 * default per gate (env=0 or DB shadow_mode=true) · canon §148 honest.
 */

export type {
  GateName,
  AbortAction,
  GateDecision,
  InvocationContext,
  SafetyDecision,
} from './types'

export { validateWorkflowId } from './validate-workflow-id'
export { checkIdempotency, computeIdempotencyKey } from './check-idempotency'
export { checkRateLimit } from './check-rate-limit'
export { killSwitch } from './kill-switch'
export { recordSafetyPass, maybeSlackPingShadow } from './audit-log'
export type { EndpointLabel, RecordSafetyPassInput } from './audit-log'
