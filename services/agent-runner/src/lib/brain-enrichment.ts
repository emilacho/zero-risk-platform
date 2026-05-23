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
  chunks_used: number
  brain_hit: boolean
  tokens_used: number
  cost_usd: number
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
  const empty: EnrichmentResult = {
    enrichment: '',
    chunks_used: 0,
    brain_hit: false,
    tokens_used: 0,
    cost_usd: 0,
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
    return { ...empty, error: 'embed_query_failed' }
  }

  try {
    const { data, error } = await args.supabase.rpc('query_client_brain', {
      p_client_id: args.clientId,
      p_query_embedding: queryEmbedding,
      p_top_k: args.topK ?? DEFAULT_TOP_K,
    })
    if (error) return { ...empty, error: `rpc_error: ${error.message}` }
    const rows = (data ?? []) as BrainChunkRow[]
    if (rows.length === 0) {
      return { ...empty, brain_hit: false, error: 'brain_empty_for_client' }
    }
    return {
      enrichment: formatChunksAsContext(rows),
      chunks_used: rows.length,
      brain_hit: true,
      tokens_used: queryText.length / 4, // rough estimate · 4 chars per token
      cost_usd: 0.00002 * (queryText.length / 4000), // ~$0.00002 per 1K tokens
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'unknown' }
  }
}
