/**
 * GET /api/social-queue — list social posts queued for multi-platform publish.
 *
 * Closes W15-D-26. Workflow caller:
 *   `Zero Risk - Social Multi-Platform Publisher v2`
 *
 * Returns queued items filtered by status (default `pending`) up to `limit`
 * (default 5, max 50). Reads `social_queue` table; returns empty list +
 * fallback_mode if the table is missing so the publisher cron doesn't loop.
 *
 * Auth: tier 2 INTERNAL.
 * Persistence: read-only over `social_queue`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface QueueRow {
  id: string
  client_id: string | null
  platform: string | null
  content: string | null
  media_url: string | null
  scheduled_for: string | null
  status: string | null
  created_at: string | null
}

const ALLOWED_STATUS = new Set(['pending', 'scheduled', 'published', 'failed', 'cancelled'])

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const u = new URL(request.url)
  const status = u.searchParams.get('status') || 'pending'
  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json(
      { error: 'invalid_status', code: 'E-INPUT-INVALID', detail: `status must be one of ${Array.from(ALLOWED_STATUS).join(',')}` },
      { status: 400 },
    )
  }
  const rawLimit = parseInt(u.searchParams.get('limit') || '5', 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 5
  const platform = u.searchParams.get('platform') || undefined
  const clientId = u.searchParams.get('client_id') || undefined

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<QueueRow[]>(
    () => {
      let q = supabase
        .from('social_queue')
        .select('id,client_id,platform,content,media_url,scheduled_for,status,created_at')
        .eq('status', status)
        .order('scheduled_for', { ascending: true, nullsFirst: false })
        .limit(limit)
      if (platform) q = q.eq('platform', platform)
      if (clientId) q = q.eq('client_id', clientId)
      return q
    },
    { context: '/api/social-queue' },
  )

  if (r.fallback_mode) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      status,
      limit,
      count: 0,
      items: [],
      note: r.reason ?? 'social_queue read failed · empty list served',
    })
  }

  const items = r.data ?? []
  return NextResponse.json({
    ok: true,
    status,
    limit,
    filters: { platform: platform ?? null, client_id: clientId ?? null },
    count: items.length,
    items,
  })
}
