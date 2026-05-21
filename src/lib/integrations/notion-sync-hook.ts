/**
 * Notion sync hook · Sprint 6 Track C4 wire-in.
 *
 * Fire-and-forget helper · callers (OnboardingOrchestrator post-Phase-1 ·
 * NEXUS Phase 7 OPTIMIZE close · Weekly Report cron) llaman este helper
 * para sync state a Notion sin bloquear el critical path. Errors swallowed
 * · log advisory only.
 *
 * Routes a `POST /api/notion/sync-report` con type discriminator. Endpoint
 * forwards a canonical type-specific handler (create-client-workspace etc).
 *
 * Env required ·
 *   - NEXT_PUBLIC_BASE_URL or VERCEL_URL (for internal HTTP call)
 *   - INTERNAL_API_KEY (auth header)
 *
 * NO-OP graceful · si fetch falla · logs warning · NUNCA throws.
 */

export type NotionSyncType = "client" | "campaign" | "weekly"

export interface NotionSyncInput {
  type: NotionSyncType
  client_id?: string
  campaign_id?: string
  payload: Record<string, unknown>
  /** Context para logs · ej "onboarding-day1" · "nexus-phase7-close" · "weekly-cron" */
  context?: string
}

export interface NotionSyncResult {
  attempted: boolean
  ok: boolean
  notion_page_id: string | null
  error: string | null
}

function getInternalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000"
  )
}

export async function syncToNotion(input: NotionSyncInput): Promise<NotionSyncResult> {
  const apiKey = process.env.INTERNAL_API_KEY
  if (!apiKey) {
    return {
      attempted: false,
      ok: false,
      notion_page_id: null,
      error: "INTERNAL_API_KEY missing · cannot self-call",
    }
  }

  const base = getInternalBaseUrl()
  const url = `${base}/api/notion/sync-report`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        type: input.type,
        client_id: input.client_id,
        campaign_id: input.campaign_id,
        payload: input.payload,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok) {
      console.log(
        `[notion-sync-hook] failed · type=${input.type} status=${res.status} context=${input.context ?? "?"}`,
      )
      return {
        attempted: true,
        ok: false,
        notion_page_id: null,
        error: `HTTP ${res.status} · ${JSON.stringify(data).slice(0, 200)}`,
      }
    }

    return {
      attempted: true,
      ok: true,
      notion_page_id:
        (data.notion_page_id as string | null | undefined) ??
        (data.page_id as string | null | undefined) ??
        null,
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    console.log(
      `[notion-sync-hook] exception · type=${input.type} context=${input.context ?? "?"} · ${msg}`,
    )
    return {
      attempted: true,
      ok: false,
      notion_page_id: null,
      error: msg.slice(0, 500),
    }
  }
}
