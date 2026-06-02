/**
 * Canonical types for `src/lib/ingress-filter/` · ADR-012 anti-injection filtro
 *
 * Spec · zr-vault/00-meta/opus-4-8-traspaso/ADR-012-anti-injection-ingress.md
 *       + spec-CC1-ADR-012-build.md (Sprint 12 build phase)
 *
 * Canon canonical · 5 capas defense-in-depth · pipeline orchestrator returns
 * a single `IngressFilterDecision` consumed by call-sites (Vercel handlers ·
 * n8n recepción · cualquier ingress vector activo §2.1 ADR-012).
 *
 * § Costura explícita (canon NO romper · canon canonical "enfermedad del día") ·
 *   - `provenance_tag` campo SHARED entre ADR-012 (este) y ADR-009 event log
 *   - ADR-009 esqueleto OWN la definición canon canonical · ADR-012 CONSUME shape
 *   - Type `ProvenanceTag` declarado AQUÍ canónico CONSUME-side · canon canonical
 *     ADR-009 ratificado puede expandir el shape · drift-prevented via type-only canon
 */

// =====================================================================
// Provenance tag · CONSUMED canon canonical from ADR-009 schema
// =====================================================================

/**
 * Shape canon canonical del provenance tag · CONSUMED desde ADR-009.
 *
 * ⚠️ NO redefinir aquí canon canonical · cuando ADR-009 esqueleto landed con
 * la definición canon · este type se moves to `@/lib/event-log/types`
 * canonical y este file canon canonical re-exports. Mientras tanto · CC#1
 * provide canon canonical shape minimal aligned con ADR-012 §6.6 R3.
 *
 * Source of truth canon · ADR-009 schema kickoff doc.
 */
export interface ProvenanceTag {
  /** Source vector per ADR-012 §2.1 inventario verified · canonical narrow. */
  source:
    | 'tally_form'
    | 'apify_scrape'
    | 'whatsapp_inbound'
    | 'review_monitor'
    | 'dataforseo_scrape'
    | 'email_inbound'
    | 'onboarding_upload'
    | 'notion_comment'
    | 'webhook_generic'
    | 'callback_external'
    | 'legacy_pre_adr012'
    | 'unknown'
  /** UUID v4 · canon canonical per ingress event · cross-table audit anchor. */
  ingress_id: string
  /** 16-char hex randomized canon canonical per session · structural isolation. */
  session_id: string
  /** Canon canonical trust level · default 'untrusted' for any external source. */
  trust_level: 'untrusted' | 'tenant_trusted' | 'system_trusted'
  /** ISO 8601 timestamp · received_at canonical. */
  received_at: string
  /** Endpoint or n8n workflow_id canonical · forensics audit. */
  ingress_route: string
}

// =====================================================================
// Gate decisions · canon canonical per-capa output
// =====================================================================

export type GateName =
  | 'length_charset'    // Capa 5
  | 'schema_validator'  // Capa 4
  | 'regex_deny'        // Capa 2
  | 'classifier'        // Capa 3 · RUFLO encoding canon canonical
  | 'provenance_tag'    // Capa 1 · structural isolation

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'

/**
 * Per-gate decision canon canonical · array of these returned by pipeline.
 *
 * `verdict` canonical · `pass` (gate continues canonical) · `flag` (canonical
 * non-blocking warning · canon canonical aggregated severity) · `block` (canonical
 * gate-decision is BLOCK · respected per-route policy fail-open vs fail-closed).
 */
export interface GateDecision {
  gate: GateName
  verdict: 'pass' | 'flag' | 'block'
  severity: Severity
  latency_ms: number
  /** Optional reason canon canonical · short token · NO free-form (atacante puede inyectar). */
  reason?: string
  /** Optional metadata canon canonical · opaque jsonb per gate. */
  metadata?: Record<string, unknown>
}

// =====================================================================
// Classifier · RUFLO encoding canon canonical (ADR-012 §4.3 + AJUSTE FINAL §144)
// =====================================================================

/**
 * Canon canonical · classifier output shape REUSES RUFLO Smart Router encoding.
 *
 * Spec · ADR-012 §4.3 · AJUSTE FINAL 2026-06-01 · canon §144 Emilio (vendor =
 * Haiku-self + encoding RUFLO).
 *
 * One classification encoding canon canonical across control plane = less drift.
 * `should_escalate_hitl` mapea naturalmente a flujo cuarentena §5.3.
 *
 * Canon canonical strict · parser canon canonical reject-on-malformed.
 */
export interface ClassifierOutput {
  /** Veredicto canonical · taxonomía injection · NO la de ruteo RUFLO. */
  classification_type:
    | 'safe'
    | 'role_spoof'
    | 'instruction_override'
    | 'exfiltration'
    | 'jailbreak'
    | 'obfuscated'
  /** Canonical 0.0-1.0 · default 0.85 si missing per RUFLO convention. */
  confidence: number
  /** Boolean canonical · TRUE → flujo cuarentena §5.3. */
  should_escalate_hitl: boolean
  /**
   * Lista controlada canónica · NO free-form (canon canonical atacante NO puede
   * inyectar texto que afecte downstream). NULL si `should_escalate_hitl=false`.
   */
  escalation_reason:
    | 'low_confidence'
    | 'novel_pattern'
    | 'multilingual_unknown_locale'
    | 'classifier_error'
    | 'high_risk_route_egress'
    | null
}

/** Canon canonical enum values for runtime validation. */
export const CLASSIFICATION_TYPES = [
  'safe',
  'role_spoof',
  'instruction_override',
  'exfiltration',
  'jailbreak',
  'obfuscated',
] as const

export const ESCALATION_REASONS = [
  'low_confidence',
  'novel_pattern',
  'multilingual_unknown_locale',
  'classifier_error',
  'high_risk_route_egress',
] as const

// =====================================================================
// Pipeline input/output canon canonical
// =====================================================================

/**
 * Canonical input per ingress event.
 *
 * Caller (Vercel handler · n8n recepción call-site) builds this from raw
 * ingress payload. The pipeline does NOT touch network · pure compute +
 * optional 1 Anthropic call (classifier Capa 3) + optional DB writes (only
 * for cuarentena · §5.3 enforce phase).
 */
export interface IngressFilterInput {
  /** Raw text payload canon canonical · the untrusted content to evaluate. */
  raw_text: string
  /** Source vector · ADR-012 §2.1 inventario. */
  source: ProvenanceTag['source']
  /** Specific endpoint or n8n workflow_id canonical. */
  ingress_route: string
  /** Optional client_id canonical · if determinable from upstream context. */
  client_id?: string | null
  /** Optional downstream workflow_id canonical · who would receive after filter. */
  downstream_workflow_id?: string | null
  /** Optional pre-validated structure data · canonical from Capa 4 caller-side. */
  structured_data?: unknown
  /** Optional locale hint canonical · 'es' | 'en' | 'auto'. Auto-detect not implemented v1. */
  locale_hint?: 'es' | 'en' | 'auto'
}

/**
 * Canonical output of the full pipeline.
 *
 * Consumer pattern canonical · check `allow` first · if false · respect
 * `block_severity` + `block_reason` per route fail-mode policy. Always
 * persist `tagged_payload` + `provenance_tag` downstream canon canonical
 * (canon canonical they travel with the data per §6.6 R3).
 */
export interface IngressFilterDecision {
  /** Canonical · pipeline did NOT block. shadow_mode siempre canon canonical TRUE en build. */
  allow: boolean
  /** Severity canonical agregada de all gates. */
  severity: Severity
  /** Array per-gate decisions canonical · audit trail. */
  gates: GateDecision[]
  /** Provenance tag canonical · CONSUMED downstream per ADR-009 + §6.6 R3. */
  provenance_tag: ProvenanceTag
  /**
   * Payload wrapped canon canonical en marcadores estructurales (Capa 1 output).
   * canonical-consume-this canon canonical · NEVER raw_text en system prompts downstream.
   */
  tagged_payload: string
  /** Total pipeline latency canonical · ms. */
  total_latency_ms: number
  /** Canon canonical short token · reason if blocked. */
  block_gate?: GateName
  block_reason?: string
  /** Canonical canon · severity that triggered block (canon · null if allow). */
  block_severity?: Severity
  /** Canonical · if shadow_mode TRUE · canon canonical "what WOULD have blocked". */
  shadow_blocks: GateName[]
  /** Canon canonical request_id canonical · matches ingress_id de provenance_tag. */
  request_id: string
}

// =====================================================================
// Route policy canon canonical · CONSUMED from ingress_routes table
// =====================================================================

/**
 * Subset canon canonical de la tabla `ingress_routes` que la lib consume.
 *
 * Canon canonical caller passes this in OR pipeline queries DB · default v1
 * caller pasa (canon canonical avoid hard DB dependency en lib).
 */
export interface IngressRoutePolicy {
  route_id: string
  ingress_platform: 'vercel' | 'n8n' | 'supabase_rest' | 'daemon_local'
  default_severity_min_quarantine: Severity
  default_severity_min_reject: Severity
  fail_mode: 'fail_open' | 'fail_closed'
  has_egress_capability: boolean
  has_egress_indirect_via_dispatcher_queue: boolean
  shadow_mode: boolean
}

/** Canon canonical default policy · safe defaults per ADR-012 §5.2 post-R4. */
export const DEFAULT_ROUTE_POLICY: IngressRoutePolicy = {
  route_id: 'unknown_default',
  ingress_platform: 'vercel',
  default_severity_min_quarantine: 'MEDIUM',
  default_severity_min_reject: 'HIGH',
  fail_mode: 'fail_open',
  has_egress_capability: true,
  has_egress_indirect_via_dispatcher_queue: true,
  shadow_mode: true,
}
