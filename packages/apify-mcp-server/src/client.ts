/**
 * Apify API client wrapper · token query param + async actor polling.
 * Scaffold — methods are wired but tool handlers stay stubbed.
 */

interface ApifyConfig {
  token: string
  baseUrl?: string
}

export class ApifyClient {
  private token: string
  private baseUrl: string

  constructor(cfg: ApifyConfig) {
    if (!cfg.token) throw new Error('ApifyClient: token is required')
    this.token = cfg.token
    this.baseUrl = cfg.baseUrl ?? 'https://api.apify.com/v2'
  }

  private url(path: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ token: this.token, ...extra })
    return `${this.baseUrl}${path}?${params.toString()}`
  }

  async get(path: string, extra?: Record<string, string>): Promise<unknown> {
    const r = await fetch(this.url(path, extra))
    if (!r.ok) throw new Error(`Apify GET ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`Apify POST ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }

  async runActorAndWait(
    actorId: string,
    input: unknown,
    timeoutMs = 120_000,
    pollIntervalMs = 3000,
  ): Promise<unknown> {
    const runRes = (await this.post(`/acts/${actorId}/runs`, input)) as { data: { id: string } }
    const runId = runRes.data.id
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const statusRes = (await this.get(`/actor-runs/${runId}`)) as { data: { status: string; defaultDatasetId: string } }
      if (statusRes.data.status === 'SUCCEEDED') {
        return this.get(`/datasets/${statusRes.data.defaultDatasetId}/items`)
      }
      if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(statusRes.data.status)) {
        throw new Error(`Apify actor ${runId} ${statusRes.data.status}`)
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    throw new Error(`Apify actor ${runId} timeout after ${timeoutMs}ms`)
  }
}
