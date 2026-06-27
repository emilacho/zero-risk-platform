/**
 * Canon canonical · Discovery output contract (Lenovo SPEC 2026-06-05).
 *
 * Source · `zr-vault/00-meta/opus-4-8-traspaso/SPEC-lazo-agentico-discovery-scraping-brain-2026-06-05.md`
 * §interface · the Auto-Discovery agent emits structured JSON · the platform
 * persists it to (a) `client_brain_chunks` + per-source tables + (b)
 * `clients.config.apify` so APIFY_WIRE consumes dynamic targets · zero manual
 * input.
 *
 * Shape coordinated CC#3 ↔ CC#4 ·
 *   - CC#3 (this package · platform) consumes DiscoveryOutput for persistence
 *   - CC#4 (n8n) consumes competitors[] + own_handles as dynamic scrape targets
 *
 * §148 honest · NEVER throws on shape drift · `parseDiscoveryOutput` returns
 * a typed Decision (success | absent | malformed) so callers can decide
 * (today · log + skip · default-OFF).
 */

/** Canon canonical · social handles per platform · YouTube canonical incl. */
export interface DiscoverySocialHandles {
  readonly instagram?: string
  readonly facebook?: string
  readonly tiktok?: string
  readonly linkedin?: string
  readonly youtube?: string
}

/** Canon canonical · one competitor row · 3-8 per spec. */
export interface DiscoveredCompetitor {
  /** Required · canonical name (e.g. "La Pinta Quito"). */
  readonly name: string
  /** Optional · website URL · used by client_competitive_landscape.competitor_website. */
  readonly website?: string
  /** Optional · social handles · feeds APIFY_WIRE dynamic targets. */
  readonly handles?: DiscoverySocialHandles
  /** Optional · short justification (1-2 sentences) · stored as chunk_text. */
  readonly why?: string
  /** Optional · competitor_type per `client_competitive_landscape.competitor_type` ·
   *  defaults to 'direct'. */
  readonly competitor_type?: 'direct' | 'indirect' | 'aspirational' | 'alternative'
  /** Optional · positioning summary · feeds value_proposition or content_strategy_summary. */
  readonly positioning?: string
  /**
   * Sprint multi-source discovery · provenance de ESTA fila de competidor ·
   * alineado a la taxonomía canónica del Brain `provenance_tag` (CHECK en prod
   * `client_brain_chunks_provenance_tag_chk` · ver src/lib/client-brain.ts
   * `buildBrainProvenanceTag`). Optional para parse no-breaking · el parser
   * aplica floor seguro cuando el agente los omite (onboarding_discovery /
   * untrusted / evidence).
   */
  readonly source?: 'apify_scrape' | 'onboarding_discovery' | 'search'
  /** = provenance_tag.trust_level · discovery de terceros NUNCA es tenant_trusted
   *  (ese valor es solo para dato directo del cliente). */
  readonly trust_level?: 'untrusted' | 'tenant_trusted'
  /** = provenance_tag.type · dimensión dos-puertas · discovery SIEMPRE 'evidence'
   *  (solo pasa a 'canon' tras PASS de Camino III · otro paso). */
  readonly type?: 'evidence'
}

/** Canon canonical · ICP segment shape · maps to `client_icp_documents` columns. */
export interface DiscoveredIcpSegment {
  /** Required · maps to `audience_segment` column. */
  readonly audience_segment: string
  /** Optional · 1 (primary) · 2 (secondary) · maps to `segment_priority`. */
  readonly segment_priority?: number
  readonly job_titles?: readonly string[]
  readonly company_size?: string
  readonly industries?: readonly string[]
  readonly geography?: string
  readonly goals?: readonly string[]
  readonly pain_points?: readonly string[]
  readonly jobs_to_be_done?: readonly string[]
  readonly objections?: readonly string[]
  readonly buying_process?: string
  readonly decision_criteria?: readonly string[]
  readonly budget_range?: string
  readonly preferred_channels?: readonly string[]
  readonly content_preferences?: string
}

/** Canon canonical · full Discovery output emitted by the agent. */
export interface DiscoveryOutput {
  /** Required · matches `clients.id` UUID · resolves orphaned writes. */
  readonly client_id: string
  /** Required (may be empty object) · what the agency's CLIENT owns. */
  readonly own_handles: DiscoverySocialHandles
  /** Required · 3-8 competitors per SPEC. Empty array allowed but logged. */
  readonly competitors: readonly DiscoveredCompetitor[]
  /** Optional · 1-3 ICP segments. */
  readonly icp?: DiscoveredIcpSegment | readonly DiscoveredIcpSegment[]
  /** Optional · 1-2 paragraph competitive landscape · chunked verbatim. */
  readonly competitive_landscape_summary?: string
  /**
   * Sprint multi-source discovery · resumen de ejecución por fuente (qué actores
   * Apify corrieron y con qué resultado) · para transparencia + el veredicto del
   * competitive-intelligence-agent. Optional · aditivo no-breaking.
   */
  readonly sources?: ReadonlyArray<{
    readonly actor: string // ej. instagram_scraper, google_serp
    readonly apify_function: string
    readonly status: 'ok' | 'failed' | 'skipped'
    readonly count: number
  }>
}

/** Canon canonical · parse result tagged union · cero implicit accept. */
export type DiscoveryParseResult =
  | { readonly kind: 'ok'; readonly value: DiscoveryOutput }
  | { readonly kind: 'absent'; readonly reason: string }
  | { readonly kind: 'malformed'; readonly reason: string; readonly raw?: string }

/** Canon canonical · persistence outcomes per side-effect · used for logging
 *  and structured response · NEVER throws to the caller. */
export interface DiscoveryPersistOutcome {
  readonly client_id: string
  readonly competitor_landscape_rows: number
  readonly icp_document_rows: number
  readonly brain_chunks_upserted: number
  readonly config_handles_written: number
  readonly config_competitors_written: number
  readonly errors: readonly string[]
  /** Total ms · embed + DB · for observability surface. */
  readonly duration_ms: number
}
