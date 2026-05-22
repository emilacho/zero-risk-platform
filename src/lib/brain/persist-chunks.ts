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

export interface BrainChunk {
  section_label: string
  chunk_text: string
  metadata?: Record<string, unknown>
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
  },
): Promise<PersistResult> {
  if (!args.clientId || !args.sourceId || args.chunks.length === 0) {
    return { ok: true, chunks_upserted: 0, tokens_used: 0, cost_usd: 0 }
  }

  let tokens = 0
  let upserted = 0
  for (const c of args.chunks) {
    const text = c.chunk_text.slice(0, 6000) // cap to keep tokens bounded
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
        metadata: c.metadata ?? {},
        updated_at: new Date().toISOString(),
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
