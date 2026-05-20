/**
 * POST /api/notion/sync-report · Sprint 4 D5 · Reporting Track.
 *
 * Single entry surface for pushing report rows into one of the 3
 * canonical Notion databases (campaigns · clients · weekly). Each call
 * is best-effort · we return structured non-2xx without throwing when
 * Notion is unconfigured so callers (n8n cron · MC bridge) can swallow
 * gracefully and keep the rest of the pipeline going.
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { createPage, getReportDatabaseId } from "@/lib/notion/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_TYPES = ["campaign", "client", "weekly"] as const
type ReportType = (typeof ALLOWED_TYPES)[number]

function isAllowedType(value: unknown): value is ReportType {
  return typeof value === "string" && (ALLOWED_TYPES as readonly string[]).includes(value)
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    )
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "validation_failed", detail: "body must be a JSON object" },
      { status: 400 },
    )
  }
  const body = raw as Record<string, unknown>

  if (!isAllowedType(body.type)) {
    return NextResponse.json(
      {
        error: "validation_failed",
        detail: `type must be one of ${ALLOWED_TYPES.join(", ")}`,
      },
      { status: 400 },
    )
  }
  const payload = body.payload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "validation_failed", detail: "payload must be a JSON object" },
      { status: 400 },
    )
  }

  const databaseId = getReportDatabaseId(body.type)
  if (!databaseId) {
    return NextResponse.json(
      {
        error: "service_unconfigured",
        detail: `NOTION_DATABASE_${body.type.toUpperCase()}S env missing`,
        type: body.type,
      },
      { status: 503 },
    )
  }

  const result = await createPage(
    databaseId,
    payload as Record<string, unknown>,
  )
  if (!result.ok) {
    if (result.code === "NotConfigured") {
      return NextResponse.json(
        {
          error: "service_unconfigured",
          detail: result.detail,
          type: body.type,
        },
        { status: 503 },
      )
    }
    if (result.code === "InvalidInput") {
      return NextResponse.json(
        { error: "validation_failed", detail: result.detail },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: "upstream_error", detail: result.detail, type: body.type },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    type: body.type,
    page_id: result.data?.id,
    url: result.data?.url,
  })
}

export function GET() {
  return NextResponse.json({
    endpoint: "/api/notion/sync-report",
    method: "POST",
    description:
      "Push a report row into one of the 3 canonical Notion databases (campaigns · clients · weekly). Best-effort · 503 graceful when unconfigured.",
    body_shape: {
      type: "'campaign' | 'client' | 'weekly'",
      payload: "Record<string, unknown> · Notion property shape per database",
    },
    env_required: [
      "NOTION_TOKEN",
      "NOTION_DATABASE_CAMPAIGNS",
      "NOTION_DATABASE_CLIENTS",
      "NOTION_DATABASE_WEEKLY",
    ],
  })
}
