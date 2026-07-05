// =============================================================
// Zero Risk V3 — Client Brain RAG System
// Interfaces + Supabase wrappers for query_client_brain()
// and get_client_guardrails()
// =============================================================

import { getSupabaseAdmin } from './supabase'
import { generateEmbedding as openaiEmbedding } from './brain/embed'

// ── Types ────────────────────────────────────────────────────

export type BrainSection =
  | 'brand_books'
  | 'icp_documents'
  | 'voc_library'
  | 'competitive_landscape'
  | 'historical_outputs'

export interface BrainSearchResult {
  /** ADR-020 M1 · the CEREBRO chunk id · substrate for evidence_refs (claim→chunk linkage). */
  chunk_id: string
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

// ── Provenance tag · Sprint-brain §144 FASE B (ADR-012 §6.6 + dos puertas) ──

/** Brain trust levels · ADR-012 enum + `unknown` para backfill legacy. */
export type BrainTrustLevel =
  | 'untrusted'
  | 'tenant_trusted'
  | 'system_trusted'
  | 'unknown'

/**
 * Provenance tag persisted on every Brain chunk (`client_brain_chunks.provenance_tag`).
 *
 * `type` is the two-doors dimension (architecture §3) ·
 *   - `evidence` = raw/discovery data · context only · NEVER asserted as client fact.
 *   - `canon`    = jefe/Emilio-approved · trusted for decide/publish (FASE D read rule).
 *
 * `source` + ingress fields come from ADR-012 §6.6.1 (anti-injection provenance).
 */
export interface BrainProvenanceTag {
  source: string
  type: 'evidence' | 'canon'
  trust_level: BrainTrustLevel
  ingress_id?: string
  session_id?: string
  received_at?: string
  ingress_route?: string
}

/**
 * Canonical default for rows that pre-date ADR-012 (backfill). Matches the
 * DEFAULT in migration 202606271220. Treat as untrusted evidence.
 */
export const LEGACY_PROVENANCE_TAG: BrainProvenanceTag = {
  source: 'legacy_pre_adr012',
  trust_level: 'unknown',
  type: 'evidence',
}

/**
 * Build a canonical Brain provenance tag for a NEW write (FASE C writers ·
 * portero de datos = evidence · write-back Camino III = canon). Defaults to
 * untrusted evidence — the safe floor — when caller omits fields.
 */
export function buildBrainProvenanceTag(
  input: Partial<BrainProvenanceTag> & { source: string },
): BrainProvenanceTag {
  return {
    source: input.source,
    type: input.type ?? 'evidence',
    trust_level: input.trust_level ?? 'untrusted',
    ...(input.ingress_id ? { ingress_id: input.ingress_id } : {}),
    ...(input.session_id ? { session_id: input.session_id } : {}),
    ...(input.received_at ? { received_at: input.received_at } : {}),
    ...(input.ingress_route ? { ingress_route: input.ingress_route } : {}),
  }
}

// ── Embedding helper ─────────────────────────────────────────

/**
 * Generate an embedding vector for a query.
 *
 * Sprint-brain §144 A1 fix · canonical path = OpenAI `text-embedding-3-small`
 * (1536d) via `src/lib/brain/embed.ts` — the SAME provider the write path
 * (`/api/brain/ingest-source`) and push-enrichment (`brain-enrichment.ts`)
 * use, so query embeddings live in the same vector space as the stored chunks.
 *
 * Replaces the prior Supabase Edge Function `generate-embedding`, which is
 * NOT deployed in prod (verified 2026-06-27 · HTTP 404 NOT_FOUND) and would
 * fail every query. §148.
 *
 * Returns: number[] (1536 dimensions). Throws on embedding failure so callers
 * decide how to degrade.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await openaiEmbedding(text)
  if (!res.ok) {
    throw new Error(`Embedding generation failed: ${res.code} · ${res.detail}`)
  }
  return res.embedding
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
    sections,
    match_count = 10,
  } = params

  // Step 1: Generate embedding from the query text (OpenAI 1536d · canonical).
  const queryEmbedding = await generateEmbedding(query)

  // Step 2: Call the canonical RPC `query_client_brain(p_client_id,
  // p_query_embedding vector(1536), p_top_k int)` over `client_brain_chunks`.
  //
  // Sprint-brain §144 A1 fix · the prior 4-arg signature
  // (p_sections text[], p_match_count) was DROPPED by migration
  // 202605220900 and returns HTTP 404 PGRST202 in prod (verified 2026-06-27).
  // The canonical 3-arg RPC has no section filter, so when the caller asks for
  // specific sections we over-fetch then filter by `source_table` in JS.
  const sectionFilter =
    sections && sections.length > 0 && sections.length < 5 ? new Set(sections) : null
  const topK = sectionFilter
    ? Math.min(50, Math.max(match_count * 3, match_count))
    : match_count

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('query_client_brain', {
    p_client_id: client_id,
    p_query_embedding: queryEmbedding,
    p_top_k: topK,
  })

  if (error) throw new Error(`query_client_brain failed: ${error.message}`)

  // Canonical RPC returns (chunk_id, source_table, source_id, section_label,
  // chunk_text, similarity). Map to the stable BrainSearchResult shape
  // (label ← section_label · content_text ← chunk_text) so consumers
  // (/api/client-brain/query · rag-search) keep working unchanged.
  type RpcRow = {
    chunk_id: string
    source_table: string
    source_id: string
    section_label: string
    chunk_text: string
    similarity: number
  }
  // Chunks store the full table name (`client_competitive_landscape`) but the
  // BrainSection type + the caller's `sections` param are unprefixed
  // (`competitive_landscape`). Normalize so section filtering + the public
  // type stay consistent.
  const stripPrefix = (t: string): BrainSection =>
    (t.startsWith('client_') ? t.slice('client_'.length) : t) as BrainSection
  let rows = ((data ?? []) as RpcRow[]).map<BrainSearchResult>((r) => ({
    chunk_id: r.chunk_id, // ADR-020 M1 · surface (was discarded here)
    source_table: stripPrefix(r.source_table),
    source_id: r.source_id,
    label: r.section_label,
    content_text: r.chunk_text,
    similarity: r.similarity,
  }))

  if (sectionFilter) {
    rows = rows.filter((r) => sectionFilter.has(r.source_table)).slice(0, match_count)
  }

  return rows
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
