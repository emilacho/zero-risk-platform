/**
 * §149 gate · validateWorkflowId
 *
 * Canon · CLAUDE.md §2.2 "AGENTES SOLO SE INVOCAN VÍA WORKFLOWS · NUNCA
 * DIRECTO". Every agent invocation must originate from a workflow with a
 * non-empty `workflow_id`. This gate flags (shadow) or rejects (enforce)
 * any invocation missing it.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.1
 *
 * Pure function · no IO · safe to call from anywhere · trivially testable.
 *
 * Env toggle ·
 *   AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1 → enforce (default "0" = shadow)
 */
import type { GateDecision, InvocationContext } from './types'

export function validateWorkflowId(ctx: InvocationContext): GateDecision {
  const enforce = process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE === '1'
  const trimmed = (ctx.workflow_id ?? '').trim()
  const wouldReject = trimmed.length === 0

  // Smoke caller exemption · smoke harness uses prefix 'smoke-' as its
  // workflow_id. Accepted as valid · flagged in metadata so audit queries
  // can filter (`metadata.is_smoke_caller = true`).
  const isSmoke = trimmed.startsWith('smoke-')

  return {
    gate: 'validate_workflow_id',
    shadow_mode: !enforce,
    would_reject: wouldReject,
    enforced: wouldReject && enforce,
    reason: wouldReject
      ? 'Missing or empty workflow_id (§149 violation · all agent invocations must originate from a workflow)'
      : undefined,
    metadata: {
      workflow_id_present: !wouldReject,
      is_smoke_caller: isSmoke,
      caller: ctx.caller,
    },
  }
}
