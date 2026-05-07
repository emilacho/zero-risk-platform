/**
 * Higgsfield API client wrapper · API Key auth.
 * Scaffold — methods are wired but tool handlers stay stubbed.
 */

interface HiggsConfig {
  apiKey: string
  baseUrl?: string
  webhookUrl?: string
}

export class HiggsfieldClient {
  private apiKey: string
  private baseUrl: string
  webhookUrl: string | null

  constructor(cfg: HiggsConfig) {
    if (!cfg.apiKey) throw new Error('HiggsfieldClient: apiKey is required')
    this.apiKey = cfg.apiKey
    this.baseUrl = cfg.baseUrl ?? 'https://api.higgsfield.ai'
    this.webhookUrl = cfg.webhookUrl ?? null
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async get(path: string): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() })
    if (!r.ok) throw new Error(`Higgsfield GET ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`Higgsfield POST ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }
}
