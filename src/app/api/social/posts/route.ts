/**
 * GET /api/social/posts · Sprint 4 · list social posts.
 *
 * Auth · INTERNAL_API_KEY.
 *
 * Query params ·
 *   ?status=scheduled|publishing|published|failed
 *   ?network=facebook|instagram
 *   ?client_id=<slug>
 *   ?limit=N (default 50 · max 200)
 *
 * Returns · `{ ok: true, count, rows: [...], generated_at }`.
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { getSupabaseAdmin } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 15

const VALID_STATUS = new Set([
  "scheduled",
  "publishing",
  "published",
  "failed",
])
const VALID_NETWORKS = new Set(["facebook", "instagram"])

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const network = url.searchParams.get("network")
  const clientId = url.searchParams.get("client_id")
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
    200,
  )

  if (status && !VALID_STATUS.has(status)) {
    return NextResponse.json(
      { ok: false, error: "invalid status filter", code: "E-SOCIAL-FILTER" },
      { status: 400 },
    )
  }
  if (network && !VALID_NETWORKS.has(network)) {
    return NextResponse.json(
      { ok: false, error: "invalid network filter", code: "E-SOCIAL-FILTER" },
      { status: 400 },
    )
  }

  try {
    const supa = getSupabaseAdmin()
    let query = supa
      .from("social_posts")
      .select(
        "id, network, content, media_urls, scheduled_at, published_at, provider_post_id, status, error_detail, client_id, caller, created_by, created_at",
      )
      .order("scheduled_at", { ascending: false })
      .limit(limit)

    if (status) query = query.eq("status", status)
    if (network) query = query.eq("network", network)
    if (clientId) query = query.eq("client_id", clientId)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_query_failed", detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      count: data?.length ?? 0,
      rows: data ?? [],
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: msg.slice(0, 500) },
      { status: 500 },
    )
  }
}
