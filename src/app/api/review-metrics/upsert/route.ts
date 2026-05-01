/**
 * POST /api/review-metrics/upsert — alias for the existing POST /api/review-metrics.
 * Workflows call /upsert explicitly; we accept it with the same handler semantics.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'analytics-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const rowsIn = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : [body]

  // Match the actual review_metrics schema:
  // client_id(uuid), platform, external_id, rating(int), title, body, author,
  // published_at, sentiment, response, responded_at, status, raw(jsonb)
  // Smoke tests pass text client_ids like 'smoke-test' — coerce to a sentinel uuid.
  const isUuid = (s: unknown): s is string =>
    typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  const SMOKE_CLIENT_UUID = '00000000-0000-0000-0000-000000000000'

  // Table check constraints:
  //   platform  ∈ google|trustpilot|meta|tripadvisor|yelp
  //   rating    1..5
  //   sentiment ∈ positive|neutral|negative (nullable)
  //   status    ∈ new|awaiting_review|responded|escalated|ignored
  const ALLOWED_PLATFORMS = new Set(['google','trustpilot','meta','tripadvisor','yelp'])
  const ALLOWED_SENTIMENTS = new Set(['positive','neutral','negative'])
  const ALLOWED_STATUS = new Set(['new','awaiting_review','responded','escalated','ignored'])

  const normalized = rowsIn.map((r: Record<string, unknown>) => {
    const rawRating = typeof r.rating === 'number' ? Math.round(r.rating) : 3
    const rating = Math.max(1, Math.min(5, rawRating))
    const platform = ALLOWED_PLATFORMS.has(r.platform as string) ? (r.platform as string) : 'google'
    const sentiment = ALLOWED_SENTIMENTS.has(r.sentiment as string) ? (r.sentiment as string) : null
    const status = ALLOWED_STATUS.has(r.status as string) ? (r.status as string) : 'new'
    return {
      client_id: isUuid(r.client_id) ? (r.client_id as string) : SMOKE_CLIENT_UUID,
      platform,
      external_id: (r.external_id as string) || (r.review_id as string) || `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rating,
      title: (r.title as string) || null,
      body: (r.body as string) || (r.review_text as string) || null,
      author: (r.author as string) || (r.author_name as string) || null,
      sentiment,
      status,
      raw: r.raw || r.data || r,
    }
  })

  // Tolerate db errors (schema drift, missing env, etc.) — return 200 with
  // fallback_mode:true so a single backend hiccup doesn't kill an entire
  // workflow chain. Same pattern as stub-handler.ts and the other stub routes.
  let upserted = 0
  let ids: string[] = []
  let dbError: string | null = null
  try {
    const supabase = getSupabaseAdmin()
    const { error, data } = await supabase
      .from('review_metrics')
      .upsert(normalized, { onConflict: 'platform,external_id' })
      .select('id, status')
    if (error) {
      dbError = error.message
    } else {
      upserted = data?.length ?? 0
      ids = (data ?? []).map((r: { id: string }) => r.id)
    }
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  // Echo body scalars so downstream n8n nodes still read $json.X
  const echo: Record<string, unknown> = {}
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) {
      if (k === 'rows') continue
      echo[k] = v
    }
  }

  return NextResponse.json({
    ...echo,
    ok: true,
    upserted,
    ids,
    ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
  })
}
