/**
 * Haiku ClassifierClient · canon canonical fetch wrapper (NO SDK)
 *
 * Spec · ADR-012 §4.3 vendor canon canonical · Haiku-self default per §151
 *
 * Canon canonical · uses direct fetch to api.anthropic.com (matches existing
 * repo pattern · src/app/api/agents/classify-lead/route.ts et al). NO SDK
 * dependency. CLAUDE_API_KEY env var canon canonical.
 *
 * Implements `ClassifierClient` interface from ingress-filter lib.
 *
 * Canon canonical NOT consumed by production code yet · used ONLY by FP/FN
 * measurement harness pre-flip. Wire to real Vercel handlers requires §144
 * sign-off post-measurement.
 */
import type {
  ClassifierClient,
  AnthropicMessageRequest,
  AnthropicMessageResponse,
} from '../gates/classifier'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export interface HaikuFetchClientOptions {
  /** Canon canonical · API key · default reads process.env.CLAUDE_API_KEY */
  apiKey?: string
  /** Canon canonical · timeout ms · default 10000 (measurement context · canon canonical higher than runtime) */
  timeout_ms?: number
}

export class HaikuFetchClient implements ClassifierClient {
  private apiKey: string
  private timeoutMs: number

  constructor(options: HaikuFetchClientOptions = {}) {
    const key = options.apiKey ?? process.env.CLAUDE_API_KEY
    if (!key) {
      throw new Error(
        'HaikuFetchClient · CLAUDE_API_KEY env var canon canonical required',
      )
    }
    this.apiKey = key
    this.timeoutMs = options.timeout_ms ?? 10000
  }

  async createMessage(req: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.max_tokens,
          system: req.system,
          messages: req.messages,
        }),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '<no body>')
        throw new Error(
          `Anthropic API error · HTTP ${res.status} · ${errBody.slice(0, 200)}`,
        )
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text: string }>
      }

      const content = (data.content ?? [])
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')

      return { content }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }
}

/** Canon canonical factory · canon canonical helper for harness. */
export function makeHaikuClient(options?: HaikuFetchClientOptions): ClassifierClient {
  return new HaikuFetchClient(options)
}
