/**
 * GET /api/whatsapp/templates · Sprint 4 · list Meta-approved templates.
 *
 * Auth · INTERNAL_API_KEY.
 * Cache · 1h server-side (Next revalidate).
 *
 * Returns · `{ ok: true, count, templates: [{ name, language, status, category }] }`
 *   503 · env vars missing
 *   502 · Meta upstream error
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { listTemplates } from "@/lib/whatsapp/meta-graph"

export const dynamic = "force-dynamic"
export const revalidate = 3600

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  const result = await listTemplates()
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      count: result.templates.length,
      templates: result.templates,
    })
  }

  switch (result.code) {
    case "env_missing":
      return NextResponse.json(
        { ok: false, error: "not_configured", detail: result.detail },
        { status: 503 },
      )
    case "provider_error":
    case "fetch_error":
    default:
      return NextResponse.json(result, { status: 502 })
  }
}
