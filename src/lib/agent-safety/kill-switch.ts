/**
 * killSwitch · agent-safety orchestrator
 *
 * Single entry point invoked by both route handlers
 * (`/api/agents/run` legacy + `/api/agents/run-sdk` canon) and by the
 * Railway `agent-runner` Express middleware (defense-in-depth).
 *
 * Runs all 3 gates in canonical order, records an audit row, returns
 * `allow + block reason` tuple.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.4
 *
 * IMPLEMENTATION STATUS · 🟡 STUB orchestration logic present but audit
 * write + Sentry capture pending PR build phase. The gates themselves are
 * also stubs (see their files). The orchestrator's CONTRACT (what it
 * returns, in which order it runs gates) is locked.
 *
 * Env toggle ·
 *   AGENT_SAFETY_ENABLED=false → global short-circuit · returns allow=true ·
 *                                logs Sentry warning · never blocks · canon
 *                                fail-open per §148.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvocationContext, SafetyDecision } from './types'
import { validateWorkflowId } from './validate-workflow-id'
import { checkIdempotency } from './check-idempotency'
import { checkRateLimit } from './check-rate-limit'

export async function killSwitch(
  ctx: InvocationContext,
  supabase: SupabaseClient,
): Promise<SafetyDecision> {
  const request_id = randomUUID()

  // Global fail-open · canon §148 honest reporting · NO production block by us.
  if (process.env.AGENT_SAFETY_ENABLED === 'false') {
    // STUB · Sentry.captureMessage pending in build phase
    return { allow: true, gates: [], shadow_blocks: [], request_id }
  }

  try {
    // Gate 1 · §149 (sync · pure function)
    const g1 = validateWorkflowId(ctx)
    // Gate 2 · §150 G3 (async · 1-2 DB ops)
    const g2 = await checkIdempotency(ctx, supabase)
    // Gate 3 · §150 G6 (async · 1-3 RPC calls)
    const g3 = await checkRateLimit(ctx, supabase)

    const gates = [g1, g2, g3]
    const blockingGate = gates.find((g) => g.enforced)
    const shadow_blocks = gates
      .filter((g) => g.would_reject && !g.enforced)
      .map((g) => g.gate)

    // STUB · audit row INSERT to agent_safety_audit pending build phase ·
    // Real impl: await recordSafetyPass(supabase, { request_id, ctx, gates, blockingGate, shadow_blocks })
    // STUB · Slack ping for shadow blocks (1/10/100/1000 logarithmic) pending build phase

    return {
      allow: !blockingGate,
      gates,
      block_gate: blockingGate?.gate,
      block_reason: blockingGate?.reason,
      shadow_blocks,
      request_id,
    }
  } catch {
    // Fail-open · NO production block on middleware bug. Spec §2.4 canon.
    // STUB · Sentry.captureException pending build phase
    return { allow: true, gates: [], shadow_blocks: [], request_id }
  }
}
