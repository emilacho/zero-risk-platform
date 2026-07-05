/**
 * services/agent-runner/src/lib/brain-enrichment.ts · Sprint 7.5 A6
 *
 * Push-enrichment for Client Brain · called BEFORE _buildSystemPrompt in
 * `runAgentViaSDK()` so every agent invocation that ships a `clientId`
 * gets top_k canonical chunks injected as a dedicated <CLIENT_CONTEXT>
 * section · agent sees brand voice + ICP pain points + competitive
 * landscape every time · no on-demand-tool-call required.
 *
 * Graceful · NEVER throws. Returns empty string when ·
 *   - clientId missing
 *   - OPENAI_API_KEY missing (degrades to identity-only prompt)
 *   - RPC `query_client_brain` returns 0 chunks
 *   - any network/DB error along the way
 *
 * Cost · ~$0.00002 per invocation (one embedding for the task query).
 * Per-client coverage · 0 chunks → 60+ chunks depending on brain depth.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const OPENAI_API = 'https://api.openai.com/v1'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const DEFAULT_TOP_K = 5

export interface EnrichmentResult {
  enrichment: string // ready-to-inject prompt section (may be empty string)
  /**
   * Canonical Sprint 8B field · count of chunks injected into the system
   * prompt. Surfaced in `agent_invocations.metadata.brain_chunks_count`
   * and `agents_log.output.brain_chunks_count` for runtime auditability.
   */
  brain_chunks_count: number
  /** Backwards-compat alias for brain_chunks_count · existing callers may read this. */
  chunks_used: number
  brain_hit: boolean
  /** Total embed + RPC round-trip latency in ms · Sprint 8B observability. */
  brain_query_ms: number
  tokens_used: number
  cost_usd: number
  /**
   * ADR-020 Anexo M1 · claim→chunk linkage substrate. The chunk_ids of the
   * CEREBRO chunks retrieved for this enrichment (the grounding material).
   * Surfaced from the RPC (which already returns `chunk_id`) so the Jefatura
   * trace can populate `metadata.jefatura.evidence_refs[]`.
   */
  evidence_refs: string[]
  /**
   * ADR-020 Anexo M1 · honesty marker. `prose_only` = the chunks were
   * retrieved and injected as PROSE context, but NO claim→chunk matching
   * exists yet (a specific claim is not linked to a specific chunk). We
   * declare this instead of pretending groundedness (a fidelity score over
   * prose passing as groundedness = the same false-green as dry_run≠real).
   * Flips to `chunk_linked` only when real claim→chunk matching is built.
   */
  grounding: 'chunk_linked' | 'prose_only'
  error?: string // present only when something soft-failed
}

interface BrainChunkRow {
  chunk_id: string
  source_table: string
  source_id: string
  section_label: string
  chunk_text: string
  similarity: number
}

async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const input = (text ?? '').trim()
  if (!input) return null
  try {
    const r = await fetch(`${OPENAI_API}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    })
    if (!r.ok) return null
    const j = (await r.json()) as {
      data?: Array<{ embedding: number[] }>
      usage?: { total_tokens: number }
    }
    return j.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

function formatChunksAsContext(chunks: BrainChunkRow[]): string {
  if (chunks.length === 0) return ''
  const lines: string[] = []
  lines.push('# Cliente · contexto canónico (Client Brain RAG)')
  lines.push('')
  lines.push(
    'Usá las siguientes piezas del brand book + ICP + VOC + competitive landscape como verdad para este cliente. Refleján su voice, terminología, restricciones y posicionamiento. Si un chunk contradice tu identity de agente, los chunks ganan (son específicos del cliente).',
  )
  lines.push('')
  for (const c of chunks) {
    lines.push(`## ${c.source_table} · ${c.section_label} (similarity ${c.similarity.toFixed(3)})`)
    lines.push(c.chunk_text)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Fetch top_k chunks from client_brain_chunks for the given (client_id, task)
 * and return a formatted system-prompt section. Returns empty string on any
 * failure · caller proceeds with identity-only prompt.
 */
export async function enrichSystemPromptWithClientBrain(args: {
  supabase: SupabaseClient
  clientId: string | null | undefined
  taskDescription: string
  agentSlug?: string
  topK?: number
}): Promise<EnrichmentResult> {
  const queryStartedAt = Date.now()
  const empty: EnrichmentResult = {
    enrichment: '',
    brain_chunks_count: 0,
    chunks_used: 0,
    brain_hit: false,
    brain_query_ms: 0,
    tokens_used: 0,
    cost_usd: 0,
    evidence_refs: [],
    grounding: 'prose_only',
  }

  if (!args.clientId) return empty

  // Construct a richer query · include agent slug as soft context so the
  // brain returns chunks relevant to the agent's task (e.g. "social-media-strategist
  // generating instagram post" vs "media-buyer optimizing campaign").
  const queryText = args.agentSlug
    ? `[${args.agentSlug}] ${args.taskDescription}`
    : args.taskDescription

  const queryEmbedding = await embedQuery(queryText)
  if (!queryEmbedding) {
    return { ...empty, brain_query_ms: Date.now() - queryStartedAt, error: 'embed_query_failed' }
  }

  try {
    const { data, error } = await args.supabase.rpc('query_client_brain', {
      p_client_id: args.clientId,
      p_query_embedding: queryEmbedding,
      p_top_k: args.topK ?? DEFAULT_TOP_K,
    })
    if (error) return { ...empty, brain_query_ms: Date.now() - queryStartedAt, error: `rpc_error: ${error.message}` }
    const rows = (data ?? []) as BrainChunkRow[]
    const brainQueryMs = Date.now() - queryStartedAt
    if (rows.length === 0) {
      return { ...empty, brain_hit: false, brain_query_ms: brainQueryMs, error: 'brain_empty_for_client' }
    }
    return {
      enrichment: formatChunksAsContext(rows),
      brain_chunks_count: rows.length,
      chunks_used: rows.length,
      brain_hit: true,
      brain_query_ms: brainQueryMs,
      tokens_used: queryText.length / 4, // rough estimate · 4 chars per token
      cost_usd: 0.00002 * (queryText.length / 4000), // ~$0.00002 per 1K tokens
      // ADR-020 M1 · surface the retrieved chunk_ids (substrate for
      // evidence_refs). grounding stays `prose_only` until real claim→chunk
      // matching exists · the chunks are injected as prose, not linked to
      // specific claims (honest · NO over-sell).
      evidence_refs: rows.map((r) => r.chunk_id).filter((id): id is string => typeof id === 'string'),
      grounding: 'prose_only',
    }
  } catch (e) {
    return { ...empty, brain_query_ms: Date.now() - queryStartedAt, error: e instanceof Error ? e.message : 'unknown' }
  }
}
