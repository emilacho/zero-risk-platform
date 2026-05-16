/**
 * POST /api/cascade/onboard
 *
 * Sequential 6-agent onboarding cascade · Gap 3 (2026-05-16).
 *
 *   brand-strategist
 *      ↓
 *   market-research-analyst
 *      ↓
 *   creative-director  ← cliente brand_assets (Gap 1)
 *      ↓
 *   web-designer
 *      ↓
 *   content-creator
 *      ↓
 *   editor-en-jefe  (Camino III auto-fires inside /api/agents/run)
 *
 * Inputs:
 *   - body.client_id (uuid · required · multi-path resolver picks it up)
 *   - body.scrape_summary (string · optional · pulled from clients.brand_voice
 *     OR caller-provided · default empty string is fine for testability)
 *   - body.caller (string · audit attribution)
 *
 * Reads cliente brand assets from `clients` row · (logo_url, brand_colors,
 * brand_fonts) feed creative-director as MANDATORY context.
 *
 * Persists outputs to Supabase Storage `client-websites/<slug>/`:
 *   - cascade-summary.json
 *   - agents-outputs/<slug>.json (per agent)
 *
 * Returns CascadeRunResult with paths + per-agent costs + verdict.
 */
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { checkInternalKey } from "@/lib/internal-auth"
import { resolveClientIdFromBody } from "@/lib/client-id-resolver"
import { runCascade } from "@/lib/cascade-runner"
import type {
  CascadeBrandAssets,
  CascadeRunRequest,
} from "@/lib/cascade-types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min · cascade ~120-180s typical

const STORAGE_BUCKET = "client-websites"

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const clientId = resolveClientIdFromBody(body)
  if (!clientId) {
    return NextResponse.json(
      { error: "missing_field", field: "client_id" },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()

  // 1. Load cliente row · slug + name + brand assets
  const { data: cliente, error: clienteErr } = await supabase
    .from("clients")
    .select("id, slug, name, logo_url, brand_colors, brand_fonts")
    .eq("id", clientId)
    .maybeSingle()

  if (clienteErr || !cliente) {
    return NextResponse.json(
      {
        error: "client_not_found",
        client_id: clientId,
        detail: clienteErr?.message ?? "no row",
      },
      { status: 404 },
    )
  }

  const brandAssets: CascadeBrandAssets = {
    logo_url: (cliente.logo_url as string | null) ?? null,
    brand_colors: (cliente.brand_colors as unknown[] | null) ?? null,
    brand_fonts: (cliente.brand_fonts as string[] | null) ?? null,
  }

  const scrapeSummary =
    typeof body.scrape_summary === "string" && body.scrape_summary.length > 0
      ? body.scrape_summary
      : `(no scrape provided · agent runs with cliente brief only)`

  // 2. Run cascade
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${request.headers.get("host") ?? "localhost:3000"}`
  const internalApiKey = process.env.INTERNAL_API_KEY ?? ""

  const cascadeReq: CascadeRunRequest = {
    client_id: clientId,
    client_slug: cliente.slug as string,
    client_name: cliente.name as string,
    scrape_summary: scrapeSummary,
    brand_assets: brandAssets,
    caller: typeof body.caller === "string" ? body.caller : "cascade-onboard",
  }

  const result = await runCascade(cascadeReq, { baseUrl, internalApiKey })

  // 3. Persist outputs to Storage
  const slug = cliente.slug as string
  const uploads: Array<{ path: string; ok: boolean; error?: string }> = []

  // 3a · per-agent JSON
  for (const a of result.agents) {
    const path = `${slug}/agents-outputs/${a.slug}.json`
    const up = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, JSON.stringify(a, null, 2), {
        contentType: "application/json",
        upsert: true,
      })
    uploads.push({
      path,
      ok: !up.error,
      error: up.error?.message,
    })
  }

  // 3b · cascade summary (full result)
  const summaryPath = `${slug}/cascade-summary.json`
  const summaryUpload = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(summaryPath, JSON.stringify(result, null, 2), {
      contentType: "application/json",
      upsert: true,
    })
  uploads.push({
    path: summaryPath,
    ok: !summaryUpload.error,
    error: summaryUpload.error?.message,
  })

  const editorRun = result.agents.find((a) => a.slug === "editor-en-jefe")
  const verdict =
    editorRun?.parsed && typeof editorRun.parsed.verdict === "string"
      ? (editorRun.parsed.verdict as string)
      : "unknown"

  return NextResponse.json({
    ok: result.ok,
    client_id: clientId,
    client_slug: slug,
    cascade_started_at: result.cascade_started_at,
    cascade_completed_at: result.cascade_completed_at,
    total_cost_usd: result.total_cost_usd,
    verdict,
    agents: result.agents.map((a) => ({
      slug: a.slug,
      status: a.status,
      cost_usd: a.cost_usd,
      duration_ms: a.duration_ms,
      session_id: a.session_id,
      error: a.error ?? null,
    })),
    storage: {
      bucket: STORAGE_BUCKET,
      uploads,
    },
    brand_assets_used: brandAssets,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cascade/onboard",
    method: "POST",
    runtime: "nodejs",
    description:
      "Sequential 6-agent onboarding cascade · brand → research → creative → web → content → editor. Each agent receives prior agents' parsed outputs as context. Reads cliente brand assets (Gap 1) from `clients` row · creative-director MUST respect uploaded logo/colors/fonts.",
    body_shape: {
      client_id: "string (required · multi-path resolver)",
      scrape_summary: "string (optional · default empty)",
      caller: "string (optional · audit attribution)",
    },
  })
}
