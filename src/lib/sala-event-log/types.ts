/**
 * Canonical types for `src/lib/sala-event-log/` · ADR-009 schema mirror
 *
 * Source of truth canon canonical · `supabase/migrations/202606021946_sala_event_log.sql`
 * (PR #141 · ADR-009 CERRADO 2026-06-02 · NO applied yet · §144 gated).
 *
 * Sprint 12 Fase 0 Track A · CC#1 owner. Library provides append/read/projection
 * over `sala_event_log` · idempotency by business-key · tenant-scoped RLS-respected.
 *
 * Out of scope per ADR-009 §CIERRE OPUS #7:
 *   - CAP / dispatch budget enforcement (lives in router · this lib only RECORDS
 *     `budget_blocked` event when G6 bucket trips)
 *   - cost_usd (lives in `agent_invocations` · this log REFERENCES via `agent_invocation_ref`)
 *
 * §148 honest · types are CONSUME-side of the schema · this lib does NOT define
 * the schema · canon-mirrors it. If schema PR #141 changes · types change in lockstep.
 */

// =====================================================================
// Enums · 3 canonical types canon canonical from migration §1
// =====================================================================

/** Canon canonical 10 event_type values · ADR-009 ronda 3 §Enum + §H additions */
export const EVENT_TYPES = [
  'dispatch_requested',
  'step_started',
  'step_completed',
  'step_failed',
  'handoff',
  'gate_pending',
  'gate_resolved',
  'needs_judgment',
  'judgment_resolved',
  'budget_blocked',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** Canon canonical 4 step_state values · ADR-009 ronda 3 field #17 */
export const STEP_STATES = ['pending', 'running', 'done', 'failed'] as const
export type StepState = (typeof STEP_STATES)[number]

/** Canon canonical 3 gate_type values · ADR-009 ronda 3 §H flag #5 */
export const GATE_TYPES = ['hitl', 'camino_iii', '§144'] as const
export type GateType = (typeof GATE_TYPES)[number]

/** Canon canonical · event types that are gate events (require gate_type to be set) */
export const GATE_EVENT_TYPES: ReadonlyArray<EventType> = [
  'gate_pending',
  'gate_resolved',
] as const

// =====================================================================
// Event shapes · input (append) + persisted (read)
// =====================================================================

/**
 * Canon canonical · provenance tag shape · OWNED by ADR-009 · CONSUMED by
 * ADR-012 (ingress filter). When ADR-012 emits a tagged ingress · this top-
 * level JSONB carries the same shape into the event log · §148 single
 * source of definition (no double-truth · the costura).
 */
export interface ProvenanceTag {
  source: string
  ingress_id: string
  session_id: string
  trust_level: 'untrusted' | 'tenant_trusted' | 'system_trusted'
  received_at: string
  ingress_route: string
}

/**
 * Canon canonical · event input shape for `append()`.
 *
 * Caller provides the business fields. Library fills:
 *   - `event_id` (auto-generated UUID v4 if absent)
 *   - `sequence` (monotonic per stream · enforced by UNIQUE constraint)
 *   - `occurred_at` (defaults to now() · caller can override for replay)
 *   - `created_at` (DB default · audit trail)
 *
 * Caller MUST provide `idempotency_key` OR the canonical inputs to build one
 * via `buildIdempotencyKey()` (operation_type + client_id + logical_period
 * [+ input_hash]).
 */
export interface EventAppendInput {
  /** Optional canon canonical · auto-generated if absent */
  event_id?: string

  /** Required canon canonical · multi-tenant isolation · RLS-scoped */
  tenant_id: string

  /** Required canon canonical · business entity · part of idempotency + CAP */
  client_id: string

  /** Required canon canonical · journey/campaign instance · sequence is per-stream */
  stream_id: string

  /** Required canon canonical · end-to-end traza */
  correlation_id: string

  /** Optional canon canonical · event_id of CAUSE event · cadena causal */
  causation_id?: string | null

  /** Required canon canonical · 10 enum values */
  event_type: EventType

  /** Required canon canonical · libreto (A/B/C/D/E/NEXUS/...) */
  journey_type: string

  /** Required canon canonical · business operation · part of idempotency_key */
  operation_type: string

  /** Required canon canonical · UNIQUE · canon canonical buildIdempotencyKey() helper */
  idempotency_key: string

  /** Required canon canonical · period/cause scoping · part of idempotency_key */
  logical_period: string

  /** Optional canon canonical · component of idempotency_key (per flag #1) */
  input_hash?: string | null

  /** Optional canon canonical · opaque ejecutor run id · §151 leak-free */
  workflow_run_id?: string | null

  /** Optional canon canonical · step within the run */
  step_id?: string | null

  /** Optional canon canonical · NULL when not a step event */
  step_state?: StepState | null

  /** Optional canon canonical · ejecutor retry counter */
  attempt?: number | null

  /** Required canon canonical · event data (defaults to {} via DB) */
  payload?: Record<string, unknown>

  /** Optional canon canonical · ADR-012 ingress trail */
  provenance_tag?: ProvenanceTag | null

  /** Optional canon canonical · FK to agent_invocations.id */
  agent_invocation_ref?: string | null

  /** Optional canon canonical · MUST be set IF event_type in GATE_EVENT_TYPES */
  gate_type?: GateType | null

  /** Optional canon canonical · wall-clock override (canon canonical replay) */
  occurred_at?: string

  /** Optional canon canonical · explicit sequence override (canon canonical replay/import) */
  sequence?: number
}

/**
 * Canon canonical · persisted event shape returned by `read()`. Mirrors the
 * 22-column table exactly · canon canonical field-by-field.
 */
export interface PersistedEvent {
  event_id: string
  sequence: number
  occurred_at: string
  tenant_id: string
  client_id: string
  stream_id: string
  correlation_id: string
  causation_id: string | null
  event_type: EventType
  journey_type: string
  operation_type: string
  idempotency_key: string
  logical_period: string
  input_hash: string | null
  workflow_run_id: string | null
  step_id: string | null
  step_state: StepState | null
  attempt: number | null
  payload: Record<string, unknown>
  provenance_tag: ProvenanceTag | null
  agent_invocation_ref: string | null
  gate_type: GateType | null
  created_at: string
}

// =====================================================================
// Append result · canon canonical signal idempotency dedup
// =====================================================================

export interface AppendResult {
  /** Canon canonical · the persisted event (canon canonical EITHER newly inserted OR canon-canonical pre-existing dedup match) */
  event: PersistedEvent
  /** Canon canonical · TRUE if this append created a new row · FALSE if dedup hit (UNIQUE idempotency_key) */
  inserted: boolean
}

// =====================================================================
// Read filters · canon canonical query parameters
// =====================================================================

export interface ReadFilters {
  /** Canon canonical · MUST be set for tenant-scoped reads (RLS canon canonical) */
  tenant_id: string

  /** Optional canon canonical · filter by client */
  client_id?: string

  /** Optional canon canonical · filter by stream (canon canonical per-stream ordering) */
  stream_id?: string

  /** Optional canon canonical · filter by correlation chain */
  correlation_id?: string

  /** Optional canon canonical · filter by event_type (single or list) */
  event_type?: EventType | EventType[]

  /** Optional canon canonical · filter by journey_type */
  journey_type?: string

  /** Optional canon canonical · time window (ISO 8601) · canon canonical occurred_at >= since */
  since?: string

  /** Optional canon canonical · time window (ISO 8601) · canon canonical occurred_at < until */
  until?: string

  /** Optional canon canonical · max rows · default 100 · max 1000 */
  limit?: number

  /** Optional canon canonical · order · default 'sequence_asc' (canon canonical canon canonical per-stream) */
  order?: 'sequence_asc' | 'sequence_desc' | 'occurred_at_desc'
}

// =====================================================================
// Storage adapter interface · canon canonical canon canon InMemoryStorage + SupabaseStorage
// =====================================================================

export interface EventLogStorage {
  /**
   * Canon canonical · INSERT event · enforces UNIQUE(idempotency_key) and
   * UNIQUE(stream_id, sequence). Returns the row (or canon canonical pre-
   * existing on dedup) plus `inserted` boolean.
   *
   * Implementation MUST:
   *   - reject if event_type IN GATE_EVENT_TYPES but gate_type IS NULL (CHECK)
   *   - reject if event_type NOT IN GATE_EVENT_TYPES but gate_type IS NOT NULL
   *   - allocate next sequence per stream_id atomically (canon canonical-monotonic)
   *   - return existing row on UNIQUE(idempotency_key) collision (NOT throw)
   *   - throw on UNIQUE(stream_id, sequence) collision (canon canonical caller MUST retry with fresh sequence)
   */
  insert(input: EventAppendInput): Promise<AppendResult>

  /**
   * Canon canonical · canon canonical SELECT · tenant_id filter is REQUIRED
   * (RLS-respected canon canonical · prevents cross-tenant leak by design).
   *
   * Implementation MUST:
   *   - filter rows by tenant_id (NEVER return rows from other tenants)
   *   - apply optional filters (client_id, stream_id, correlation_id,
   *     event_type, journey_type, time window)
   *   - order per `order` param (default sequence_asc per-stream)
   *   - cap rows at `limit` (default 100 · max 1000)
   */
  select(filters: ReadFilters): Promise<PersistedEvent[]>

  /**
   * Canon canonical · helper to lookup by idempotency_key. Used by
   * `append()` to short-circuit dedup. Returns null if not found.
   */
  findByIdempotencyKey(
    tenant_id: string,
    idempotency_key: string,
  ): Promise<PersistedEvent | null>
}
