/**
 * Canon canonical types · sala-ingress library
 *
 * Implements Opus VEREDICTO 2026-06-05 · `ESCALADA-Opus-arquitectura-
 * entradas-sala-multidepto-2026-06-05.md` §VEREDICTO + §BUILD SPEC.
 *
 * Mechanism canon · POST /api/sala/intake (typed envelope) → EMITS event
 * to sala_event_log → router (separately) reads + dispatches. NEVER
 * `intake → dispatch` (would be 2 dispatchers · violates ADR-018).
 *
 * §148 honest · this library covers the INGRESS mechanism only · the
 * downstream router→worker dispatch chain is wired separately by the
 * router/dispatcher already shipped (PR #172 Model B adapter).
 */

/**
 * Canon canonical · 3-tier confidence taxonomy · ADR-012 auto-enable
 * varies by tier · ingress_sources.tier column constraint.
 */
export type SourceTier = 'A' | 'B' | 'C'

/**
 * Canon canonical · 3 auth methods per tier ·
 *   - 'internal_key' · tier A · trusted internal callers (Emilio MC ·
 *     internal cron · agent supervisor) · x-api-key matched against
 *     INTERNAL_API_KEY (canon dual-auth pattern)
 *   - 'hmac' · tier B · partner CRM with shared HMAC secret · header
 *     `x-source-signature` validated against payload+timestamp+secret
 *   - 'public_gate' · tier C · public/untrusted sources · ADR-012 full
 *     filter + rate limit + maybe gate before append (not built yet)
 */
export type AuthMethod = 'internal_key' | 'hmac' | 'public_gate'

/**
 * Canon canonical · ingress_sources row shape · mirrors the migration
 * 202606051700_sala_ingress_sources_routing_rules.sql.
 */
export interface IngressSource {
  readonly source: string
  readonly tier: SourceTier
  readonly auth_method: AuthMethod
  readonly auth_secret_env_var: string | null
  readonly intents_allowed: ReadonlyArray<string>
  readonly description: string | null
  readonly active: boolean
}

/**
 * Canon canonical · routing_rules row shape · mirrors the migration.
 * `worker_workflow_id` is nullable for journeys without Model B opt-in
 * (legacy agent path · router emits target='agent' instead).
 */
export interface RoutingRule {
  readonly id: string
  readonly source: string
  readonly intent: string
  readonly journey_type: string
  readonly worker_workflow_id: string | null
  readonly active: boolean
  readonly priority: number
  readonly description: string | null
}

/**
 * Canon canonical · the typed envelope POSTed to /api/sala/intake. NO
 * downstream behavior is gated on undeclared fields · the canon shape
 * is small + stable + extensible (payload object is opaque to the
 * mechanism · routing/auth/idempotency happen on the envelope).
 */
export interface IngressEnvelope {
  /** Canon canonical · source key · MUST match an `ingress_sources.source`
   *  row · examples: 'ventas/deal-won' · 'emilio-manual' · 'marketing/
   *  campaign-brief'. The `/`-separator is a soft convention · NOT
   *  enforced · letters/digits/`-`/`_`/`/` allowed. */
  readonly source: string

  /** Canon canonical · intent verb · MUST be in `intents_allowed` of the
   *  source · examples: 'onboard' · 'campaign' · 'review'. */
  readonly intent: string

  /** Canon canonical · opaque payload object · the routing/auth/dedup
   *  machinery NEVER reads from payload · the journey/worker downstream
   *  consumes it. */
  readonly payload: Record<string, unknown>

  /** Canon canonical · the dedup key · combined with the source +
   *  intent + logical_period yields the sala_event_log idempotency_key
   *  via `buildIdempotencyKey`. Two POSTs with the same envelope key
   *  collapse to one stream (canon §150 G3 + STOP-2 a). */
  readonly idempotency_key: string

  /** Canon canonical · the period scope · `2026-W23` style ISO week ·
   *  or `2026-06-05` date · or `manual` for unscoped manual emits.
   *  Combined with idempotency_key for dedup. */
  readonly logical_period: string

  /** Canon canonical · tenant scope · single-tenant per canon V4 §2 ·
   *  expects a string · 'naufrago' for the piloto · UUID for future
   *  multi-tenant. */
  readonly tenant_id: string

  /** Canon canonical · client scope · the business entity ·
   *  examples: `d69100b5-...` (Náufrago UUID) · client slug for future
   *  multi-tenant. */
  readonly client_id: string

  /** Optional canon canonical · upstream-generated correlation id ·
   *  if absent, the ingress mints one. */
  readonly correlation_id?: string

  /** Optional canon canonical · upstream-generated stream id ·
   *  intake usually mints stream_id deterministically from the
   *  envelope; this field allows replay/import scenarios. */
  readonly stream_id?: string
}

/**
 * Canon canonical · auth context for a given request ·
 *   - 'internal_key' tier · `internal_key` carries the `x-api-key` value
 *   - 'hmac' tier · `signature` + `timestamp` extracted from headers
 *   - 'public_gate' tier · no auth data extracted (gate runs on body)
 */
export interface IngressAuthRequest {
  readonly source: string
  readonly internal_key?: string
  readonly signature?: string
  readonly timestamp?: string
  readonly raw_body?: string
}

/**
 * Canon canonical · ingress result · TOTAL · each result kind tells
 * the route handler what HTTP shape to emit. The mechanism NEVER
 * dispatches · only the event-log append (or refused).
 */
export type IngressResult =
  | {
      readonly kind: 'accepted'
      readonly event_id: string
      readonly stream_id: string
      readonly journey_type: string
      readonly worker_workflow_id: string | null
      readonly inserted: boolean
    }
  | {
      readonly kind: 'duplicate'
      readonly event_id: string
      readonly stream_id: string
      readonly journey_type: string
      readonly worker_workflow_id: string | null
    }
  | {
      readonly kind: 'refused'
      readonly code: RefuseCode
      readonly detail: string
    }

export type RefuseCode =
  | 'flag_disabled'
  | 'invalid_envelope'
  | 'unknown_source'
  | 'source_inactive'
  | 'unauthorized'
  | 'intent_not_in_scope'
  | 'no_routing_rule'
  | 'append_failed'
  | 'tier_c_filter_not_implemented'

/**
 * Canon canonical · database adapter contract · the orchestrator
 * receives this as a config so tests can inject in-memory stores
 * without spinning Supabase.
 */
export interface IngressTablesAdapter {
  getSource(source: string): Promise<IngressSource | null>
  getRoutingRule(source: string, intent: string): Promise<RoutingRule | null>
}
