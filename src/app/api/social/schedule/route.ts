/**
 * POST /api/social/schedule · Sprint 4 · Camino B social planner.
 *
 * Schedules a post for IG OR FB · n8n workflow cron 5min picks it up
 * and publishes via Meta Graph v21. Caller passes content + media_urls
 * + scheduled_at · NO immediate publish · row lands en `social_posts`
 * con status='scheduled'.
 *
 * Auth · INTERNAL_API_KEY.
 *
 * Body ·
 *   {
 *     network: "facebook" | "instagram",
 *     content: "post body text",
 *     media_urls: ["https://..."] (max 10),
 *     scheduled_at: ISO timestamp (must be future · max 30 days),
 *     client_id?: "naufrago",
 *     caller?: "n8n-content-cascade",
 *     created_by?: "agent:carousel-designer"
 *   }
 *
 * Returns ·
 *   200 · { ok: true, id, network, scheduled_at, status }
 *   401 · auth fails
 *   400 · invalid input (network · scheduled_at past · scheduled_at > 30d future · content empty · media_urls > 10)
 *   500 · DB insert error
 */
import { NextResponse } from "next/server"
import { checkInternalKey } from "@/lib/internal-auth"
import { getSupabaseAdmin } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 15

const VALID_NETWORKS = new Set(["facebook", "instagram"])
const MAX_MEDIA_URLS = 10
const MAX_FUTURE_DAYS = 30

type ScheduleBody = {
  network?: string
  content?: string
  media_urls?: string[]
  scheduled_at?: string
  client_id?: string
  caller?: string
  created_by?: string
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: auth.reason },
      { status: 401 },
    )
  }

  let body: ScheduleBody
  try {
    body = (await request.json()) as ScheduleBody
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", code: "E-SOCIAL-JSON" },
      { status: 400 },
    )
  }

  if (!body.network || !VALID_NETWORKS.has(body.network)) {
    return NextResponse.json(
      {
        ok: false,
        error: "network must be 'facebook' or 'instagram'",
        code: "E-SOCIAL-NETWORK",
      },
      { status: 400 },
    )
  }
  if (!body.content || body.content.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "content required", code: "E-SOCIAL-CONTENT" },
      { status: 400 },
    )
  }
  if (!body.scheduled_at) {
    return NextResponse.json(
      {
        ok: false,
        error: "scheduled_at ISO timestamp required",
        code: "E-SOCIAL-SCHEDULE",
      },
      { status: 400 },
    )
  }

  const when = new Date(body.scheduled_at)
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json(
      {
        ok: false,
        error: "scheduled_at must be valid ISO timestamp",
        code: "E-SOCIAL-SCHEDULE-PARSE",
      },
      { status: 400 },
    )
  }
  const now = Date.now()
  if (when.getTime() < now - 5 * 60_000) {
    return NextResponse.json(
      {
        ok: false,
        error: "scheduled_at must be in the future (or within last 5min for cron slack)",
        code: "E-SOCIAL-SCHEDULE-PAST",
      },
      { status: 400 },
    )
  }
  const capMs = now + MAX_FUTURE_DAYS * 24 * 3600 * 1000
  if (when.getTime() > capMs) {
    return NextResponse.json(
      {
        ok: false,
        error: `scheduled_at exceeds ${MAX_FUTURE_DAYS} day cap`,
        code: "E-SOCIAL-SCHEDULE-FAR",
      },
      { status: 400 },
    )
  }

  const mediaUrls = Array.isArray(body.media_urls) ? body.media_urls : []
  if (mediaUrls.length > MAX_MEDIA_URLS) {
    return NextResponse.json(
      {
        ok: false,
        error: `media_urls exceeds ${MAX_MEDIA_URLS} item cap`,
        code: "E-SOCIAL-MEDIA",
      },
      { status: 400 },
    )
  }

  try {
    const supa = getSupabaseAdmin()
    const { data, error } = await supa
      .from("social_posts")
      .insert({
        network: body.network,
        content: body.content,
        media_urls: mediaUrls,
        scheduled_at: when.toISOString(),
        client_id: body.client_id ?? null,
        caller: body.caller ?? "api",
        created_by: body.created_by ?? null,
        status: "scheduled",
      })
      .select("id, network, scheduled_at, status")
      .single()

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_insert_failed",
          detail: error?.message ?? "no row returned",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      network: data.network,
      scheduled_at: data.scheduled_at,
      status: data.status,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: msg.slice(0, 500) },
      { status: 500 },
    )
  }
}
