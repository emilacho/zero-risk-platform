/**
 * Generic ingest endpoint — POST /api/ingest/[table]
 *
 * Accepts any JSON body and writes it to the named Supabase table.
 * Table name is taken from the path parameter and validated against a whitelist.
 *
 * Body shape: either a single row object or `{ rows: [...] }`.
 * Each row is augmented with `client_id` (if provided at top level) and stored.
 *
 * Why this exists: many research-generated workflows POST to specific
 * paths like /api/uptime-incidents or /api/email-sequences/log. Rather than
 * building 20 near-identical routes, we route everything with a write-to-table
 * shape through this generic handler and only hand-craft the endpoints that
 * need real business logic.
 *
 * Whitelist is the list of tables created by migration_ola3_workflow_stubs.sql
 * plus existing tables whose write-pattern matches this shape.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Tables this endpoint will write to. All others return 400.
const ALLOWED_TABLES = new Set<string>([
  // Ola 3 stubs
  'email_sequences',
  'subject_line_tests',
  'influencer_approved_list',
  'influencer_rejections',
  'review_responses_queue',
  'error_events',
  'uptime_incidents',
  'churn_predictions',
  'rfm_segments',
  'community_health',
  'expansion_opportunities',
  'agent_health_metrics',
  'content_fetch_cache',
  'client_brain_snapshots',
  // Existing tables that accept generic writes
  'agent_outcomes',
  'agent_routing_log',
  'campaigns',
  'content_refresh_queue',
  'content_repurposing_queue',
  'creative_performance_insights',
  'cannibalization_audits',
  'attribution_audits',
  'experiments',
  'incrementality_tests',
  'leads',
  'review_metrics',
  'social_schedules',
  'rsa_headline_library',
])

export async function POST(
  request: Request,
  ctx: { params: Promise<{ table: string }> }
) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { table } = await ctx.params
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json(
      { error: 'table_not_allowed', table, hint: `add "${table}" to ALLOWED_TABLES in /api/ingest/[table]/route.ts if needed` },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const rows = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : [body]
  if (!rows.length) {
    return NextResponse.json({ error: 'empty_body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(table).insert(rows).select('id')
  if (error) {
    return NextResponse.json(
      { error: 'db_error', table, detail: error.message, hint: error.hint, code: error.code },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, table, inserted: data?.length ?? 0, ids: (data ?? []).map(r => r.id) })
}

export async function GET(_request: Request, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params
  return NextResponse.json({
    endpoint: `/api/ingest/${table}`,
    method: 'POST',
    description: 'Generic table write endpoint. Accepts JSON body (single row or {rows:[...]}) and inserts into the named Supabase table.',
    allowed_tables: [...ALLOWED_TABLES].sort(),
    example_body: { client_id: 'smoke', data: { key: 'value' } },
  })
}
