/**
 * Audit log writer · agent-safety
 *
 * Single helper used by `killSwitch` orchestrator to persist one row per
 * safety pass into `public.agent_safety_audit`. Canon §148 honest reporting ·
 * every gate decision (including shadow) leaves evidence in this table.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §7.1 · §2.4
 *
 * Fail-open semantics · INSERT errors are swallowed + console.warn logged ·
 * never throws to caller (matches `killSwitch` outer try/catch contract).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GateDecision, GateName, InvocationContext } from './types'

export type EndpointLabel = '/api/agents/run' | '/api/agents/run-sdk' | 'railway-direct'

export interface RecordSafetyPassInput {
  request_id: string
  ctx: InvocationContext
  gates: GateDecision[]
  endpoint: EndpointLabel
}

export async function recordSafetyPass(
  supabase: SupabaseClient,
  input: RecordSafetyPassInput,
): Promise<void> {
  const { request_id, ctx, gates, endpoint } = input

  const blockingGate = gates.find((g) => g.enforced)
  const shadowGates: GateName[] = gates
    .filter((g) => g.would_reject && !g.enforced)
    .map((g) => g.gate)

  try {
    const { error } = await supabase.from('agent_safety_audit').insert({
      request_id,
      workflow_id: ctx.workflow_id,
      workflow_execution_id: ctx.workflow_execution_id,
      client_id: ctx.client_id,
      agent_id: ctx.agent_id,
      caller: ctx.caller,
      estimated_cost_usd: ctx.estimated_cost_usd ?? null,
      allow: !blockingGate,
      block_gate: blockingGate?.gate ?? null,
      block_reason: blockingGate?.reason ?? null,
      shadow_block_count: shadowGates.length,
      shadow_block_gates: shadowGates,
      gates,
      endpoint,
    })

    if (error) {
      // Fail-open · NO throw · just log. Canon §148 honest · NO bloquear prod por bug propio.
      console.warn('[agent-safety/audit-log] insert failed:', error.message)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[agent-safety/audit-log] insert threw:', msg)
  }
}

/**
 * Logarithmic Slack pinger for shadow blocks · STUB pending build phase 2.
 * Real impl posts to #shadow-mode channel at hits #1, #10, #100, #1000.
 * Today · console.info so the pattern is visible in Vercel function logs.
 */
export function maybeSlackPingShadow(
  gate: GateName,
  ctx: InvocationContext,
): void {
  // STUB · build-phase 2 hooks Slack webhook + DB counter for de-dup.
  // For now · stdout breadcrumb so devs see shadow signals in Vercel logs.
  console.info('[agent-safety/shadow]', JSON.stringify({
    gate,
    workflow_id: ctx.workflow_id,
    agent_id: ctx.agent_id,
    caller: ctx.caller,
  }))
}
