/**
 * Journey Orchestrator · L1 Master Dispatcher · type definitions
 *
 * Sprint 1 · 2026-05-20 · CC#1
 *
 * Per `docs/05-orquestacion/MASTER_WORKFLOW_DESIGN.md` the system has 6
 * canonical journeys (A-F). L1 dispatcher routes inbound triggers to the
 * correct L2 orchestrator and persists state in `client_journey_state`.
 */

/** The 6 canonical journey types per MASTER_WORKFLOW_DESIGN.md. */
export const JOURNEY_TYPES = [
  'ACQUIRE',
  'ONBOARD',
  'PRODUCE',
  'ALWAYS_ON',
  'REVIEW',
  'GROWTH',
] as const

export type JourneyType = (typeof JOURNEY_TYPES)[number]

/** Trigger sources that can initiate a journey dispatch. */
export const TRIGGER_TYPES = [
  'manual', // Mission Control UI button
  'webhook', // External lead capture etc.
  'cascade_done', // L2 cascade completion callback (chains journeys)
  'cron', // Scheduled Journey D supervisors
  'anomaly_detected', // Always-on monitoring escalation
  'hitl_resolved', // Mission Control HITL approval webhook
  'resume_stuck', // Manual unstick of a paused journey (Peniche smoke)
] as const

export type TriggerType = (typeof TRIGGER_TYPES)[number]

/** Status values for a `client_journey_state` row. */
export const JOURNEY_STATUSES = [
  'active',
  'paused_hitl',
  'completed',
  'failed',
] as const

export type JourneyStatus = (typeof JOURNEY_STATUSES)[number]

/** Inbound payload to `POST /api/journey/dispatch`. */
export interface DispatchRequest {
  /** Client UUID. Required for all journeys EXCEPT ACQUIRE (lead-capture pre-client). */
  client_id?: string | null
  journey: JourneyType
  trigger_type: TriggerType
  /** Stage label inside the journey. Optional · L2 may infer from `params`. */
  stage?: string | null
  /** Free-shape journey-specific payload (form fields · ad params · etc). */
  params?: Record<string, unknown>
  /** Optional parent journey · for chained journeys (e.g. C→D handoff). */
  parent_journey_id?: string | null
  /** Free-text source tag · "mission_control" · "ghl_webhook" · etc. */
  trigger_source?: string
}

/** Result returned from `dispatchJourney()`. */
export interface DispatchResult {
  ok: boolean
  journey_id: string
  journey: JourneyType
  /** What we did with the L2 dispatch · ok · stubbed · failed · skipped. */
  dispatch_status: 'dispatched' | 'stubbed' | 'failed' | 'skipped'
  /** Identifier of the L2 target invoked (URL · workflow id · etc). */
  l2_target?: string | null
  /** ISO timestamp · next polling check for long-running L2. */
  next_check_at?: string | null
  /** Error message if dispatch_status === 'failed'. */
  error?: string
  /** Debug · what we tried. */
  details?: Record<string, unknown>
}

/** Row shape we read/write from `client_journey_state`. */
export interface JourneyStateRow {
  id: string
  client_id: string | null
  journey: JourneyType
  current_stage: string | null
  status: JourneyStatus
  trigger_type: TriggerType
  trigger_source: string | null
  trigger_payload: Record<string, unknown>
  metadata: Record<string, unknown>
  hitl_pending_count: number
  hitl_resolved_count: number
  last_hitl_at: string | null
  parent_journey_id: string | null
  outcome: string | null
  outcome_data: Record<string, unknown>
  error_count: number
  last_error: string | null
  last_error_at: string | null
  started_at: string
  updated_at: string
  completed_at: string | null
}
