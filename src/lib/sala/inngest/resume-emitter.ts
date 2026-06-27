/**
 * Editorial resume seam · the "G6 hook" (SALA_G6_HOOK_MODE) · Sprint 12 Fase 0
 * Inngest binding · §144 · SHADOW (default · NEVER emits live until §144 flip).
 *
 * ⚠️ NAMING note (§148) · the dispatch called this the "G6 · Supabase hook".
 * That is distinct from the EXISTING G6 BUDGET hook
 * (`src/lib/sala/g6/supabase-g6-budget-hook.ts` · cost cap · flag
 * `SALA_G6_HOOK_ENABLED`). THIS file is the RESUME hook · it fires the Inngest
 * `editorial/decision.resolved` event so the durable gate (editorial-gate.ts)
 * wakes when a human resolves a Camino III review. It is gated by its OWN flag
 * `SALA_G6_HOOK_MODE` per the dispatch · default 'shadow'.
 *
 * Flow · human resolves `camino_iii_reviews` (status → approved/rejected/…,
 * hitl_resolved_by/at set) → the resolve path calls `emitEditorialResolution`
 * → in 'live' mode it `inngestClient.send(editorial/decision.resolved)` →
 * Inngest matches the waiting `editorialGateFn` by `review_id` → the gate
 * resumes. In 'shadow' (default) it LOGS the intended emit and returns
 * `{ sent: false, mode: 'shadow' }` · the wire shape is proven without any
 * real cloud emit.
 *
 * Trigger source options (the actual Supabase wiring · §144 escalón) ·
 *   A · the HITL resolve endpoint (`/api/sala/hitl/resolve` · NOT in main yet)
 *       calls this after it updates the review row. PREFERRED · testable, in
 *       the request path, no extra infra.
 *   B · a Supabase trigger on `camino_iii_reviews` UPDATE → `pg_net` POST to a
 *       thin route that calls this. Needs pg_net + a route · documented as the
 *       alternative, NOT built here.
 * This file builds the EMIT seam (A's callee · reusable by B) · §148 honest ·
 * neither A nor B is wired live in this branch.
 */
import { inngestClient } from './client'
import {
  EDITORIAL_DECISION_RESOLVED_EVENT,
  type EditorialResolution,
} from './editorial-gate'
import { verdictToResolutionStatus } from './editorial-writeback'

/** Mode of the resume hook · 'shadow' default (NEVER emits) · 'live' opt-in. */
export type ResumeHookMode = 'shadow' | 'live'

export function getResumeHookMode(): ResumeHookMode {
  return process.env.SALA_G6_HOOK_MODE === 'live' ? 'live' : 'shadow'
}

/** Minimal shape of an `editorial_decisions` row needed to build the event.
 *  The HUMAN verdict lives here (CC#2 migration 202606270010) · NOT in
 *  camino_iii_reviews (which holds the review header for the individual votes). */
export interface EditorialDecisionRow {
  readonly review_id: string
  /** Lifecycle · 'PENDING' | 'RESOLVED'. Only RESOLVED rows emit a resume. */
  readonly status: string
  /** Human verdict · 'PASS' | 'REJECT' | 'ESCALATE' (null while PENDING). */
  readonly final_verdict?: string | null
  readonly resolved_by?: string | null
  readonly rationale?: string | null
}

/** Map a RESOLVED `editorial_decisions` row → the resume event payload. Returns
 *  null when the row is still PENDING or has no final verdict (nothing to emit).
 *  Translates the `final_verdict` (PASS/REJECT/ESCALATE) into the gate's neutral
 *  resolution vocabulary (approved/rejected/escalated_hitl). */
export function buildEditorialResolutionFromDecisionRow(
  row: EditorialDecisionRow,
): EditorialResolution | null {
  if (row.status !== 'RESOLVED') return null
  const status = verdictToResolutionStatus(row.final_verdict)
  if (status === null) return null
  return {
    review_id: row.review_id,
    status,
    resolved_by: row.resolved_by ?? null,
    decision_reason: row.rationale ?? null,
  }
}

/** Injected client surface · only `.send` is consumed · tests stub it. */
export interface ResumeEmitterClient {
  send(input: { name: string; data: Record<string, unknown> }): Promise<unknown>
}

export interface EmitEditorialResolutionResult {
  readonly sent: boolean
  readonly mode: ResumeHookMode
  readonly review_id: string
  /** Present on failure (live mode) · the send rejected · §148 swallowed. */
  readonly error?: string
}

export interface EmitEditorialResolutionDeps {
  /** Override the mode (tests). Default · `getResumeHookMode()`. */
  readonly mode?: ResumeHookMode
  /** Override the Inngest client (tests). Default · the real singleton. */
  readonly client?: ResumeEmitterClient
  /** Injectable logger · default console. */
  readonly logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void
    info(msg: string, ctx?: Record<string, unknown>): void
  }
}

const defaultLogger = {
  warn(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[sala/resume-hook] ${msg}`, ctx ?? {})
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.log(`[sala/resume-hook] ${msg}`, ctx ?? {})
  },
}

/**
 * Emit the `editorial/decision.resolved` event so the durable gate resumes.
 * SHADOW (default) · logs the intended emit, does NOT call the cloud, returns
 * `{ sent: false }`. LIVE · sends via the Inngest client. NEVER throws · a
 * send failure is logged + returned as `{ sent: false, error }` so the caller
 * (resolve endpoint) is never broken by the resume hook.
 */
export async function emitEditorialResolution(
  resolution: EditorialResolution,
  deps: EmitEditorialResolutionDeps = {},
): Promise<EmitEditorialResolutionResult> {
  const mode = deps.mode ?? getResumeHookMode()
  const logger = deps.logger ?? defaultLogger
  const client = deps.client ?? inngestClient

  if (mode !== 'live') {
    logger.info('shadow · resume emit suppressed', {
      review_id: resolution.review_id,
      status: resolution.status,
      event: EDITORIAL_DECISION_RESOLVED_EVENT,
    })
    return { sent: false, mode, review_id: resolution.review_id }
  }

  try {
    await client.send({
      name: EDITORIAL_DECISION_RESOLVED_EVENT,
      data: {
        review_id: resolution.review_id,
        status: resolution.status,
        resolved_by: resolution.resolved_by ?? null,
        decision_reason: resolution.decision_reason ?? null,
      },
    })
    logger.info('live · resume event sent', {
      review_id: resolution.review_id,
      status: resolution.status,
    })
    return { sent: true, mode, review_id: resolution.review_id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.warn('live · resume emit FAILED · fail_open', {
      review_id: resolution.review_id,
      error,
    })
    return { sent: false, mode, review_id: resolution.review_id, error }
  }
}
