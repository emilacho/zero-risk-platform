/**
 * SEO — Content Refresh Enqueue (internal)
 *
 * Used by GEO Content Freshness workflow (cluster 3, runs every 2 weeks) to
 * queue stale AI-referenceable content for refresh. When GEO agent identifies
 * pages that lost AI citations or are approaching decay threshold, they get
 * queued here for Content Creator to pick up.
 *
 * POST body:
 *   {
 *     client_id: string,
 *     url: string,
 *     page_id?: string,
 *     reason: "geo-freshness" | "decay-risk" | "ranking-drop" | "citation-loss" | "manual",
 *     citation_count?: number,
 *     ai_platforms_cited?: Array<{ platform: "chatgpt"|"perplexity"|"google_aio"|"gemini", cited: boolean }>,
 *     recommendations?: object,
 *     priority?: "low" | "medium" | "high"
 *   }
 *
 * Batch mode (multiple pages at once):
 *   { client_id, items: Array<{ url, reason, ... }> }
 *
 * Returns: { ok, queued_count, ids }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_REASONS = new Set([
  'geo-freshness', 'decay-risk', 'ranking-drop', 'citation-loss', 'manual',
])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])

function normalizeItem(body: Record<string, unknown>, clientId: string): Record<string, unknown> | null {
  const url = body.url
  if (!url || typeof url !== 'string') return null

  const reason = VALID_REASONS.has(body.reason as string) ? body.reason : 'manual'
  const priority = VALID_PRIORITIES.has(body.priority as string) ? body.priority : 'medium'

  return {
    client_id: clientId,
    page_id: body.page_id || null,
    url,
    reason,
    citation_count: typeof body.citation_count === 'number' ? body.citation_count : null,
    ai_platforms_cited: Array.isArray(body.ai_platforms_cited) ? body.ai_platforms_cited : [],
    recommendations: body.recommendations || {},
    priority,
    status: 'queued' as const,
  }
}

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const _raw = await request.json().catch(() => null)
  if (!_raw) return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body || !body.client_id) {
    return NextResponse.json({ error: 'missing client_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Batch mode: items array
  if (Array.isArray(body.items)) {
    const rows = body.items
      .map((it: Record<string, unknown>) => normalizeItem(it, body.client_id))
      .filter(Boolean) as Record<string, unknown>[]

    if (rows.length === 0) {
      return NextResponse.json({ error: 'no_valid_items' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('content_refresh_queue')
      .insert(rows)
      .select('id, url, reason, priority')

    if (error) {
      return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      queued_count: data?.length || 0,
      ids: (data || []).map((d: { id: string }) => d.id),
      items: data,
    })
  }

  // Single-item mode
  const row = normalizeItem(body, body.client_id)
  if (!row) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['client_id', 'url', 'reason'] },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('content_refresh_queue')
    .insert(row)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    queued_count: 1,
    ids: [data.id],
    item: data,
  })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const client_id = request.nextUrl.searchParams.get('client_id')
  const status = request.nextUrl.searchParams.get('status') || 'queued'
  const priority = request.nextUrl.searchParams.get('priority')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200)

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('content_refresh_queue')
    .select('*')
    .order('priority', { ascending: false })
    .order('queued_at', { ascending: true })
    .limit(limit)

  if (client_id) query = query.eq('client_id', client_id)
  if (status !== 'all') query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })

  return NextResponse.json({ items: data || [], count: (data || []).length })
}
