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
import { baseDeEtiqueta, basesConRechazo, seccionesEnTrozos, trozosViejos } from './trozos'
import { CAMPOS } from '../manual/campos-del-manual'

/** ENCARGO 11: el tope de UN trozo (el texto entero va en varios; nada se corta) */
export const MAX_POR_TROZO = 6000

/** saca los trozos de una partición vieja de las secciones recién escritas (misma fuente). Best-effort: si falla, la búsqueda igual une solo los de la partición vigente */
export async function sacarTrozosViejos(supabase: SupabaseClient, o: { clientId: string; sourceTable: string; sourceId: string; escritas: string[] }): Promise<number> {
  if (o.escritas.length === 0) return 0
  try {
    const { data } = await supabase.from('client_brain_chunks').select('section_label').eq('client_id', o.clientId).eq('source_table', o.sourceTable).eq('source_id', o.sourceId)
    const viejos = trozosViejos(((data ?? []) as Array<{ section_label: string }>).map((r) => r.section_label), o.escritas)
    if (viejos.length === 0) return 0
    const { error } = await supabase.from('client_brain_chunks').delete().eq('client_id', o.clientId).eq('source_table', o.sourceTable).eq('source_id', o.sourceId).in('section_label', viejos)
    return error ? 0 : viejos.length
  } catch {
    return 0
  }
}

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
  | { ok: true; chunks_upserted: number; tokens_used: number; cost_usd: number; /** ENCARGO 11 (propuesta de CC5, inventario de topes): las secciones que NO se escribieron y por qué. Antes un trozo sin huella se descartaba sin aviso */ secciones_fuera?: Array<{ section_label: string; razon: 'filtro_de_entrada' | 'sin_huella' }> }
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
    // `positioning` desde H1.2 · tiene columna propia · antes viajaba rotulado
    // como elevator_pitch (§ raw/findings/2026-08-20-CC1-H0.1-mapeo-del-escritor.md)
    'voice_description', 'writing_style', 'tagline', 'elevator_pitch', 'positioning',
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
  return conProcedenciaPorCampo(out, row)
}

/**
 * 30-oct (condición 2 de Cerebro): cada trozo del manual lleva la procedencia de SU campo (`_field_meta` del borrador: fuente, confianza, estado) para que los agentes traten lo inferido
 * como inspiración y solo lo declarado (con cita) como obligatorio. Un manual sin `_field_meta` no cambia nada.
 */
export function procedenciaDelCampo(row: Record<string, unknown>, seccion: string): Record<string, unknown> | undefined {
  let meta: Record<string, Record<string, unknown>> = {}
  try {
    const ct = typeof row.content_text === 'string' ? JSON.parse(row.content_text) : null
    const m = ct?.brand_book_draft?._field_meta
    if (m && typeof m === 'object') meta = m as typeof meta
  } catch { /* sin procedencia: los trozos salen como siempre */ }
  const campo = CAMPOS.find((x) => x.columna === seccion)
  const m = campo ? meta[campo.clave] : undefined
  if (!campo || !m) return undefined
  const { fuente, confianza, estado } = m
  return { campo: campo.clave, procedencia: { fuente: fuente ?? null, confianza: confianza ?? null, estado: estado ?? null } }
}

function conProcedenciaPorCampo(chunks: BrainChunk[], row: Record<string, unknown>): BrainChunk[] {
  return chunks.map((c) => {
    const extra = procedenciaDelCampo(row, c.section_label)
    return extra ? { ...c, metadata: { ...(c.metadata ?? {}), ...extra } } : c
  })
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
  // ENCARGO 11 · paso 2b: nada se recorta. Un texto de más de 6000 caracteres va ENTERO en trozos parejos y numerados de la misma fuente
  // (antes se cortaba a 6000 y el resto se perdía). La búsqueda los une al leer (`unirTrozos`).
  const trozos: BrainChunk[] = args.chunks.flatMap((c) =>
    seccionesEnTrozos(c.section_label, c.chunk_text, MAX_POR_TROZO, c.metadata).map((x) => ({ section_label: x.section_label, chunk_text: x.text, ...(x.metadata ? { metadata: x.metadata } : {}) })),
  )

  // FASE C · portero anti-injection (ADR-012) · §144-per-flip ·
  // shadow (default · audita) | enforce (BRAIN_INGRESS_ENFORCE='true' · chunk
  // bloqueado NO se escribe · va a ingress_quarantine). skip_classifier · sin LLM.
  const rechazado: boolean[] = []
  for (const c of trozos) {
    const text = c.chunk_text
    let fuera = false
    try {
      const decision = await runIngressFilter(
        { raw_text: text, source: ingressSource, ingress_route: 'lib/brain/persist-chunks', client_id: args.clientId },
        { route, skip_classifier: true },
      )
      if (!decision.allow) {
        // enforce · cuarentena + skip (NO embebe ni escribe al cerebro).
        fuera = true
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
      } else if (decision.shadow_blocks.length > 0) {
        console.warn(
          `[persist-chunks][ingress-filter][shadow] ${args.sourceTable}/${c.section_label} bloquearía en enforce · ` +
            `${decision.shadow_blocks.join('+')}(${decision.severity}) · client=${args.clientId}`,
        )
      }
    } catch {
      // El filtro nunca debe romper la escritura · best-effort audit/enforce.
    }
    rechazado.push(fuera)
  }

  // TODO O NADA por sección original: si un trozo se rechaza o no se pudo embeber, no se escribe ningún trozo de esa sección
  const fueraDeLaBase = basesConRechazo(trozos.map((c) => c.section_label), (i) => rechazado[i])
  const embebidos: Array<{ c: BrainChunk; embedding: number[] }> = []
  const sinHuella = new Set<string>()
  for (const c of trozos) {
    const base = baseDeEtiqueta(c.section_label)
    if (fueraDeLaBase.has(base)) continue
    const e = await generateEmbedding(c.chunk_text)
    if (!e.ok) { fueraDeLaBase.add(base); sinHuella.add(base); continue }
    tokens += e.tokens
    embebidos.push({ c, embedding: e.embedding })
  }
  const escritas: string[] = []
  for (const { c, embedding } of embebidos) {
    if (fueraDeLaBase.has(baseDeEtiqueta(c.section_label))) continue
    const text = c.chunk_text
    const { error } = await supabase.from('client_brain_chunks').upsert(
      {
        client_id: args.clientId,
        source_table: args.sourceTable,
        source_id: args.sourceId,
        section_label: c.section_label,
        chunk_text: text,
        embedding: embedding as unknown as string, // pgvector accepts JSON array
        provenance_tag: provenanceTag,
        metadata: c.metadata ?? {},
        updated_at: nowIso,
      },
      { onConflict: 'client_id,source_table,source_id,section_label' },
    )
    if (!error) { upserted++; escritas.push(c.section_label) }
  }
  // los trozos de una partición vieja de las mismas secciones salen (antes «trozo k de 3», ahora «de 2», o antes entera): el índice no guarda dos versiones
  await sacarTrozosViejos(supabase, { clientId: args.clientId, sourceTable: args.sourceTable, sourceId: args.sourceId, escritas })

  const secciones_fuera = [...fueraDeLaBase].map((section_label) => ({ section_label, razon: (sinHuella.has(section_label) ? 'sin_huella' : 'filtro_de_entrada') as 'sin_huella' | 'filtro_de_entrada' }))
  if (secciones_fuera.length) console.warn(`[persist-chunks] ${args.sourceTable}/${args.sourceId} · ${secciones_fuera.length} sección(es) fuera del índice (todo o nada): ${secciones_fuera.map((x) => `${x.section_label}(${x.razon})`).join(' · ')} · client=${args.clientId}`)
  return {
    ok: true,
    chunks_upserted: upserted,
    ...(secciones_fuera.length ? { secciones_fuera } : {}),
    tokens_used: tokens,
    cost_usd: (tokens / 1000) * COST_PER_1K_TOKENS,
  }
}
