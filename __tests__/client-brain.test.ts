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
// Mock @/lib/supabase BEFORE importing the SUT
// ──────────────────────────────────────────────────────────
type RpcResolver = (name: string, args: unknown) => { data: unknown; error: unknown }
type FnResolver = (name: string, opts: unknown) => { data: unknown; error: unknown }

const state: {
  rpc: RpcResolver
  fn: FnResolver
  rpcCalls: Array<{ name: string; args: unknown }>
  fnCalls: Array<{ name: string; opts: unknown }>
} = {
  rpc: () => ({ data: [], error: null }),
  fn: () => ({ data: { embedding: [] }, error: null }),
  rpcCalls: [],
  fnCalls: [],
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    rpc(name: string, args: unknown) {
      state.rpcCalls.push({ name, args })
      return Promise.resolve(state.rpc(name, args))
    },
    functions: {
      invoke(name: string, opts: unknown) {
        state.fnCalls.push({ name, opts })
        return Promise.resolve(state.fn(name, opts))
      },
    },
  }),
  getSupabase: () => null,
}))

import {
  generateEmbedding,
  queryClientBrain,
  getClientGuardrails,
  buildAgentContext,
  formatGuardrailsForPrompt,
  formatBrainContextForPrompt,
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

const FAKE_GUARDRAILS_ROW = {
  forbidden_words: ['cheap', 'discount'],
  required_terminology: ['premium protection'],
  voice_description: 'Professional, authoritative.',
  competitor_mentions_policy: 'Never mention competitors by name.',
  compliance_notes: 'All claims must be verifiable.',
}

beforeEach(() => {
  state.rpc = () => ({ data: [], error: null })
  state.fn = () => ({ data: { embedding: FAKE_EMBED }, error: null })
  state.rpcCalls = []
  state.fnCalls = []
})

// ──────────────────────────────────────────────────────────
// generateEmbedding
// ──────────────────────────────────────────────────────────
describe('generateEmbedding', () => {
  it('invokes the generate-embedding edge function and returns the vector', async () => {
    const out = await generateEmbedding('hello world')
    expect(out).toEqual(FAKE_EMBED)
    expect(state.fnCalls).toHaveLength(1)
    expect(state.fnCalls[0].name).toBe('generate-embedding')
    expect(state.fnCalls[0].opts).toMatchObject({ body: { text: 'hello world' } })
  })

  it('throws with the supabase error message on failure', async () => {
    state.fn = () => ({ data: null, error: { message: 'edge function 500' } })
    await expect(generateEmbedding('x')).rejects.toThrow(/edge function 500/i)
  })
})

// ──────────────────────────────────────────────────────────
// queryClientBrain
// ──────────────────────────────────────────────────────────
describe('queryClientBrain', () => {
  it('happy path: generates embedding then calls query_client_brain RPC with defaults', async () => {
    state.rpc = () => ({ data: FAKE_RESULTS, error: null })

    const out = await queryClientBrain({ client_id: 'c-1', query: 'voice for social' })

    expect(out).toEqual(FAKE_RESULTS)
    expect(state.fnCalls[0].name).toBe('generate-embedding')
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].name).toBe('query_client_brain')
    const args = state.rpcCalls[0].args as Record<string, unknown>
    expect(args.p_client_id).toBe('c-1')
    expect(args.p_query_embedding).toEqual(FAKE_EMBED)
    // Default sections: all 5
    expect(args.p_sections).toEqual([
      'brand_books',
      'icp_documents',
      'voc_library',
      'competitive_landscape',
      'historical_outputs',
    ])
    expect(args.p_match_count).toBe(10)
  })

  it('passes custom sections and match_count through to the RPC', async () => {
    state.rpc = () => ({ data: [], error: null })
    await queryClientBrain({
      client_id: 'c-2',
      query: 'q',
      sections: ['brand_books', 'voc_library'],
      match_count: 3,
    })
    const args = state.rpcCalls[0].args as Record<string, unknown>
    expect(args.p_sections).toEqual(['brand_books', 'voc_library'])
    expect(args.p_match_count).toBe(3)
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
    state.fn = () => ({ data: null, error: { message: 'embed boom' } })
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
      if (name === 'query_client_brain') return { data: FAKE_RESULTS, error: null }
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
      if (name === 'query_client_brain') return { data: FAKE_RESULTS, error: null }
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
