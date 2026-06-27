/**
 * src/lib/brain/voc-ingest.ts · Sprint-brain §144 · Task 2
 *
 * Ingesta de Voice-of-Customer (feedback + testimonios) al cerebro del cliente.
 *
 * Doble escritura canónica ·
 *   1. `client_voc_library` (tabla estructurada · fuente · upsert idempotente
 *      por dedup_hash = md5(client_id|source|quote_text)).
 *   2. `client_brain_chunks` (superficie canónica de RAG · embed 1536d +
 *      upsert ON CONFLICT (client_id, source_table, source_id, section_label)).
 *
 * Provenance (FASE B · ADR-012 + dos puertas) · VOC es feedback de primera mano
 * del cliente → `type='evidence'` (NO es canon aprobado por jefes) ·
 * `trust_level='tenant_trusted'` por defecto (dato propio del tenant · más
 * confiable que un scrape externo · pero NO se afirma como hecho hasta curado).
 *
 * Graceful · nunca lanza por entrada individual · acumula errores por entrada
 * y devuelve un resumen. El embed se hace en batch (1 sola llamada OpenAI).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbeddings, EMBEDDING_DIMENSIONS } from './embed'
import { buildBrainProvenanceTag, type BrainTrustLevel } from '../client-brain'

export type VocSentiment = 'positive' | 'negative' | 'neutral'

export interface VocEntryInput {
  quote_text: string
  source: string // 'google_review' | 'nps_survey' | 'interview' | 'social_media' | ...
  source_url?: string
  customer_name?: string
  customer_segment?: string
  sentiment?: VocSentiment
  category?: string
  themes?: string[]
  quote_date?: string // ISO date
  /** Override trust level · default 'tenant_trusted' (first-party feedback). */
  trust_level?: BrainTrustLevel
}

export interface VocIngestEntryResult {
  quote_preview: string
  ok: boolean
  voc_id?: string
  chunk_upserted?: boolean
  error?: string
}

export interface VocIngestResult {
  ok: boolean
  entries_total: number
  entries_ingested: number
  chunks_upserted: number
  cost_usd: number
  results: VocIngestEntryResult[]
  error?: string
}

const VALID_SENTIMENT: ReadonlySet<string> = new Set(['positive', 'negative', 'neutral'])

/** Build the searchable content_text for a VOC entry (quote + light context). */
export function buildVocContentText(e: VocEntryInput): string {
  const parts = [`"${e.quote_text.trim()}"`]
  if (e.customer_name) parts.push(`— ${e.customer_name}`)
  if (e.customer_segment) parts.push(`(${e.customer_segment})`)
  const meta: string[] = []
  if (e.source) meta.push(`source: ${e.source}`)
  if (e.sentiment) meta.push(`sentiment: ${e.sentiment}`)
  if (e.category) meta.push(`category: ${e.category}`)
  if (Array.isArray(e.themes) && e.themes.length) meta.push(`themes: ${e.themes.join(', ')}`)
  if (meta.length) parts.push(`[${meta.join(' · ')}]`)
  return parts.join(' ')
}

function sanitize(entries: VocEntryInput[]): VocEntryInput[] {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.quote_text === 'string' && typeof e.source === 'string')
    .map((e) => ({
      ...e,
      quote_text: e.quote_text.trim(),
      source: e.source.trim(),
      sentiment: e.sentiment && VALID_SENTIMENT.has(e.sentiment) ? e.sentiment : 'neutral',
    }))
    .filter((e) => e.quote_text.length > 3 && e.source.length > 0)
}

/**
 * Ingest VOC entries for a client. Writes the structured rows + RAG chunks.
 * Never throws · returns a per-entry summary.
 */
export async function ingestVocEntries(
  supabase: SupabaseClient,
  args: { clientId: string; entries: VocEntryInput[] },
): Promise<VocIngestResult> {
  const empty: VocIngestResult = {
    ok: true,
    entries_total: 0,
    entries_ingested: 0,
    chunks_upserted: 0,
    cost_usd: 0,
    results: [],
  }

  if (!args.clientId) return { ...empty, ok: false, error: 'missing_client_id' }
  const entries = sanitize(args.entries)
  if (entries.length === 0) return { ...empty, error: 'no_valid_entries' }

  const nowIso = new Date().toISOString()

  // 1 · Upsert structured VOC rows (idempotent by dedup_hash). Returns ids in order.
  const vocRows = entries.map((e) => ({
    client_id: args.clientId,
    quote_text: e.quote_text,
    source: e.source,
    source_url: e.source_url ?? null,
    customer_name: e.customer_name ?? null,
    customer_segment: e.customer_segment ?? null,
    sentiment: e.sentiment,
    category: e.category ?? null,
    themes: e.themes ?? [],
    quote_date: e.quote_date ?? null,
    content_text: buildVocContentText(e),
    provenance_tag: buildBrainProvenanceTag({
      source: `voc:${e.source}`,
      type: 'evidence',
      trust_level: e.trust_level ?? 'tenant_trusted',
      received_at: nowIso,
    }),
    updated_at: nowIso,
  }))

  const { data: upserted, error: vocErr } = await supabase
    .from('client_voc_library')
    .upsert(vocRows, { onConflict: 'dedup_hash', ignoreDuplicates: false })
    .select('id, dedup_hash, quote_text')

  if (vocErr) {
    return { ...empty, ok: false, entries_total: entries.length, error: `voc_upsert_failed: ${vocErr.message.slice(0, 400)}` }
  }

  const rows = upserted ?? []
  // Map dedup_hash → id so we can pair chunks back to the right voc row even if
  // the DB returns rows in a different order than we sent them.
  const idByQuote = new Map<string, string>()
  for (const r of rows as Array<{ id: string; quote_text: string }>) {
    idByQuote.set(r.quote_text, r.id)
  }

  // 2 · Embed all content_texts (single batch OpenAI call).
  const contentTexts = entries.map((e) => buildVocContentText(e))
  const embed = await generateEmbeddings(contentTexts)

  const results: VocIngestEntryResult[] = entries.map((e) => ({
    quote_preview: e.quote_text.slice(0, 60),
    ok: false,
  }))

  if (!embed.ok) {
    // Structured rows landed but chunks couldn't embed · surface partial success.
    entries.forEach((e, i) => {
      results[i].voc_id = idByQuote.get(e.quote_text)
      results[i].ok = Boolean(results[i].voc_id)
      results[i].error = `embed_failed: ${embed.code}`
    })
    return {
      ok: false,
      entries_total: entries.length,
      entries_ingested: rows.length,
      chunks_upserted: 0,
      cost_usd: 0,
      results,
      error: `embed_failed: ${embed.detail}`,
    }
  }

  // 3 · Build + upsert chunks (one chunk per VOC entry · section_label='quote').
  const chunkRows = entries.map((e, i) => {
    const vocId = idByQuote.get(e.quote_text)
    return {
      client_id: args.clientId,
      source_table: 'client_voc_library',
      source_id: vocId,
      section_label: 'quote',
      chunk_text: buildVocContentText(e).slice(0, 8000),
      embedding: embed.embeddings[i],
      provenance_tag: buildBrainProvenanceTag({
        source: `voc:${e.source}`,
        type: 'evidence',
        trust_level: e.trust_level ?? 'tenant_trusted',
        received_at: nowIso,
      }),
      metadata: {
        embedding_model: embed.model,
        embedding_dimensions: EMBEDDING_DIMENSIONS,
        ingest_source: 'api/voc/ingest',
        sentiment: e.sentiment,
        ingested_at: nowIso,
      },
      updated_at: nowIso,
    }
  })

  // Only upsert chunks whose voc row resolved to an id.
  const validChunks = chunkRows.filter((c) => c.source_id)
  let chunksUpserted = 0
  if (validChunks.length > 0) {
    const { data: chunkData, error: chunkErr } = await supabase
      .from('client_brain_chunks')
      .upsert(validChunks, {
        onConflict: 'client_id,source_table,source_id,section_label',
        ignoreDuplicates: false,
      })
      .select('id')
    if (chunkErr) {
      entries.forEach((e, i) => {
        results[i].voc_id = idByQuote.get(e.quote_text)
        results[i].ok = Boolean(results[i].voc_id)
        results[i].error = `chunk_upsert_failed: ${chunkErr.message.slice(0, 200)}`
      })
      return {
        ok: false,
        entries_total: entries.length,
        entries_ingested: rows.length,
        chunks_upserted: 0,
        cost_usd: 0,
        results,
        error: `chunk_upsert_failed: ${chunkErr.message.slice(0, 400)}`,
      }
    }
    chunksUpserted = (chunkData ?? []).length
  }

  entries.forEach((e, i) => {
    const vocId = idByQuote.get(e.quote_text)
    results[i].voc_id = vocId
    results[i].chunk_upserted = Boolean(vocId)
    results[i].ok = Boolean(vocId)
  })

  // Cost · text-embedding-3-small ~$0.00002/1K tokens.
  const cost = (embed.tokens / 1000) * 0.00002

  return {
    ok: true,
    entries_total: entries.length,
    entries_ingested: rows.length,
    chunks_upserted: chunksUpserted,
    cost_usd: cost,
    results,
  }
}
