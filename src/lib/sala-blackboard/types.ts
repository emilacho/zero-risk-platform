/**
 * Canon canonical · `sala-blackboard` types · Sprint 12 Fase 0 Ronda 2 Track D
 *
 * Spec · `SALA-FASE0-ronda2-substrate-router.md` Track D · cerrar gap #5
 * (NEXUS merge ad-hoc en JS) via blackboard compartido **derivado del
 * event-log** · proyección append-only · sin estado mutable paralelo.
 *
 * Convención canon canonical · cada paso del libreto que escribe artefactos
 * emite un evento canon `step_completed` (o equivalente) con `payload.
 * artifact_writes: ArtifactWrite[]`. El blackboard NO tiene tabla propia
 * · la lib proyecta el state actual leyendo los eventos del log.
 *
 * Source canon canonical del log · `src/lib/sala-event-log/` (Track A · PR #143).
 */

// =====================================================================
// Artifact write convention · payload-level (canon canonical-canon canon-canon-derivado del log)
// =====================================================================

/**
 * Canon canonical · single artifact write embedded en `event.payload.artifact_writes[]`.
 *
 * Caller (step) describes what artifact se escribió. `key` is the
 * canonical canon canon canon canon-blackboard slot · `value` puede ser
 * cualquier JSON serializable (object · array · string · number · null).
 */
export interface ArtifactWrite {
  /** Canon canonical · stable slot · canon canonical "brand_voice" · "target_audience" · "creative_brief" */
  key: string
  /** Canon canonical · JSON serializable · canon canon-arbitrary structure */
  value: unknown
  /** Optional canon canonical · agent_id or operator that produced this artifact */
  written_by?: string
  /**
   * Optional canon canonical · semantic version of the artifact (canon canon-canon-content-aware).
   * NOTA canon canonical · este es independent del `version` derivado de la projection
   * (canon-canonical-canon-canon canon-overwrite count per key).
   */
  semantic_version?: string
}

/**
 * Canon canonical · canonical payload shape · canon canon canon-event.payload contains
 * `artifact_writes: ArtifactWrite[]` to indicate "this step updated these artifacts".
 *
 * Other payload keys son canon canonical-libre · canon canon-only `artifact_writes`
 * is read by the blackboard projection.
 */
export interface ArtifactWritePayload {
  artifact_writes?: ArtifactWrite[]
  [k: string]: unknown
}

// =====================================================================
// Projected state · canonical "current view" of the blackboard
// =====================================================================

/**
 * Canon canonical · single artifact slot en el estado canonical-proyectado.
 *
 * `version` cuenta canonical-cuántos writes acumulan para esta key (1 = first
 * write, 2 = first overwrite, etc · canon-canon-canon-monotonic). Last-write-wins
 * canon · canonical `value` siempre es el más reciente per sequence order.
 */
export interface CampaignArtifact {
  /** Canon canonical · the slot key */
  key: string
  /** Canon canonical · the last-write-wins value */
  value: unknown
  /** Canon canonical · 1-based overwrite count · canon canon-canon-monotonic */
  version: number
  /** Canon canonical · ISO 8601 · canon canon canon canonical-occurred_at of the LATEST write */
  written_at: string
  /** Canon canonical · canon canon canon canon-event.event_id of the LATEST write event */
  written_by_event_id: string
  /** Optional canon canonical · canon canon canon-agent_id o operator */
  written_by?: string
  /** Optional canon canonical · canon canon canon-semantic version of the latest write */
  semantic_version?: string
}

/**
 * Canon canonical · canonical state snapshot · projected from the event log.
 *
 * Caller queries this for "what does the blackboard look like AT THIS POINT".
 * Equivalent to a materialized view canon canon-canon-rebuildable from replay.
 */
export interface BlackboardState {
  /** Canon canonical · scope · canon canon-canon-stream_id (campaign instance) */
  campaign_id: string
  /** Canon canonical · canon canon canon-tenant scope · canon canon canon-RLS-respected */
  tenant_id: string
  /** Canon canonical · canon canon canon-current artifacts · canonical map by key */
  artifacts: Record<string, CampaignArtifact>
  /** Canon canonical · max sequence canon canon canon-observed in the projection (0 if empty) */
  last_sequence: number
  /** Canon canonical · total events scanned · canon canon canon-debug + audit */
  total_events_scanned: number
  /** Canon canonical · ISO 8601 · canon canon canon-projected_at timestamp */
  projected_at: string
}

// =====================================================================
// Write helper input · what callers pass to writeArtifacts()
// =====================================================================

import type { EventType } from '@/lib/sala-event-log'

/**
 * Canon canonical · input to `writeArtifacts(storage, input)`.
 *
 * Builds an event with `payload.artifact_writes` and calls `append()` on
 * the storage adapter. Caller MUST provide the canonical-business-key
 * fields (tenant_id, campaign_id, client_id, correlation_id, operation_type,
 * logical_period) so the event log idempotency canon canon-canonical-collapses
 * duplicate writes transparently.
 */
export interface WriteArtifactsInput {
  /** Canon canonical · RLS-scoped tenant */
  tenant_id: string
  /** Canon canonical · canonical campaign instance (= stream_id en el log) */
  campaign_id: string
  /** Canon canonical · business entity · canon canon-canon-part of idempotency */
  client_id: string
  /** Canon canonical · canon canon-canon-end-to-end traza */
  correlation_id: string
  /** Optional canon canonical · canon canon canon-cadena causal event_id */
  causation_id?: string | null
  /** Canon canonical · libreto · canon canon canon-routing + CAP scope */
  journey_type: string
  /** Canon canonical · business operation · canon canon canon-part of idempotency_key */
  operation_type: string
  /** Canon canonical · period scoping · canon canon canon-part of idempotency_key */
  logical_period: string
  /** Optional canon canonical · content-aware idempotency component */
  input_hash?: string | null
  /** Optional canon canonical · explicit idempotency key (canon canon-canon-overrides default builder) */
  idempotency_key?: string
  /** Canon canonical · canon canon canon-the artifacts to write · canonical 1+ required */
  artifacts: ArtifactWrite[]
  /** Optional canon canonical · canon canon canon-default 'step_completed' · gate events NOT allowed */
  event_type?: Exclude<EventType, 'gate_pending' | 'gate_resolved'>
  /** Optional canon canonical · canon canon canon-step identifier */
  step_id?: string | null
  /** Optional canon canonical · canon canon canon-step_state · canon canon canon-default 'done' for step_completed */
  step_state?: 'pending' | 'running' | 'done' | 'failed'
  /** Optional canon canonical · canon canon canon-extra payload keys to merge */
  extra_payload?: Record<string, unknown>
  /** Optional canon canonical · canon canon canon-workflow_run_id pass-through */
  workflow_run_id?: string | null
  /** Optional canon canonical · canon canon canon-attempt counter */
  attempt?: number | null
  /** Optional canon canonical · canon canon canon-agent_invocation_ref */
  agent_invocation_ref?: string | null
  /** Optional canon canonical · canon canon canon-occurred_at override (canon canon canon-replay) */
  occurred_at?: string
  /** Optional canon canonical · canon canon canon-sequence override (canon canon canon-replay/import) */
  sequence?: number
}

// =====================================================================
// Read helper input · what callers pass to readBlackboard()
// =====================================================================

export interface ReadBlackboardInput {
  /** Canon canonical · RLS-scoped tenant */
  tenant_id: string
  /** Canon canonical · canonical campaign (= stream_id) */
  campaign_id: string
  /** Optional canon canonical · canon canon canon-time window canon canon-projection up to this point */
  until?: string
  /** Optional canon canonical · canon canon canon-time window canon canon-start from */
  since?: string
  /** Optional canon canonical · canon canon canon-max events to scan · canon canon canon-default 1000 */
  max_events?: number
}
