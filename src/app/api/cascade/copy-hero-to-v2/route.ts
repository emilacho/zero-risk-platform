/**
 * POST /api/cascade/copy-hero-to-v2
 *
 * Storage-only helper for the n8n Cliente Nuevo · Landing Cascade Master
 * workflow. The cascade calls `/api/images/generate` to produce a hero
 * image (lands at `agent-images/system/<uuid>.png` by default), then the
 * workflow posts here with the source URL + target slug/version so the
 * image gets persisted into the client-facing landing bundle at
 * `client-websites/<slug>/<version>/hero.png`.
 *
 * Why a dedicated route (not inline n8n): downloading binary from one
 * Supabase Storage bucket and re-uploading to another is awkward in
 * n8n's HTTP node (no binary passthrough between unrelated buckets
 * without a Code node), and the bytes never leave the Vercel→Supabase
 * boundary this way.
 *
 * Auth · `x-api-key INTERNAL_API_KEY`.
 *
 * Body shape:
 *   {
 *     slug: string,
 *     version?: string,         // default 'v2'
 *     source_image_url: string  // from /api/images/generate response
 *   }
 *
 * Returns:
 *   { ok, bucket, path, bytes }
 *
 * Failure modes (graceful · workflow uses continueOnFail):
 *   - 400 missing slug or source_image_url
 *   - 502 source fetch failed
 *   - 502 storage upload failed
 *   - 503 (not used · service-role REST never throws missing-key)
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const STORAGE_BUCKET = 'client-websites'

interface CopyBody {
  slug?: string
  version?: string
  source_image_url?: string
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: CopyBody
  try {
    body = (await request.json()) as CopyBody
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const version = (typeof body.version === 'string' && body.version.trim()) || 'v2'
  const sourceUrl = typeof body.source_image_url === 'string' ? body.source_image_url.trim() : ''

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: 'slug required', code: 'E-COPY-HERO-SLUG' },
      { status: 400 },
    )
  }
  if (!sourceUrl) {
    return NextResponse.json(
      { ok: false, error: 'source_image_url required', code: 'E-COPY-HERO-SRC' },
      { status: 400 },
    )
  }

  // 1 · download source bytes
  let bytes: ArrayBuffer
  let contentType = 'image/png'
  try {
    const res = await fetch(sourceUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'source_fetch_failed',
          upstream_status: res.status,
          source_image_url: sourceUrl,
        },
        { status: 502 },
      )
    }
    bytes = await res.arrayBuffer()
    contentType = res.headers.get('content-type') || 'image/png'
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'source_fetch_exception',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  // 2 · upload to client-websites/<slug>/<version>/hero.png
  const path = `${slug}/${version}/hero.png`
  const supabase = getSupabaseAdmin()
  const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  })
  if (up.error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'storage_upload_failed',
        detail: up.error.message,
        path,
      },
      { status: 502 },
    )
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`

  return NextResponse.json({
    ok: true,
    bucket: STORAGE_BUCKET,
    path,
    public_url: publicUrl,
    bytes: bytes.byteLength,
    content_type: contentType,
    source_image_url: sourceUrl,
    timestamp: new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cascade/copy-hero-to-v2',
    method: 'POST',
    purpose:
      'Copy hero image from /api/images/generate output URL to client-websites/<slug>/<version>/hero.png · serves the n8n Cliente Nuevo · Landing Cascade Master workflow',
    body_shape: {
      slug: 'string (required)',
      version: 'string (optional · default v2)',
      source_image_url: 'string (required · from /api/images/generate response.image_url)',
    },
  })
}
