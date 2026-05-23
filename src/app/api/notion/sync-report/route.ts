/**
 * POST /api/notion/sync-report · Sprint 6 Track C4 unified Notion sync.
 *
 * Unified entry point que reemplaza el N-endpoint fan-out por tipo. Body
 * field `type` discrimina · cada type routea al endpoint canonical
 * existente (create-client-workspace · create-qbr-page · create-success-plan
 * · create-weekly-report) sin duplicar block-builder lógica.
 *
 * Auth · INTERNAL_API_KEY (canonical pattern).
 *
 * Body ·
 *   {
 *     type: "client" | "campaign" | "weekly",
 *     client_id?: string,
 *     campaign_id?: string,
 *     payload: { ... type-specific data passes through ... }
 *   }
 *
 * Returns ·
 *   200 · `{ ok: true, notion_page_id, type, ... }`
 *   401 · auth fails
 *   400 · invalid type OR payload missing
 *   500 · Notion API error (NOTION_API_KEY missing OR upstream failure)
 *
 * Routes to ·
 *   type=client   → POST /api/notion/create-client-workspace
 *   type=campaign → POST /api/notion/create-qbr-page (campaign-scoped)
 *   type=weekly   → POST /api/notion/create-weekly-report
 *
 * Sprint 6 Track C4 wire-in callers ·
 *   - OnboardingOrchestrator post-Phase 1 · type=client
 *   - NEXUS Phase 7 OPTIMIZE close · type=campaign
 *   - Weekly Client Report v2 workflow · type=weekly
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type SyncReportType = "client" | "campaign" | "weekly"
const VALID_TYPES = new Set<SyncReportType>(["client", "campaign", "weekly"])

type SyncReportBody = {
  type?: string
  client_id?: string
  campaign_id?: string
  payload?: Record<string, unknown>
}

const TYPE_TO_ENDPOINT: Record<SyncReportType, string> = {
  client: "/api/notion/create-client-workspace",
  campaign: "/api/notion/create-qbr-page",
  weekly: "/api/notion/create-weekly-report",
}

function getBaseUrl(reqUrl: string): string {
  const url = new URL(reqUrl)
  return `${url.protocol}//${url.host}`
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let body: SyncReportBody
  try {
    body = (await request.json()) as SyncReportBody
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", code: "E-NOTION-SYNC-JSON" },
      { status: 400 },
    )
  }

  if (!body.type || !VALID_TYPES.has(body.type as SyncReportType)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'type must be "client" | "campaign" | "weekly"',
        code: "E-NOTION-SYNC-TYPE",
        got: body.type,
      },
      { status: 400 },
    )
  }
  if (!body.payload || typeof body.payload !== "object") {
    return NextResponse.json(
      {
        ok: false,
        error: "payload object required",
        code: "E-NOTION-SYNC-PAYLOAD",
      },
      { status: 400 },
    )
  }

  const type = body.type as SyncReportType
  const targetPath = TYPE_TO_ENDPOINT[type]
  const targetUrl = `${getBaseUrl(request.url)}${targetPath}`

  // Forward to canonical type-specific endpoint · preserves single-source-of-truth
  // for block-builder logic en cada existing handler.
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.INTERNAL_API_KEY ?? "",
      },
      body: JSON.stringify({
        ...body.payload,
        client_id: body.client_id,
        campaign_id: body.campaign_id,
      }),
      signal: AbortSignal.timeout(25_000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "notion_upstream_failed",
          type,
          target: targetPath,
          upstream_status: res.status,
          upstream_response: data,
        },
        { status: res.status === 503 ? 503 : 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      type,
      target: targetPath,
      notion_page_id: data.page_id ?? data.notion_page_id ?? null,
      upstream_response: data,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      { ok: false, error: "fetch_error", detail: msg.slice(0, 500) },
      { status: 502 },
    )
  }
}

/** Diagnostic GET */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/notion/sync-report",
    method: "POST",
    auth: "INTERNAL_API_KEY via `x-api-key` header",
    types: ["client", "campaign", "weekly"],
    canonical_callers: {
      client: "OnboardingOrchestrator post-Phase-1",
      campaign: "NEXUS Phase 7 OPTIMIZE close",
      weekly: "Weekly Client Report v2 n8n workflow",
    },
    env_required: [
      "NOTION_API_KEY",
      "NOTION_PARENT_PAGE_ID (or pass parent_page_id per request)",
    ],
    env_optional: [
      "NOTION_DATABASE_CLIENTS",
      "NOTION_DATABASE_CAMPAIGNS",
      "NOTION_DATABASE_WEEKLY",
    ],
  })
}
