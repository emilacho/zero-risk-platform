// =============================================================
// Zero Risk V3 — Client Brain RAG System
// Interfaces + Supabase wrappers for query_client_brain()
// and get_client_guardrails()
// =============================================================

import { getSupabaseAdmin } from './supabase'

// ── Types ────────────────────────────────────────────────────

export type BrainSection =
  | 'brand_books'
  | 'icp_documents'
  | 'voc_library'
  | 'competitive_landscape'
  | 'historical_outputs'

export interface BrainSearchResult {
  source_table: BrainSection
  source_id: string
  label: string
  content_text: string
  similarity: number
}

export interface ClientGuardrails {
  forbidden_words: string[]
  required_terminology: string[]
  voice_description: string | null
  competitor_mentions_policy: string | null
  compliance_notes: string | null
}

export interface QueryClientBrainParams {
  client_id: string
  query: string
  sections?: BrainSection[]
  match_count?: number
}

// ── Embedding helper ─────────────────────────────────────────

/**
 * Generate an embedding vector via Anthropic's Voyager or OpenAI ada-002.
 * Currently wraps the Supabase Edge Function `generate-embedding`
 * which proxies to the configured embedding provider.
 *
 * In production, this should call:
 *   POST /functions/v1/generate-embedding { text: string }
 * Returns: number[] (1536 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: { text },
  })
  if (error) throw new Error(`Embedding generation failed: ${error.message}`)
  return data.embedding as number[]
}

// ── Core: query_client_brain() ───────────────────────────────

/**
 * Semantic search across all Client Brain sections.
 * Calls the Supabase RPC function `query_client_brain`.
 *
 * Usage by Managed Agents:
 *   const results = await queryClientBrain({
 *     client_id: 'uuid',
 *     query: 'What tone should we use for social media?',
 *     sections: ['brand_books', 'voc_library'],
 *     match_count: 5
 *   })
 */
export async function queryClientBrain(
  params: QueryClientBrainParams
): Promise<BrainSearchResult[]> {
  const {
    client_id,
    query,
    sections = ['brand_books', 'icp_documents', 'voc_library', 'competitive_landscape', 'historical_outputs'],
    match_count = 10,
  } = params

  // Step 1: Generate embedding from the query text
  const queryEmbedding = await generateEmbedding(query)

  // Step 2: Call the Supabase RPC function
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('query_client_brain', {
    p_client_id: client_id,
    p_query_embedding: queryEmbedding,
    p_sections: sections,
    p_match_count: match_count,
  })

  if (error) throw new Error(`query_client_brain failed: ${error.message}`)
  return (data ?? []) as BrainSearchResult[]
}

// ── Core: get_client_guardrails() ────────────────────────────

/**
 * Fetch pre-generation guardrails for a client.
 * Returns forbidden words, required terminology, voice description,
 * competitor policy, and compliance notes.
 *
 * Called BEFORE every content generation to inject constraints
 * into the agent's system prompt.
 */
export async function getClientGuardrails(
  clientId: string
): Promise<ClientGuardrails | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('get_client_guardrails', {
    p_client_id: clientId,
  })

  if (error) throw new Error(`get_client_guardrails failed: ${error.message}`)
  if (!data || data.length === 0) return null

  const row = data[0]
  return {
    forbidden_words: (row.forbidden_words ?? []) as string[],
    required_terminology: (row.required_terminology ?? []) as string[],
    voice_description: row.voice_description ?? null,
    competitor_mentions_policy: row.competitor_mentions_policy ?? null,
    compliance_notes: row.compliance_notes ?? null,
  }
}

// ── Guardrails → System Prompt injection ─────────────────────

/**
 * Format guardrails as a constraint block to inject into
 * an agent's system prompt before content generation.
 *
 * Returns a string like:
 *   <client_guardrails>
 *   VOICE: Professional, authoritative, yet approachable...
 *   FORBIDDEN WORDS: cheap, discount, budget...
 *   REQUIRED TERMINOLOGY: premium protection, risk mitigation...
 *   COMPETITOR POLICY: Never mention competitors by name...
 *   COMPLIANCE: All claims must be verifiable...
 *   </client_guardrails>
 */
export function formatGuardrailsForPrompt(guardrails: ClientGuardrails): string {
  const lines: string[] = ['<client_guardrails>']

  if (guardrails.voice_description) {
    lines.push(`VOICE: ${guardrails.voice_description}`)
  }

  if (guardrails.forbidden_words.length > 0) {
    lines.push(`FORBIDDEN WORDS (never use these): ${guardrails.forbidden_words.join(', ')}`)
  }

  if (guardrails.required_terminology.length > 0) {
    lines.push(`REQUIRED TERMINOLOGY (use these when relevant): ${guardrails.required_terminology.join(', ')}`)
  }

  if (guardrails.competitor_mentions_policy) {
    lines.push(`COMPETITOR POLICY: ${guardrails.competitor_mentions_policy}`)
  }

  if (guardrails.compliance_notes) {
    lines.push(`COMPLIANCE: ${guardrails.compliance_notes}`)
  }

  lines.push('</client_guardrails>')
  return lines.join('\n')
}

// ── Brain context → System Prompt injection ──────────────────

/**
 * Format Client Brain search results as context to inject
 * into an agent's system prompt.
 *
 * Returns a string like:
 *   <client_brain_context>
 *   [Brand Book v2 | similarity: 0.92]
 *   The brand voice is professional yet approachable...
 *
 *   [ICP: SMB Decision Makers | similarity: 0.87]
 *   Primary audience: C-suite executives at companies with 50-200 employees...
 *   </client_brain_context>
 */
export function formatBrainContextForPrompt(results: BrainSearchResult[]): string {
  if (results.length === 0) return ''

  const lines: string[] = ['<client_brain_context>']

  for (const r of results) {
    lines.push(`[${r.label} | similarity: ${r.similarity.toFixed(2)}]`)
    lines.push(r.content_text)
    lines.push('')
  }

  lines.push('</client_brain_context>')
  return lines.join('\n')
}

// ── Full pre-generation context builder ──────────────────────

/**
 * Build the complete pre-generation context for an agent.
 * This is the main entry point called by the orchestrator
 * before each content generation task.
 *
 * Steps:
 * 1. Fetch guardrails → format as constraints
 * 2. Run semantic search with agent's query → format as context
 * 3. Return combined string for system prompt injection
 *
 * Usage:
 *   const context = await buildAgentContext({
 *     client_id: 'uuid',
 *     query: 'Write a social media post about our new product launch',
 *     sections: ['brand_books', 'icp_documents', 'voc_library'],
 *     match_count: 8
 *   })
 *   // Inject `context` into agent system prompt
 */
export async function buildAgentContext(
  params: QueryClientBrainParams
): Promise<string> {
  // Run guardrails and brain search in parallel
  const [guardrails, brainResults] = await Promise.all([
    getClientGuardrails(params.client_id),
    queryClientBrain(params),
  ])

  const parts: string[] = []

  // Guardrails always come first (hard constraints)
  if (guardrails) {
    parts.push(formatGuardrailsForPrompt(guardrails))
  }

  // Brain context provides relevant knowledge
  if (brainResults.length > 0) {
    parts.push(formatBrainContextForPrompt(brainResults))
  }

  return parts.join('\n\n')
}
