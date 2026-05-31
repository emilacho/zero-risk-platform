/**
 * killSwitch · agent-safety orchestrator
 *
 * Single entry point invoked by both route handlers
 * (`/api/agents/run` legacy + `/api/agents/run-sdk` canon) and by the
 * Railway `agent-runner` Express middleware (defense-in-depth · deferred PR).
 *
 * Runs all 3 gates in canonical order, records audit row, returns
 * `allow + block reason` tuple.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §2.4
 *
 * IMPLEMENTATION STATUS · 🟢 BUILD-PHASE · gates wired + audit row write.
 * Slack ping = stub stdout breadcrumb (see audit-log.ts §maybeSlackPingShadow).
 *
 * Env toggle ·
 *   AGENT_SAFETY_ENABLED=false → global short-circuit · returns allow=true ·
 *                                never blocks · canon fail-open per §148.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvocationContext, SafetyDecision } from './types'
import { validateWorkflowId } from './validate-workflow-id'
import { checkIdempotency } from './check-idempotency'
import { checkRateLimit } from './check-rate-limit'
import {
  recordSafetyPass,
  maybeSlackPingShadow,
  type EndpointLabel,
} from './audit-log'

export async function killSwitch(
  ctx: InvocationContext,
  supabase: SupabaseClient,
  endpoint: EndpointLabel = '/api/agents/run-sdk',
): Promise<SafetyDecision> {
  const request_id = randomUUID()

  if (process.env.AGENT_SAFETY_ENABLED === 'false') {
    // Global fail-open · canon §148 honest reporting · NO production block by us.
    return { allow: true, gates: [], shadow_blocks: [], request_id }
  }

  try {
    // Gate 1 · §149 (sync · pure function)
    const g1 = validateWorkflowId(ctx)
    // Gate 2 · §150 G3 (async · 1-2 DB ops)
    const g2 = await checkIdempotency(ctx, supabase)
    // Gate 3 · §150 G6 (async · 1-N RPC calls per bucket)
    const g3 = await checkRateLimit(ctx, supabase)

    const gates = [g1, g2, g3]
    const blockingGate = gates.find((g) => g.enforced)
    const shadow_blocks = gates
      .filter((g) => g.would_reject && !g.enforced)
      .map((g) => g.gate)

    // Persist audit row · fail-open semantics inside recordSafetyPass.
    await recordSafetyPass(supabase, { request_id, ctx, gates, endpoint })

    // Shadow visibility · stdout breadcrumb (Vercel function logs).
    // Build-phase 2 hooks real Slack webhook + logarithmic ping (1/10/100/1000).
    for (const gateName of shadow_blocks) {
      maybeSlackPingShadow(gateName, ctx)
    }

    return {
      allow: !blockingGate,
      gates,
      block_gate: blockingGate?.gate,
      block_reason: blockingGate?.reason,
      shadow_blocks,
      request_id,
    }
  } catch (e) {
    // Fail-open · NO production block on middleware bug. Spec §2.4 canon.
    // Build-phase 2 hooks Sentry.captureException here.
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[agent-safety/kill-switch] uncaught · fail-open:', msg)
    return { allow: true, gates: [], shadow_blocks: [], request_id }
  }
}
