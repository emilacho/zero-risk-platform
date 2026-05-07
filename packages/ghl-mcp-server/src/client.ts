/**
 * GoHighLevel API client wrapper.
 * Scaffold — methods throw `not_implemented` until the implementation sprint.
 */

interface GHLClientConfig {
  privateKey: string
  locationId: string
  baseUrl?: string
}

export class GHLClient {
  private privateKey: string
  private locationId: string
  private baseUrl: string

  constructor(cfg: GHLClientConfig) {
    if (!cfg.privateKey) throw new Error('GHLClient: privateKey is required')
    if (!cfg.locationId) throw new Error('GHLClient: locationId is required')
    this.privateKey = cfg.privateKey
    this.locationId = cfg.locationId
    this.baseUrl = cfg.baseUrl ?? 'https://services.leadconnectorhq.com'
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: `Bearer ${this.privateKey}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const r = await fetch(url, { method: 'GET', headers: this.headers() })
    if (!r.ok) throw new Error(`GHL GET ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const r = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ locationId: this.locationId, ...(body as object) }),
    })
    if (!r.ok) throw new Error(`GHL POST ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }

  async put(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const r = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`GHL PUT ${path} → ${r.status}: ${await r.text()}`)
    return r.json()
  }
}
