/**
 * client-brain.test.ts · Wave 16 · CC#3 · T1 (coverage)
 *
 * Covers `src/lib/client-brain.ts` — RAG search wrappers + guardrails fetch
 * + system-prompt formatters + full-context builder.
 *
 * Strategy:
 *  - Pure formatter functions (formatGuardrailsForPrompt, formatBrainContextForPrompt)
 *    tested directly with fixtures.
 *  - Supabase-backed functions (generateEmbedding, queryClientBrain,
 *    getClientGuardrails, buildAgentContext) tested with vi.mock of
 *    @/lib/supabase exposing a chainable mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ──────────────────────────────────────────────────────────
// Mock @/lib/supabase + @/lib/brain/embed BEFORE importing the SUT
//
// Sprint-brain §144 A1 · client-brain.ts now embeds via OpenAI
// (src/lib/brain/embed.ts · `generateEmbedding` discriminated union) and
// calls the canonical 3-arg RPC `query_client_brain(p_client_id,
// p_query_embedding, p_top_k)`. The prior edge-function + 4-arg RPC are gone.
// ──────────────────────────────────────────────────────────
type RpcResolver = (name: string, args: unknown) => { data: unknown; error: unknown }
type EmbedResult =
  | { ok: true; embedding: number[]; model: string; tokens: number }
  | { ok: false; code: string; detail: string }

const state: {
  rpc: RpcResolver
  embed: () => EmbedResult
  rpcCalls: Array<{ name: string; args: unknown }>
  embedCalls: Array<{ text: string }>
} = {
  rpc: () => ({ data: [], error: null }),
  embed: () => ({ ok: true, embedding: [], model: 'text-embedding-3-small', tokens: 1 }),
  rpcCalls: [],
  embedCalls: [],
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    rpc(name: string, args: unknown) {
      state.rpcCalls.push({ name, args })
      return Promise.resolve(state.rpc(name, args))
    },
  }),
  getSupabase: () => null,
}))

vi.mock('@/lib/brain/embed', () => ({
  generateEmbedding: (text: string) => {
    state.embedCalls.push({ text })
    return Promise.resolve(state.embed())
  },
  EMBEDDING_DIMENSIONS: 1536,
}))

import {
  generateEmbedding,
  queryClientBrain,
  getClientGuardrails,
  buildAgentContext,
  formatGuardrailsForPrompt,
  formatBrainContextForPrompt,
  buildBrainProvenanceTag,
  LEGACY_PROVENANCE_TAG,
  type BrainSearchResult,
  type ClientGuardrails,
} from '../src/lib/client-brain'

// ──────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────
const FAKE_EMBED = Array.from({ length: 1536 }, () => 0.001)

const FAKE_RESULTS: BrainSearchResult[] = [
  {
    source_table: 'brand_books',
    source_id: 'bb-1',
    label: 'Brand Book v2',
    content_text: 'The brand voice is professional yet approachable.',
    similarity: 0.92,
  },
  {
    source_table: 'icp_documents',
    source_id: 'icp-1',
    label: 'ICP: SMB',
    content_text: 'C-suite at 50–200 employee companies.',
    similarity: 0.873,
  },
]

// Raw rows as the canonical 3-arg RPC returns them (prefixed source_table +
// chunk_id/section_label/chunk_text). queryClientBrain maps these → FAKE_RESULTS.
const FAKE_RPC_ROWS = [
  {
    chunk_id: 'ch-1',
    source_table: 'client_brand_books',
    source_id: 'bb-1',
    section_label: 'Brand Book v2',
    chunk_text: 'The brand voice is professional yet approachable.',
    similarity: 0.92,
  },
  {
    chunk_id: 'ch-2',
    source_table: 'client_icp_documents',
    source_id: 'icp-1',
    section_label: 'ICP: SMB',
    chunk_text: 'C-suite at 50–200 employee companies.',
    similarity: 0.873,
  },
]

const FAKE_GUARDRAILS_ROW = {
  forbidden_words: ['cheap', 'discount'],
  required_terminology: ['premium protection'],
  voice_description: 'Professional, authoritative.',
  competitor_mentions_policy: 'Never mention competitors by name.',
  compliance_notes: 'All claims must be verifiable.',
}

beforeEach(() => {
  state.rpc = () => ({ data: [], error: null })
  state.embed = () => ({ ok: true, embedding: FAKE_EMBED, model: 'text-embedding-3-small', tokens: 3 })
  state.rpcCalls = []
  state.embedCalls = []
})

// ──────────────────────────────────────────────────────────
// generateEmbedding
// ──────────────────────────────────────────────────────────
describe('generateEmbedding', () => {
  it('embeds via OpenAI (text-embedding-3-small) and returns the vector', async () => {
    const out = await generateEmbedding('hello world')
    expect(out).toEqual(FAKE_EMBED)
    expect(state.embedCalls).toHaveLength(1)
    expect(state.embedCalls[0].text).toBe('hello world')
  })

  it('throws with the embed error code/detail on failure', async () => {
    state.embed = () => ({ ok: false, code: 'ProviderError', detail: 'openai 500' })
    await expect(generateEmbedding('x')).rejects.toThrow(/ProviderError.*openai 500/i)
  })
})

// ──────────────────────────────────────────────────────────
// queryClientBrain
// ──────────────────────────────────────────────────────────
describe('queryClientBrain', () => {
  it('happy path: embeds then calls the 3-arg RPC and maps rows → BrainSearchResult', async () => {
    state.rpc = () => ({ data: FAKE_RPC_ROWS, error: null })

    const out = await queryClientBrain({ client_id: 'c-1', query: 'voice for social' })

    // Mapped: section_label→label · chunk_text→content_text · source_table de-prefixed
    expect(out).toEqual(FAKE_RESULTS)
    expect(state.embedCalls[0].text).toBe('voice for social')
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].name).toBe('query_client_brain')
    const args = state.rpcCalls[0].args as Record<string, unknown>
    expect(args.p_client_id).toBe('c-1')
    expect(args.p_query_embedding).toEqual(FAKE_EMBED)
    // Canonical 3-arg signature · no p_sections / p_match_count
    expect(args.p_sections).toBeUndefined()
    expect(args.p_match_count).toBeUndefined()
    // Default match_count 10 → p_top_k 10 (no section filter)
    expect(args.p_top_k).toBe(10)
  })

  it('over-fetches (match_count*3) and filters by source_table when sections given', async () => {
    state.rpc = () => ({ data: FAKE_RPC_ROWS, error: null })
    const out = await queryClientBrain({
      client_id: 'c-2',
      query: 'q',
      sections: ['brand_books'],
      match_count: 3,
    })
    const args = state.rpcCalls[0].args as Record<string, unknown>
    expect(args.p_top_k).toBe(9) // 3 * 3
    // Only the brand_books row survives the JS-side filter
    expect(out).toHaveLength(1)
    expect(out[0].source_table).toBe('brand_books')
  })

  it('returns an empty array when the RPC returns null', async () => {
    state.rpc = () => ({ data: null, error: null })
    const out = await queryClientBrain({ client_id: 'c-3', query: 'q' })
    expect(out).toEqual([])
  })

  it('throws if the RPC errors', async () => {
    state.rpc = () => ({ data: null, error: { message: 'pgvector index missing' } })
    await expect(
      queryClientBrain({ client_id: 'c-4', query: 'q' }),
    ).rejects.toThrow(/query_client_brain failed.*pgvector/i)
  })

  it('propagates embedding-generation failures (does not call RPC)', async () => {
    state.embed = () => ({ ok: false, code: 'NetworkError', detail: 'embed boom' })
    await expect(
      queryClientBrain({ client_id: 'c-5', query: 'q' }),
    ).rejects.toThrow(/embed boom/i)
    expect(state.rpcCalls).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────
// getClientGuardrails
// ──────────────────────────────────────────────────────────
describe('getClientGuardrails', () => {
  it('returns a normalized object when the RPC returns a row', async () => {
    state.rpc = () => ({ data: [FAKE_GUARDRAILS_ROW], error: null })
    const g = await getClientGuardrails('c-1')
    expect(g).toEqual(FAKE_GUARDRAILS_ROW)
    expect(state.rpcCalls[0].name).toBe('get_client_guardrails')
    expect((state.rpcCalls[0].args as Record<string, unknown>).p_client_id).toBe('c-1')
  })

  it('returns null when no guardrails are configured (empty array)', async () => {
    state.rpc = () => ({ data: [], error: null })
    expect(await getClientGuardrails('c-1')).toBeNull()
  })

  it('returns null when data is null', async () => {
    state.rpc = () => ({ data: null, error: null })
    expect(await getClientGuardrails('c-1')).toBeNull()
  })

  it('coerces missing array fields to [] and missing strings to null', async () => {
    state.rpc = () => ({
      data: [{ forbidden_words: null, required_terminology: null, voice_description: undefined, competitor_mentions_policy: undefined, compliance_notes: undefined }],
      error: null,
    })
    const g = await getClientGuardrails('c-1')
    expect(g).toEqual({
      forbidden_words: [],
      required_terminology: [],
      voice_description: null,
      competitor_mentions_policy: null,
      compliance_notes: null,
    })
  })

  it('throws if the RPC errors', async () => {
    state.rpc = () => ({ data: null, error: { message: 'rls denied' } })
    await expect(getClientGuardrails('c-1')).rejects.toThrow(/get_client_guardrails failed.*rls/i)
  })
})

// ──────────────────────────────────────────────────────────
// formatGuardrailsForPrompt
// ──────────────────────────────────────────────────────────
describe('formatGuardrailsForPrompt', () => {
  it('renders all sections in canonical order, wrapped in tags', () => {
    const out = formatGuardrailsForPrompt(FAKE_GUARDRAILS_ROW as ClientGuardrails)
    expect(out.startsWith('<client_guardrails>')).toBe(true)
    expect(out.endsWith('</client_guardrails>')).toBe(true)
    // Order: VOICE → FORBIDDEN → REQUIRED → COMPETITOR → COMPLIANCE
    const idx = (s: string) => out.indexOf(s)
    expect(idx('VOICE:')).toBeLessThan(idx('FORBIDDEN WORDS'))
    expect(idx('FORBIDDEN WORDS')).toBeLessThan(idx('REQUIRED TERMINOLOGY'))
    expect(idx('REQUIRED TERMINOLOGY')).toBeLessThan(idx('COMPETITOR POLICY'))
    expect(idx('COMPETITOR POLICY')).toBeLessThan(idx('COMPLIANCE'))
    // Joins arrays with ", "
    expect(out).toContain('cheap, discount')
    expect(out).toContain('premium protection')
  })

  it('omits empty arrays and null strings cleanly', () => {
    const out = formatGuardrailsForPrompt({
      forbidden_words: [],
      required_terminology: [],
      voice_description: null,
      competitor_mentions_policy: null,
      compliance_notes: null,
    })
    expect(out).toBe('<client_guardrails>\n</client_guardrails>')
    expect(out).not.toContain('FORBIDDEN')
    expect(out).not.toContain('VOICE')
  })

  it('renders only voice when only voice is set', () => {
    const out = formatGuardrailsForPrompt({
      forbidden_words: [],
      required_terminology: [],
      voice_description: 'Snappy.',
      competitor_mentions_policy: null,
      compliance_notes: null,
    })
    expect(out).toContain('VOICE: Snappy.')
    expect(out).not.toContain('FORBIDDEN')
  })
})

// ──────────────────────────────────────────────────────────
// formatBrainContextForPrompt
// ──────────────────────────────────────────────────────────
describe('formatBrainContextForPrompt', () => {
  it('returns empty string for empty results (no tags)', () => {
    expect(formatBrainContextForPrompt([])).toBe('')
  })

  it('wraps each result with [label | similarity: X.XX] header', () => {
    const out = formatBrainContextForPrompt(FAKE_RESULTS)
    expect(out.startsWith('<client_brain_context>')).toBe(true)
    expect(out.endsWith('</client_brain_context>')).toBe(true)
    expect(out).toContain('[Brand Book v2 | similarity: 0.92]')
    expect(out).toContain('[ICP: SMB | similarity: 0.87]') // toFixed(2) rounds 0.873 → 0.87
    expect(out).toContain('The brand voice is professional yet approachable.')
  })

  it('separates results with a blank line', () => {
    const out = formatBrainContextForPrompt(FAKE_RESULTS)
    // Each result block ends with an empty string pushed to lines → blank line before next [...
    const blocks = out.split(/\n\[/g)
    expect(blocks.length).toBeGreaterThan(1)
  })
})

// ──────────────────────────────────────────────────────────
// buildAgentContext (composition: guardrails + queryClientBrain in parallel)
// ──────────────────────────────────────────────────────────
describe('buildAgentContext', () => {
  it('returns guardrails + brain context concatenated when both populated', async () => {
    state.rpc = (name) => {
      if (name === 'get_client_guardrails') return { data: [FAKE_GUARDRAILS_ROW], error: null }
      if (name === 'query_client_brain') return { data: FAKE_RPC_ROWS, error: null }
      return { data: null, error: { message: `unknown rpc ${name}` } }
    }

    const out = await buildAgentContext({ client_id: 'c-1', query: 'launch post' })
    expect(out).toContain('<client_guardrails>')
    expect(out).toContain('<client_brain_context>')
    // Guardrails come first, separated by blank line
    expect(out.indexOf('<client_guardrails>')).toBeLessThan(out.indexOf('<client_brain_context>'))
  })

  it('returns only brain context when no guardrails configured', async () => {
    state.rpc = (name) => {
      if (name === 'get_client_guardrails') return { data: [], error: null }
      if (name === 'query_client_brain') return { data: FAKE_RPC_ROWS, error: null }
      return { data: null, error: null }
    }
    const out = await buildAgentContext({ client_id: 'c-1', query: 'q' })
    expect(out).not.toContain('<client_guardrails>')
    expect(out).toContain('<client_brain_context>')
  })

  it('returns only guardrails when brain search is empty', async () => {
    state.rpc = (name) => {
      if (name === 'get_client_guardrails') return { data: [FAKE_GUARDRAILS_ROW], error: null }
      if (name === 'query_client_brain') return { data: [], error: null }
      return { data: null, error: null }
    }
    const out = await buildAgentContext({ client_id: 'c-1', query: 'q' })
    expect(out).toContain('<client_guardrails>')
    expect(out).not.toContain('<client_brain_context>')
  })

  it('returns empty string when neither side has data', async () => {
    state.rpc = () => ({ data: [], error: null })
    const out = await buildAgentContext({ client_id: 'c-1', query: 'q' })
    expect(out).toBe('')
  })
})

// ──────────────────────────────────────────────────────────
// provenance tag · Sprint-brain §144 FASE B (ADR-012 §6.6 + dos puertas)
// ──────────────────────────────────────────────────────────
describe('buildBrainProvenanceTag', () => {
  it('defaults to the safe floor: untrusted evidence', () => {
    const tag = buildBrainProvenanceTag({ source: 'apify_scrape' })
    expect(tag).toEqual({ source: 'apify_scrape', type: 'evidence', trust_level: 'untrusted' })
  })

  it('honors explicit canon + trust + optional ingress fields', () => {
    const tag = buildBrainProvenanceTag({
      source: 'camino_iii_writeback',
      type: 'canon',
      trust_level: 'system_trusted',
      ingress_id: 'id-1',
      session_id: 'sess-1',
      received_at: '2026-06-27T00:00:00Z',
      ingress_route: 'wf_123',
    })
    expect(tag.type).toBe('canon')
    expect(tag.trust_level).toBe('system_trusted')
    expect(tag.ingress_id).toBe('id-1')
    expect(tag.ingress_route).toBe('wf_123')
  })

  it('omits optional fields when not provided (no undefined leak)', () => {
    const tag = buildBrainProvenanceTag({ source: 's', type: 'evidence' })
    expect('ingress_id' in tag).toBe(false)
    expect('session_id' in tag).toBe(false)
    expect('received_at' in tag).toBe(false)
    expect('ingress_route' in tag).toBe(false)
  })

  it('LEGACY_PROVENANCE_TAG matches the migration DEFAULT (legacy evidence)', () => {
    expect(LEGACY_PROVENANCE_TAG).toEqual({
      source: 'legacy_pre_adr012',
      trust_level: 'unknown',
      type: 'evidence',
    })
  })
})
