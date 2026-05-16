/**
 * POST /api/cascade/social-content
 *
 * Invokes the `carousel-designer` agent to produce a slide-by-slide
 * storyboard per requested platform · then persists the storyboard
 * JSON to Supabase Storage at
 *   client-websites/{client_slug}/social/{date}/storyboard.json
 *
 * This is the "social" sibling of `cascade-runner.ts` which drives the
 * website cascade. Social content has a fundamentally different output
 * shape (multi-platform carousels rather than a single site) so it gets
 * its own runner + route.
 *
 * Downstream · the host (or a follow-up dispatch) chains this output
 * into `POST /api/carousel/generate` (carousel-engine PR #36) to render
 * PNGs.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  SOCIAL_PLATFORMS,
  runSocialContent,
  type SocialContentRequest,
  type SocialPlatform,
} from '@/lib/social-content-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STORAGE_BUCKET = 'client-websites'

function validateBody(raw: unknown):
  | { ok: true; data: SocialContentRequest }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be an object' }
  const r = raw as Record<string, unknown>

  const slug = typeof r.client_slug === 'string' ? r.client_slug.trim() : ''
  if (!slug) return { ok: false, error: 'client_slug required' }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    return { ok: false, error: 'client_slug must match /^[a-z0-9][a-z0-9_-]{0,63}$/i' }
  }

  if (typeof r.client_id !== 'string' || !r.client_id.trim()) {
    return { ok: false, error: 'client_id required' }
  }
  if (typeof r.client_name !== 'string' || !r.client_name.trim()) {
    return { ok: false, error: 'client_name required' }
  }
  if (typeof r.brief !== 'string' || !r.brief.trim()) {
    return { ok: false, error: 'brief required (plain text)' }
  }

  if (!Array.isArray(r.platforms_requested) || r.platforms_requested.length === 0) {
    return { ok: false, error: 'platforms_requested must be a non-empty array' }
  }
  for (const p of r.platforms_requested) {
    if (!SOCIAL_PLATFORMS.includes(p as SocialPlatform)) {
      return { ok: false, error: `platforms_requested has invalid platform: ${String(p)}` }
    }
  }

  if (!r.context || typeof r.context !== 'object') {
    return { ok: false, error: 'context required (object with brand_book, visual_direction, copy)' }
  }
  const ctx = r.context as Record<string, unknown>
  for (const k of ['brand_book', 'visual_direction', 'copy']) {
    if (!ctx[k] || typeof ctx[k] !== 'object') {
      return { ok: false, error: `context.${k} required (object)` }
    }
  }

  if (r.campaign_intent !== undefined && typeof r.campaign_intent !== 'string') {
    return { ok: false, error: 'campaign_intent must be a string' }
  }

  return { ok: true, data: r as unknown as SocialContentRequest }
}

function baseUrl(request: Request): string {
  // Prefer the same host as the inbound request so internal calls land
  // on the same Vercel deployment as the route handler.
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const v = validateBody(raw)
  if (!v.ok) return NextResponse.json({ error: 'validation_failed', detail: v.error }, { status: 400 })
  const req = v.data

  const internalApiKey = process.env.INTERNAL_API_KEY
  if (!internalApiKey) {
    return NextResponse.json({ error: 'server_misconfigured', detail: 'INTERNAL_API_KEY missing' }, { status: 500 })
  }

  const result = await runSocialContent(req, {
    baseUrl: baseUrl(request),
    internalApiKey,
  })

  // Persist the storyboard + video-specs JSONs to storage if we got
  // something useful. Failures here are non-fatal · both artifacts are
  // returned in the response body so the host can retry the upload
  // itself. Each artifact is uploaded independently · partial-success
  // is tracked per-artifact.
  let storyboardStatus: { uploaded: boolean; error?: string } = { uploaded: false }
  let videoSpecsStatus: { uploaded: boolean; error?: string } = { uploaded: false }

  async function uploadJson(
    path: string,
    payload: unknown,
  ): Promise<{ uploaded: boolean; error?: string }> {
    try {
      const supabase = getSupabaseAdmin()
      const buf = Buffer.from(JSON.stringify(payload, null, 2))
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, buf, {
          contentType: 'application/json; charset=utf-8',
          upsert: true,
          cacheControl: '300',
        })
      if (upErr) return { uploaded: false, error: upErr.message }
      return { uploaded: true }
    } catch (err) {
      return { uploaded: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (result.storyboard) {
    storyboardStatus = await uploadJson(result.storage_path, result.storyboard)
  }
  if (result.video_specs) {
    videoSpecsStatus = await uploadJson(result.video_storage_path, result.video_specs)
  }

  return NextResponse.json(
    {
      ok: result.ok,
      client_id: result.client_id,
      client_slug: result.client_slug,
      platforms_requested: result.platforms_requested,
      platforms_produced: result.platforms_produced,
      video_platforms_produced: result.video_platforms_produced,
      storyboard: result.storyboard,
      video_specs: result.video_specs,
      storage_path: result.storage_path,
      video_storage_path: result.video_storage_path,
      storage_status: storyboardStatus,
      video_storage_status: videoSpecsStatus,
      cost_usd: result.cost_usd,
      carousel_cost_usd: result.carousel_cost_usd,
      video_cost_usd: result.video_cost_usd,
      duration_ms: result.duration_ms,
      model: result.carousel_model,
      video_model: result.video_model,
      session_id: result.carousel_session_id,
      video_session_id: result.video_session_id,
      carousel_error: result.carousel_error,
      video_error: result.video_error,
      error: result.error,
    },
    { status: result.ok ? 200 : 502 },
  )
}
