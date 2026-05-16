/**
 * POST /api/carousel/generate
 *
 * Renders N carousel slides via @zero-risk/carousel-engine (satori → SVG →
 * resvg → PNG), uploads each PNG to Supabase Storage under
 *   `client-websites/{client_slug}/carousels/{date}/slide-{n}.png`,
 * and returns the public URLs.
 *
 * Auth · standard `x-api-key: <INTERNAL_API_KEY>` (same as the rest of the
 * agent-runner routes). Open the route to anonymous traffic at your own risk:
 * each invocation triggers a Vercel function + Supabase Storage write per
 * slide.
 */
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  PLATFORM_SPECS,
  renderCarousel,
  type CarouselGenerateRequest,
  type CarouselGenerateResponse,
  type CarouselPlatform,
} from '../../../../../packages/carousel-engine/src'

// Force Node runtime · @resvg/resvg-js is a native binary not compatible
// with Edge. Also the Vercel default Node runtime gives us a longer
// timeout, which we need for parallel font fetch + N renders.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STORAGE_BUCKET = 'client-websites'
const VALID_PLATFORMS: CarouselPlatform[] = [
  'instagram-feed',
  'instagram-reel',
  'tiktok',
  'facebook-feed',
  'twitter-card',
]

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function deriveCarouselId(req: CarouselGenerateRequest): string {
  const hash = crypto
    .createHash('sha1')
    .update(req.client_slug)
    .update(req.platform)
    .update(req.date ?? todayUtcDate())
    .update(JSON.stringify(req.slides))
    .digest('hex')
    .slice(0, 12)
  return `cars-${req.client_slug}-${hash}`
}

function validateRequest(raw: unknown): { ok: true; data: CarouselGenerateRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be an object' }
  const r = raw as Record<string, unknown>

  const slug = typeof r.client_slug === 'string' ? r.client_slug.trim() : ''
  if (!slug) return { ok: false, error: 'client_slug is required (string)' }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    return { ok: false, error: 'client_slug must match /^[a-z0-9][a-z0-9_-]{0,63}$/i' }
  }

  const platform = r.platform as string
  if (!VALID_PLATFORMS.includes(platform as CarouselPlatform)) {
    return { ok: false, error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }
  }

  if (!r.brand || typeof r.brand !== 'object') return { ok: false, error: 'brand is required (object)' }
  const brand = r.brand as Record<string, unknown>
  if (!brand.colors || typeof brand.colors !== 'object') return { ok: false, error: 'brand.colors required' }
  if (typeof (brand.colors as Record<string, unknown>).primary !== 'string') {
    return { ok: false, error: 'brand.colors.primary required (string)' }
  }
  if (!brand.fonts || typeof brand.fonts !== 'object') return { ok: false, error: 'brand.fonts required' }
  if (typeof (brand.fonts as Record<string, unknown>).family !== 'string') {
    return { ok: false, error: 'brand.fonts.family required (string)' }
  }

  if (!Array.isArray(r.slides) || r.slides.length === 0) {
    return { ok: false, error: 'slides must be a non-empty array' }
  }
  if (r.slides.length > 20) return { ok: false, error: 'slides max length is 20' }
  for (const [i, s] of (r.slides as unknown[]).entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `slides[${i}] must be an object` }
    const slide = s as Record<string, unknown>
    if (typeof slide.headline !== 'string' || !slide.headline.trim()) {
      return { ok: false, error: `slides[${i}].headline required (non-empty string)` }
    }
  }

  if (r.date !== undefined && typeof r.date !== 'string') {
    return { ok: false, error: 'date must be a string (YYYY-MM-DD)' }
  }
  if (r.carousel_id !== undefined && typeof r.carousel_id !== 'string') {
    return { ok: false, error: 'carousel_id must be a string' }
  }

  return { ok: true, data: r as unknown as CarouselGenerateRequest }
}

export async function POST(request: Request) {
  // ── Auth ───────────────────────────────────────────────────────────
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }

  // ── Body parse + validate ─────────────────────────────────────────
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const v = validateRequest(raw)
  if (!v.ok) return NextResponse.json({ error: 'validation_failed', detail: v.error }, { status: 400 })
  const req = v.data

  const date = req.date ?? todayUtcDate()
  const carouselId = req.carousel_id ?? deriveCarouselId(req)
  const spec = PLATFORM_SPECS[req.platform]

  // ── Render N slides in parallel ───────────────────────────────────
  let rendered
  try {
    rendered = await renderCarousel({
      platform: req.platform,
      brand: req.brand,
      slides: req.slides,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'render_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  // ── Upload each PNG to Supabase Storage ───────────────────────────
  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: 'storage_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  const slideUrls: string[] = []
  const timingsMs: number[] = []

  for (const slide of rendered) {
    const path = `${req.client_slug}/carousels/${date}/slide-${slide.slide_index}.png`
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, slide.png, {
        contentType: 'image/png',
        upsert: true,
        cacheControl: '3600',
      })
    if (upErr) {
      return NextResponse.json(
        {
          error: 'storage_upload_failed',
          detail: upErr.message,
          path,
          partial_results: { uploaded: slideUrls, pending: rendered.length - slideUrls.length },
        },
        { status: 502 },
      )
    }
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    slideUrls.push(pub.publicUrl)
    timingsMs.push(slide.durationMs)
  }

  const response: CarouselGenerateResponse = {
    carousel_id: carouselId,
    platform: req.platform,
    width: spec.width,
    height: spec.height,
    slide_urls: slideUrls,
    thumbnail_url: slideUrls[0],
    timings_ms: timingsMs,
  }
  return NextResponse.json(response, { status: 200 })
}
