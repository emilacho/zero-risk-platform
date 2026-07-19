/**
 * Apify API client wrapper · token query param + async actor polling.
 *
 * CANDADO #1 · RELOCADO desde `packages/apify-mcp-server/src/client.ts` (#296, CC#1)
 * porque la app Next NO tiene workspaces ni depende del paquete (tsconfig excluye
 * `packages/`), así que la función de scrape NO era importable desde este endpoint.
 * Copia FIEL de la lógica testeada de CC#1 · misma API. CONSOLIDACIÓN a única fuente
 * de verdad (MCP importa de acá o viceversa) = follow-up de candado. No divergir sin
 * sincronizar ambos lados.
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

  /**
   * Corre el actor y devuelve `runId` + `datasetId` + items · el scrape de competidor
   * los necesita para la procedencia real (`apify_scrape` · run_id + dataset_id en
   * `deep_scan_data`). Construido sobre los primitivos (POST run · GET status · GET items).
   */
  async runActorAndCollect(
    actorId: string,
    input: unknown,
    timeoutMs = 120_000,
    pollIntervalMs = 3000,
    itemLimit = 100,
  ): Promise<{ runId: string; datasetId: string | null; items: unknown[] }> {
    const runRes = (await this.post(`/acts/${encodeURIComponent(actorId)}/runs`, input)) as {
      data: { id: string }
    }
    const runId = runRes.data.id
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const statusRes = (await this.get(`/actor-runs/${runId}`)) as {
        data: { status: string; defaultDatasetId?: string }
      }
      const st = statusRes.data.status
      if (st === 'SUCCEEDED') {
        const datasetId = statusRes.data.defaultDatasetId ?? null
        const items = datasetId
          ? await this.get(`/datasets/${datasetId}/items`, { limit: String(itemLimit) })
          : []
        return { runId, datasetId, items: Array.isArray(items) ? items : [] }
      }
      if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(st)) {
        throw new Error(`Apify actor ${runId} ${st}`)
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    throw new Error(`Apify actor ${runId} timeout after ${timeoutMs}ms`)
  }
}
