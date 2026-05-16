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

/**
 * DEPRECATION NOTICE · CC#2 Path D · 2026-05-16
 *
 * This route is DEPRECATED in favour of the n8n workflow
 * `Zero Risk — Cliente Nuevo · Landing Cascade Master` (file
 * `n8n-workflows/tier-1/cliente-nuevo-landing-cascade-master.json` ·
 * webhook `POST /webhook/zero-risk/cliente-nuevo-landing`).
 *
 * Rationale · multi-agent cascades exceed Vercel's 300s function
 * timeout when Camino III voting fanout is included · the Náufrago v1
 * production fire on 2026-05-16 (15:19Z) was killed mid-cascade and
 * outputs never persisted to Storage despite ~$0.84 Anthropic spend.
 * The architectural decision (canonized in CLAUDE.md governance
 * section `multi-agent cascades viven en n8n workflows`) moves the
 * orchestration loop to n8n on Railway (no Vercel function timeout)
 * and reserves Vercel routes for single-purpose I/O endpoints (e.g.
 * `/api/cascade/persist-outputs` for Storage I/O only).
 *
 * Migration grace window · this route remains functional for one
 * sprint (until 2026-05-23) for backwards-compatibility · callers
 * MUST migrate to the n8n webhook by then. Existing callers will see
 * an `X-Deprecated` response header on every invocation. Removal
 * commit will land in the next sprint cycle.
 *
 * Vault doc · zr-vault/wiki/decisions/2026-05-16-cascade-migration-vercel-to-n8n.md
 */
const DEPRECATION_SUNSET = "2026-05-23T00:00:00Z"
const DEPRECATION_SUCCESSOR = "POST {N8N_BASE_URL}/webhook/zero-risk/cliente-nuevo-landing"

function addDeprecationHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Deprecated", "true")
  res.headers.set("X-Deprecation-Sunset", DEPRECATION_SUNSET)
  res.headers.set("X-Deprecation-Successor", DEPRECATION_SUCCESSOR)
  res.headers.set(
    "X-Deprecation-Reason",
    "Vercel 5-min function timeout incompatible with multi-agent cascade + Camino III voting fanout · see CLAUDE.md governance · multi-agent cascades viven en n8n workflows",
  )
  return res
}

export async function POST(request: Request) {
  console.warn(
    "[cascade/onboard] DEPRECATED · caller should migrate to n8n webhook POST /webhook/zero-risk/cliente-nuevo-landing · sunset",
    DEPRECATION_SUNSET,
    "· request from",
    request.headers.get("x-forwarded-for") || request.headers.get("user-agent") || "unknown",
  )

  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return addDeprecationHeaders(
      NextResponse.json(
        { error: "unauthorized", detail: auth.reason },
        { status: 401 },
      ),
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return addDeprecationHeaders(NextResponse.json({ error: "invalid_json" }, { status: 400 }))
  }

  const clientId = resolveClientIdFromBody(body)
  if (!clientId) {
    return addDeprecationHeaders(
      NextResponse.json(
        { error: "missing_field", field: "client_id" },
        { status: 400 },
      ),
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
    return addDeprecationHeaders(
      NextResponse.json(
        {
          error: "client_not_found",
          client_id: clientId,
          detail: clienteErr?.message ?? "no row",
        },
        { status: 404 },
      ),
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

  return addDeprecationHeaders(
    NextResponse.json({
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
      __deprecated: {
        notice: "This route is deprecated · migrate to n8n webhook POST /webhook/zero-risk/cliente-nuevo-landing",
        sunset: DEPRECATION_SUNSET,
        successor: DEPRECATION_SUCCESSOR,
      },
    }),
  )
}

export async function GET() {
  return addDeprecationHeaders(NextResponse.json({
    endpoint: "/api/cascade/onboard",
    method: "POST",
    runtime: "nodejs",
    deprecated: true,
    sunset: DEPRECATION_SUNSET,
    successor: DEPRECATION_SUCCESSOR,
    deprecation_reason:
      "Vercel 5-min function timeout incompatible with multi-agent cascade + Camino III voting fanout · multi-agent cascades canon migrated to n8n workflows (Capa 2) · see CLAUDE.md governance section + zr-vault/wiki/decisions/2026-05-16-cascade-migration-vercel-to-n8n.md",
    description:
      "[DEPRECATED] Sequential 6-agent onboarding cascade · brand → research → creative → web → content → editor. Each agent receives prior agents' parsed outputs as context. Reads cliente brand assets (Gap 1) from `clients` row · creative-director MUST respect uploaded logo/colors/fonts.",
    body_shape: {
      client_id: "string (required · multi-path resolver)",
      scrape_summary: "string (optional · default empty)",
      caller: "string (optional · audit attribution)",
    },
  }))
}
