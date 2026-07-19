/**
 * src/lib/brain/persist-chunks.ts · Sprint 7.5 A5 helper
 *
 * Generates embeddings for a row from one of the 4 source tables
 * (brand_books · icp_documents · voc_library · competitive_landscape) and
 * UPSERTs the chunks to `client_brain_chunks`.
 *
 * Used by OnboardingOrchestrator Phase 1 post-Brand-Book-write hook
 * (`src/lib/onboarding-orchestrator.ts`) · graceful · NEVER throws ·
 * onboarding completes even if embedding generation fails (cliente
 * sigue funcionando con identity-only prompts hasta proximo backfill run).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding } from './embed'
import { runIngressFilter, type ProvenanceTag } from '../ingress-filter'
import { buildBrainProvenanceTag, type BrainTrustLevel } from '../client-brain'
import { brainRoutePolicy, quarantineChunk } from './portero'

export interface BrainChunk {
  section_label: string
  chunk_text: string
  metadata?: Record<string, unknown>
}

// FASE C · 2ª vía de escritura · este helper es la puerta de escritura del
// onboarding (brand_book) + discovery (competidores/ICP/VOC). Converge al mismo
// portero que /api/brain/ingest-source · filtro anti-injection shadow + provenance_tag.

const INGRESS_SOURCE_ENUM = new Set<ProvenanceTag['source']>([
  'tally_form', 'apify_scrape', 'whatsapp_inbound', 'review_monitor',
  'dataforseo_scrape', 'email_inbound', 'onboarding_upload', 'notion_comment',
  'webhook_generic', 'callback_external', 'legacy_pre_adr012', 'unknown',
])
function toIngressSource(source: string): ProvenanceTag['source'] {
  return INGRESS_SOURCE_ENUM.has(source as ProvenanceTag['source'])
    ? (source as ProvenanceTag['source'])
    : 'webhook_generic'
}

export type PersistResult =
  | { ok: true; chunks_upserted: number; tokens_used: number; cost_usd: number }
  | { ok: false; code: string; detail: string; partial_upserted: number }

const COST_PER_1K_TOKENS = 0.00002

type SourceTable =
  | 'client_brand_books'
  | 'client_icp_documents'
  | 'client_voc_library'
  | 'client_competitive_landscape'
  | 'client_historical_outputs'

/**
 * Extract chunks from a brand_books row. Mirrors the backfill script
 * extractor logic for consistency · single source of canonical chunking.
 */
export function chunksFromBrandBook(row: Record<string, unknown>): BrainChunk[] {
  const out: BrainChunk[] = []
  const textFields = [
    'brand_purpose', 'brand_vision', 'brand_mission', 'brand_personality',
    'voice_description', 'writing_style', 'tagline', 'elevator_pitch',
    'imagery_style', 'competitor_mentions_policy', 'compliance_notes',
  ]
  for (const f of textFields) {
    const v = row[f]
    if (typeof v === 'string' && v.trim().length > 2) {
      out.push({ section_label: f, chunk_text: v.trim() })
    }
  }
  const jsonFields = [
    'brand_values', 'tone_guidelines', 'key_messages', 'value_propositions',
    'forbidden_words', 'required_terminology',
  ]
  for (const f of jsonFields) {
    const v = row[f]
    if (!v) continue
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    if (text.length > 2) out.push({ section_label: f, chunk_text: text })
  }
  return out
}

/**
 * Generate embeddings for an array of chunks and UPSERT them to
 * client_brain_chunks. Idempotent via UNIQUE (client_id, source_table,
 * source_id, section_label) → ON CONFLICT DO UPDATE.
 */
export async function persistChunks(
  supabase: SupabaseClient,
  args: {
    clientId: string
    sourceTable: SourceTable
    sourceId: string
    chunks: BrainChunk[]
    /** FASE C · etiqueta de fuente (Brain provenance · taxonomía discovery ·
     *  ej. 'apify_scrape' | 'onboarding_discovery' | 'search'). Default seguro. */
    source?: string
    /** FASE C · confianza · default 'untrusted' (evidencia de terceros). */
    trustLevel?: BrainTrustLevel
    /** CANDADO#1 · prueba de scrape real · requerido para que un `source` de
     *  scrape (apify_scrape · dataforseo_scrape) NO se degrade a auto_discovery.
     *  Default false (falla-cerrado · honesto). */
    scrapeTrace?: boolean
  },
): Promise<PersistResult> {
  if (!args.clientId || !args.sourceId || args.chunks.length === 0) {
    return { ok: true, chunks_upserted: 0, tokens_used: 0, cost_usd: 0 }
  }

  // FASE C · provenance · evidencia · trust por fuente (default untrusted).
  const brainSource = args.source && args.source.trim().length > 0 ? args.source.trim() : 'onboarding_discovery'
  const nowIso = new Date().toISOString()
  const provenanceTag = buildBrainProvenanceTag({
    source: brainSource,
    type: 'evidence',
    trust_level: args.trustLevel ?? 'untrusted',
    received_at: nowIso,
    ingress_route: 'lib/brain/persist-chunks',
    // CANDADO#1 · sin prueba de scrape real un source de scrape se degrada.
    scrape_trace: args.scrapeTrace,
  })
  const ingressSource = toIngressSource(brainSource)
  const route = brainRoutePolicy()

  let tokens = 0
  let upserted = 0
  for (const c of args.chunks) {
    const text = c.chunk_text.slice(0, 6000) // cap to keep tokens bounded

    // FASE C · portero anti-injection (ADR-012) · §144-per-flip ·
    // shadow (default · audita) | enforce (BRAIN_INGRESS_ENFORCE='true' · chunk
    // bloqueado NO se escribe · va a ingress_quarantine). skip_classifier · sin LLM.
    try {
      const decision = await runIngressFilter(
        { raw_text: text, source: ingressSource, ingress_route: 'lib/brain/persist-chunks', client_id: args.clientId },
        { route, skip_classifier: true },
      )
      if (!decision.allow) {
        // enforce · cuarentena + skip (NO embebe ni escribe al cerebro).
        await quarantineChunk(supabase, {
          decision,
          source: brainSource,
          trustLevel: args.trustLevel ?? 'untrusted',
          ingressRoute: 'lib/brain/persist-chunks',
          sectionLabel: c.section_label,
          chunkText: text,
          clientId: args.clientId,
        })
        console.warn(
          `[persist-chunks][ingress-filter][enforce] ${args.sourceTable}/${c.section_label} RECHAZADO → quarantine · ` +
            `${decision.block_gate ?? 'block'}(${decision.block_severity ?? decision.severity}) · client=${args.clientId}`,
        )
        continue
      }
      if (decision.shadow_blocks.length > 0) {
        console.warn(
          `[persist-chunks][ingress-filter][shadow] ${args.sourceTable}/${c.section_label} bloquearía en enforce · ` +
            `${decision.shadow_blocks.join('+')}(${decision.severity}) · client=${args.clientId}`,
        )
      }
    } catch {
      // El filtro nunca debe romper la escritura · best-effort audit/enforce.
    }

    const e = await generateEmbedding(text)
    if (!e.ok) {
      // Skip this chunk · log via stderr-style return when caller logs
      continue
    }
    tokens += e.tokens
    const { error } = await supabase.from('client_brain_chunks').upsert(
      {
        client_id: args.clientId,
        source_table: args.sourceTable,
        source_id: args.sourceId,
        section_label: c.section_label,
        chunk_text: text,
        embedding: e.embedding as unknown as string, // pgvector accepts JSON array
        provenance_tag: provenanceTag,
        metadata: c.metadata ?? {},
        updated_at: nowIso,
      },
      { onConflict: 'client_id,source_table,source_id,section_label' },
    )
    if (!error) upserted++
  }

  return {
    ok: true,
    chunks_upserted: upserted,
    tokens_used: tokens,
    cost_usd: (tokens / 1000) * COST_PER_1K_TOKENS,
  }
}
