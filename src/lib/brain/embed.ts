/**
 * src/lib/brain/embed.ts · Sprint 7.5 A3
 *
 * OpenAI text-embedding-3-small wrapper · 1536 dimensions · ~$0.00002/1K tokens.
 *
 * Used by ·
 *   - scripts/sprint7p5-backfill-client-brain-embeddings.mjs (Track A4)
 *   - src/lib/onboarding-orchestrator.ts post-Phase-1 hook (Track A5)
 *   - services/agent-runner/src/lib/agent-sdk-runner.ts enrichment (Track A6)
 *
 * Design ·
 *   - SDK-less direct REST (matches Anthropic/Resend pattern in this repo)
 *   - Never throws · discriminated union result so callers degrade gracefully
 *     when OpenAI is unreachable OR API key missing (push-enrichment skips
 *     brain inject + agent still runs with identity-only prompt)
 *   - Batch helper for backfill efficiency (up to 2048 inputs per call · OpenAI cap)
 */

const OPENAI_API = 'https://api.openai.com/v1'
const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

export type EmbeddingResult =
  | { ok: true; embedding: number[]; model: string; tokens: number }
  | {
      ok: false
      code: 'ServiceUnconfigured' | 'InvalidInput' | 'ProviderError' | 'NetworkError'
      detail: string
      status?: number
    }

export type BatchEmbeddingResult =
  | { ok: true; embeddings: number[][]; model: string; tokens: number }
  | {
      ok: false
      code: 'ServiceUnconfigured' | 'InvalidInput' | 'ProviderError' | 'NetworkError'
      detail: string
      status?: number
    }

function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

/**
 * Generate a single embedding vector from text. Returns discriminated union ·
 * NEVER throws · caller decides how to handle failures.
 */
export async function generateEmbedding(
  text: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<EmbeddingResult> {
  if (!hasApiKey()) {
    return {
      ok: false,
      code: 'ServiceUnconfigured',
      detail: 'OPENAI_API_KEY missing · set in env to enable Client Brain embeddings',
    }
  }
  const input = (text ?? '').trim()
  if (!input) {
    return {
      ok: false,
      code: 'InvalidInput',
      detail: 'empty_text · cannot embed empty string',
    }
  }
  const fetchFn = opts.fetchImpl ?? fetch
  try {
    const res = await fetchFn(`${OPENAI_API}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    })
    const body = await res.text().catch(() => '')
    if (!res.ok) {
      return {
        ok: false,
        code: 'ProviderError',
        detail: `HTTP ${res.status} · ${body.slice(0, 300)}`,
        status: res.status,
      }
    }
    let parsed: { data?: Array<{ embedding: number[] }>; usage?: { total_tokens: number } } = {}
    try {
      parsed = JSON.parse(body)
    } catch {
      return { ok: false, code: 'ProviderError', detail: 'invalid_json_response' }
    }
    const emb = parsed.data?.[0]?.embedding
    if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIMENSIONS) {
      return {
        ok: false,
        code: 'ProviderError',
        detail: `unexpected_shape · embedding_length=${emb?.length ?? 'undefined'}`,
      }
    }
    return {
      ok: true,
      embedding: emb,
      model: EMBEDDING_MODEL,
      tokens: parsed.usage?.total_tokens ?? 0,
    }
  } catch (e) {
    return {
      ok: false,
      code: 'NetworkError',
      detail: e instanceof Error ? e.message : 'unknown_fetch_error',
    }
  }
}

/**
 * Batch generate embeddings · up to 2048 inputs per call. Used by backfill.
 * Returns embeddings in same order as inputs · never throws.
 */
export async function generateEmbeddings(
  texts: string[],
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<BatchEmbeddingResult> {
  if (!hasApiKey()) {
    return { ok: false, code: 'ServiceUnconfigured', detail: 'OPENAI_API_KEY missing' }
  }
  const inputs = texts.map((t) => (t ?? '').trim()).filter((t) => t.length > 0)
  if (inputs.length === 0) {
    return { ok: false, code: 'InvalidInput', detail: 'empty_texts_array' }
  }
  if (inputs.length > 2048) {
    return { ok: false, code: 'InvalidInput', detail: 'batch_too_large · OpenAI cap 2048' }
  }
  const fetchFn = opts.fetchImpl ?? fetch
  try {
    const res = await fetchFn(`${OPENAI_API}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    })
    const body = await res.text().catch(() => '')
    if (!res.ok) {
      return {
        ok: false,
        code: 'ProviderError',
        detail: `HTTP ${res.status} · ${body.slice(0, 300)}`,
        status: res.status,
      }
    }
    let parsed: {
      data?: Array<{ embedding: number[]; index: number }>
      usage?: { total_tokens: number }
    } = {}
    try {
      parsed = JSON.parse(body)
    } catch {
      return { ok: false, code: 'ProviderError', detail: 'invalid_json_response' }
    }
    const data = (parsed.data ?? []).slice().sort((a, b) => a.index - b.index)
    if (data.length !== inputs.length) {
      return {
        ok: false,
        code: 'ProviderError',
        detail: `batch_mismatch · sent=${inputs.length} · received=${data.length}`,
      }
    }
    return {
      ok: true,
      embeddings: data.map((d) => d.embedding),
      model: EMBEDDING_MODEL,
      tokens: parsed.usage?.total_tokens ?? 0,
    }
  } catch (e) {
    return {
      ok: false,
      code: 'NetworkError',
      detail: e instanceof Error ? e.message : 'unknown_fetch_error',
    }
  }
}

/**
 * Cost estimate · text-embedding-3-small is $0.00002 per 1K tokens.
 * Returns USD cost (number).
 */
export function estimateCost(tokens: number): number {
  return (tokens / 1000) * 0.00002
}
