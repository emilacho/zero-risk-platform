/**
 * DataForSEO API client wrapper · Basic Auth + cost estimator.
 * Scaffold — methods perform real HTTP but tool handlers stay stubbed.
 */

const COST_TABLE: Record<string, number> = {
  'serp.google': 0.0006,
  'serp.bing': 0.0006,
  'serp.youtube': 0.001,
  'keywords.for_keyword': 0.0075,
  'keywords.for_site': 0.0075,
  'search_volume': 0.05,
  'keyword_difficulty': 0.025,
  'competitors.domain': 0.025,
  'backlinks.summary': 0.02,
  'referring_domains': 0.02,
  'content_analysis': 0.01,
}

interface DFSConfig {
  login: string
  password: string
  baseUrl?: string
}

export class DFSClient {
  private auth: string
  private baseUrl: string

  constructor(cfg: DFSConfig) {
    if (!cfg.login || !cfg.password) {
      throw new Error('DFSClient: login and password are required')
    }
    this.auth = Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')
    this.baseUrl = cfg.baseUrl ?? 'https://api.dataforseo.com'
  }

  estimateCost(operation: string): number {
    return COST_TABLE[operation] ?? 0
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`DFS POST ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }
}
