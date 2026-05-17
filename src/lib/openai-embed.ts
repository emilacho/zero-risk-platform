/**
 * Sprint #8 Workstream D · OpenAI embedding helper
 *
 * Wraps OpenAI text-embedding-3-small (1536 dims). Stack canon · OpenAI
 * already present for GPT-Image-1.5 · 0 new providers.
 *
 * Returns { embedding, usage } or throws on upstream failure.
 */
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_MODEL = 'text-embedding-3-small'
const DEFAULT_DIMS = 1536
// 1 token ≈ 4 chars · text-embedding-3-small max 8191 input tokens → ~32K chars
const MAX_INPUT_CHARS = 32_000

export type EmbedResult = {
  embedding: number[]
  model: string
  dimensions: number
  input_tokens: number
  truncated: boolean
}

export type OpenAIEmbedResponse = {
  data: Array<{ embedding: number[]; index: number }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

export async function embedText(text: string, opts?: {
  model?: string
  dimensions?: number
  timeoutMs?: number
}): Promise<EmbedResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY env var missing')
  }
  const model = opts?.model || DEFAULT_MODEL
  const dimensions = opts?.dimensions || DEFAULT_DIMS
  const timeoutMs = opts?.timeoutMs ?? 20_000

  const truncated = text.length > MAX_INPUT_CHARS
  const input = truncated ? text.slice(0, MAX_INPUT_CHARS) : text

  const res = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input, dimensions }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI embed failed · status=${res.status} · ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as OpenAIEmbedResponse
  const embedding = data.data?.[0]?.embedding
  if (!Array.isArray(embedding) || embedding.length !== dimensions) {
    throw new Error(`OpenAI returned unexpected embedding shape (len=${embedding?.length})`)
  }

  return {
    embedding,
    model: data.model,
    dimensions,
    input_tokens: data.usage?.prompt_tokens || 0,
    truncated,
  }
}

/**
 * Helper · concatenate creative copy fields + landing context into a single
 * embedding-ready string. Stable order keeps semantics consistent across runs.
 */
export function buildCreativeContentText(parts: {
  title?: string | null
  body?: string | null
  call_to_action?: string | null
  link_url?: string | null
  image_url?: string | null
  industry?: string | null
  campaign_objective?: string | null
  diferenciador?: string | null
}): string {
  const lines: string[] = []
  if (parts.industry) lines.push(`Industry: ${parts.industry}`)
  if (parts.campaign_objective) lines.push(`Objective: ${parts.campaign_objective}`)
  if (parts.diferenciador) lines.push(`Diferenciador: ${parts.diferenciador}`)
  if (parts.title) lines.push(`Title: ${parts.title}`)
  if (parts.body) lines.push(`Body: ${parts.body}`)
  if (parts.call_to_action) lines.push(`CTA: ${parts.call_to_action}`)
  if (parts.link_url) lines.push(`Link: ${parts.link_url}`)
  if (parts.image_url) lines.push(`ImageURL: ${parts.image_url}`)
  return lines.join('\n')
}
