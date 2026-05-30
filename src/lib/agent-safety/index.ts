/**
 * Public surface of `src/lib/agent-safety/`.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md
 *
 * Status · skeleton · `validateWorkflowId` fully implemented · others stubs
 * with locked contract. Spec is the source of truth for the build-phase
 * implementation work.
 */

export type {
  GateName,
  AbortAction,
  GateDecision,
  InvocationContext,
  SafetyDecision,
} from './types'

export { validateWorkflowId } from './validate-workflow-id'
export { checkIdempotency } from './check-idempotency'
export { checkRateLimit } from './check-rate-limit'
export { killSwitch } from './kill-switch'
