/**
 * Canon canonical · JOURNEY_WORKFLOW_MAP · Sprint 12 Fase 0 prep finale.
 *
 * Model B (conexión 2026-06-05) · per-journey config that maps a
 * canonical journey to the existing n8n worker workflow that runs it.
 * The sala router emits `DispatchDecision{target:'workflow'}` and the
 * dispatcher uses this map to find the webhook URL to POST to.
 *
 * §148 honest · this map encodes ground-truth from n8n live ·
 *   - Workflow IDs verified via n8n REST API 2026-06-05
 *   - ONBOARD targets `LyVoKcrypS5uLyuu` (Client Onboarding E2E v2 ·
 *     21 nodes · Webhook Deal Won entry point) per Phase 1 scope
 *     (entry-bounded · NOT the 32-node RwUo full pipeline · Emilio
 *     decision 2026-06-05 for Náufrago Phase 1)
 *   - Other journeys (PRODUCE, ACQUIRE, etc) intentionally LEFT
 *     UNMAPPED · they remain `target='agent'` (legacy) until each
 *     journey gets its §144 to opt-in to Model B
 *
 * §148 explicit · this file is READ-ONLY data · cero side effects.
 * Reversibility · removing an entry returns the journey to legacy
 * `target='agent'` path (router default behavior).
 */
import type { JourneyType } from '@/lib/sala/libretos'

export interface JourneyWorkflowTarget {
  /** Canon canonical · n8n workflow_id (from `GET /api/v1/workflows`). */
  readonly workflow_id: string
  /** Canon canonical · the webhook `path` registered on the workflow's
   *  webhook node (just the path · NOT the full URL · canon mirror of
   *  n8n's workflow.nodes[0].parameters.path). */
  readonly webhook_path: string
  /** Canon canonical · human-readable name for audit + Slack alerts. */
  readonly worker_name: string
  /** Canon canonical · phase boundaries the worker emits to
   *  `/api/sala/events/append` for OBSERVE-mode reconciliation.
   *  When the sala receives one of these step_ids, it compares against
   *  the libreto's expected next step · mismatch → alert. */
  readonly phase_boundaries: ReadonlyArray<string>
  /** Canon canonical · idempotency suffix · combined with stream_id
   *  to derive the dispatch idempotency key · two dispatch-decisions
   *  for the same stream MUST collapse to one webhook fire (STOP-2
   *  dimension (a) · dispatch-único). */
  readonly idempotency_suffix: string
}

/**
 * Canon canonical · per-journey mapping. ONBOARD is the only entry
 * for Phase 1 Náufrago. Other journeys deliberately UNMAPPED ·
 * legacy `target='agent'` path until each §144 opt-in.
 */
export const JOURNEY_WORKFLOW_MAP: Readonly<
  Partial<Record<JourneyType, JourneyWorkflowTarget>>
> = Object.freeze({
  ONBOARD: {
    workflow_id: 'LyVoKcrypS5uLyuu',
    webhook_path: 'zero-risk/deal-won-onboarding',
    worker_name: 'Client Onboarding E2E v2 (Webhook Deal Won)',
    phase_boundaries: [
      'deal_won_received',
      'onboarding_specialist_done',
      'notion_workspace_created',
      'success_plan_built',
      'kickoff_scheduled',
      'mc_inbox_notified',
      'cliente_persisted',
      'journey_completed',
    ],
    idempotency_suffix: 'onboard-worker-dispatch',
  },
  // PRODUCE, ACQUIRE, ALWAYS_ON, REVIEW, GROWTH · intentionally
  // unmapped until each journey gets its §144 opt-in. The router will
  // emit `target='agent'` (default) for them, matching legacy behavior.
})

/** Canon canonical · returns the worker target for a journey OR
 *  undefined when the journey is not mapped (legacy `agent` path). */
export function getJourneyWorkflowTarget(
  journey_type: JourneyType,
): JourneyWorkflowTarget | undefined {
  return JOURNEY_WORKFLOW_MAP[journey_type]
}

/** Canon canonical · whether the journey has Model B opt-in. Used by
 *  callers (router consumers, dashboards) to decide whether to expect
 *  worker-driven OR agent-driven flow. */
export function isWorkflowJourney(journey_type: JourneyType): boolean {
  return getJourneyWorkflowTarget(journey_type) !== undefined
}
