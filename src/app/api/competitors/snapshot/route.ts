/**
 * POST /api/competitors/snapshot · daily competitor snapshot persistence
 *
 * Sprint #6 Brazo 2 Path B · replaces the prior stub that wrote to a
 * non-existent `competitor_snapshots` table. Now writes to the real
 * time-series table created in migration 202605151430.
 *
 * Consumers · `Competitor Daily Monitor (6am)` n8n workflow (B2 · 14 nodes).
 * One snapshot per (client, competitor_name, day) · UPSERT on conflict so
 * a retry within the same UTC day overwrites the prior write instead of
 * duplicating.
 *
 * Body shape (n8n B2 `Persist Snapshot` node sends this):
 *   {
 *     client_id?: string,                  // optional · resolver fallback chain
 *     competitor_name: string,             // required
 *     competitor_website?: string,
 *     competitor_id?: string,              // optional FK to landscape · null OK
 *     meta_ads_data?: object,              // Apify FB Ads Library
 *     serper_news_data?: object,           // Serper /news
 *     firecrawl_landing_data?: object,     // Firecrawl /scrape
 *     has_changes?: boolean,
 *     change_summary?: string,
 *     snapshot_date?: string               // YYYY-MM-DD · defaults to today UTC
 *   }
 *
 * Returns · { ok, snapshot_id, action: 'inserted'|'updated', client_id }
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SnapshotInput {
  client_id?: string
  competitor_name?: string
  competitor_website?: string
  competitor_id?: string | null
  meta_ads_data?: Record<string, unknown>
  serper_news_data?: Record<string, unknown>
  firecrawl_landing_data?: Record<string, unknown>
  raw_payload?: Record<string, unknown>
  has_changes?: boolean
  change_summary?: string
  snapshot_date?: string
}

function isYyyyMmDd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: SnapshotInput
  try {
    body = (await request.json()) as SnapshotInput
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clientId = resolveClientIdFromBody(body)
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_field', field: 'client_id' },
      { status: 400 },
    )
  }

  const competitorName =
    typeof body.competitor_name === 'string' && body.competitor_name.trim()
      ? body.competitor_name.trim()
      : null
  if (!competitorName) {
    return NextResponse.json(
      { error: 'missing_field', field: 'competitor_name' },
      { status: 400 },
    )
  }

  const snapshotDate = isYyyyMmDd(body.snapshot_date)
    ? body.snapshot_date
    : new Date().toISOString().slice(0, 10)

  const row = {
    client_id: clientId,
    competitor_id: body.competitor_id ?? null,
    competitor_name: competitorName,
    competitor_website: body.competitor_website ?? null,
    snapshot_date: snapshotDate,
    meta_ads_data: body.meta_ads_data ?? {},
    serper_news_data: body.serper_news_data ?? {},
    firecrawl_landing_data: body.firecrawl_landing_data ?? {},
    raw_payload: body.raw_payload ?? body,
    has_changes: body.has_changes === true,
    change_summary: body.change_summary ?? null,
  }

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: 'supabase_unavailable',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }

  // UPSERT on (client_id, competitor_name, snapshot_date) so a retry within
  // the same day overwrites rather than duplicates. The unique index defined
  // in migration 202605151430 is the conflict target.
  const { data, error } = await supabase
    .from('competitor_snapshots')
    .upsert(row, {
      onConflict: 'client_id,competitor_name,snapshot_date',
    })
    .select('id, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json(
      {
        error: 'snapshot_persist_failed',
        detail: error?.message?.slice(0, 400) ?? 'unknown error',
        client_id: clientId,
        competitor_name: competitorName,
      },
      { status: 502 },
    )
  }

  // We can't tell from the upsert response whether the row was inserted or
  // updated · query age vs request time. Pre-existing rows have created_at
  // older than the request timestamp by more than a second.
  const action =
    Date.now() - new Date(data.created_at as string).getTime() < 2000
      ? 'inserted'
      : 'updated'

  return NextResponse.json({
    ok: true,
    snapshot_id: data.id,
    client_id: clientId,
    competitor_name: competitorName,
    snapshot_date: snapshotDate,
    action,
    created_at: data.created_at,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/competitors/snapshot',
    method: 'POST',
    runtime: 'nodejs',
    description:
      'Daily competitor snapshot persistence · time-series row per (client, competitor, day). Used by Competitor Daily Monitor (B2) workflow.',
    upsert_key: 'client_id + competitor_name + snapshot_date',
  })
}
