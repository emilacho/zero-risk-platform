/**
 * POST /api/community-health/upsert — Community Health Daily write-path.
 *
 * Closes W15-D-08. Workflow caller:
 *   `Zero Risk — Community Health Daily (Daily 8am)`
 *
 * Idempotent on (client_id, snapshot_date, platform): same day re-runs
 * overwrite the row instead of duplicating. Graceful 200 fallback if the
 * table is missing so the cron stays alive during schema drift.
 *
 * Auth: tier 2 INTERNAL.
 * Validation: Ajv schema `community-health-upsert`.
 * Persistence: `community_health_snapshots` table (unique idx on the triple).
 *
 * Response (200):
 *   { ok: true, persisted_id: string | null, inserted: boolean, fallback_mode?: true }
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface CommunityHealthBody {
  client_id: string
  snapshot_date: string
  platform?: string | null
  health_score?: number | null
  active_members_24h?: number | null
  new_members_24h?: number | null
  posts_24h?: number | null
  engagement_rate_24h?: number | null
  sentiment_score?: number | null
  alerts?: string[] | null
  notes?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<CommunityHealthBody>(request, 'community-health-upsert')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    snapshot_date: body.snapshot_date,
    platform: body.platform ?? 'all',
    health_score: body.health_score ?? null,
    active_members_24h: body.active_members_24h ?? null,
    new_members_24h: body.new_members_24h ?? null,
    posts_24h: body.posts_24h ?? null,
    engagement_rate_24h: body.engagement_rate_24h ?? null,
    sentiment_score: body.sentiment_score ?? null,
    alerts: body.alerts ?? [],
    notes: body.notes ?? null,
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('community_health_snapshots')
      .upsert(row, { onConflict: 'client_id,snapshot_date,platform' })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({
        ok: true,
        fallback_mode: true,
        persisted_id: null,
        inserted: false,
        note: `DB write failed gracefully: ${error.message.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, persisted_id: data?.id, inserted: true })
  } catch (err) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      persisted_id: null,
      inserted: false,
      note: `DB exception swallowed: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    })
  }
}
