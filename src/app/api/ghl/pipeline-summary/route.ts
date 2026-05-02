/**
 * GET /api/ghl/pipeline-summary — Weekly Client Report Generator read-path.
 *
 * Closes W15-D-12. Workflow caller:
 *   `Zero Risk — Weekly Client Report Generator v2 (Mondays 8am)`
 *
 * Purpose: roll up GHL deals/opportunities for a client into a stage-keyed
 * summary the report generator embeds into the Monday email/Notion page.
 * Reads from ghl_pipeline_snapshots (table optional · graceful fallback).
 *
 * Query params:
 *   client_id  · required
 *   pipeline_id · optional — filter to one GHL pipeline (a client may have several)
 *
 * Response (200):
 *   {
 *     ok: true,
 *     client_id: string,
 *     pipeline_id: string | null,
 *     as_of: ISO,
 *     stages: [{ stage_name, deal_count, value_usd }],
 *     totals: { deals: number, value_usd: number, weighted_value_usd: number },
 *     fallback_mode?: true
 *   }
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface StageRow {
  stage_name: string
  deal_count: number
  value_usd: number
}

function stubPipeline(): { stages: StageRow[]; totals: { deals: number; value_usd: number; weighted_value_usd: number } } {
  const stages: StageRow[] = [
    { stage_name: 'New Lead', deal_count: 4, value_usd: 0 },
    { stage_name: 'Discovery', deal_count: 3, value_usd: 9_000 },
    { stage_name: 'Proposal', deal_count: 2, value_usd: 14_000 },
    { stage_name: 'Negotiation', deal_count: 1, value_usd: 8_000 },
    { stage_name: 'Won', deal_count: 1, value_usd: 6_000 },
  ]
  const totals = {
    deals: stages.reduce((s, x) => s + x.deal_count, 0),
    value_usd: stages.reduce((s, x) => s + x.value_usd, 0),
    weighted_value_usd: 18_500, // typical mid-funnel weight
  }
  return { stages, totals }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_client_id', code: 'E-INPUT-MISSING', detail: 'client_id query param is required' },
      { status: 400 },
    )
  }
  const pipelineId = url.searchParams.get('pipeline_id')

  let stages: StageRow[] = []
  let totals = { deals: 0, value_usd: 0, weighted_value_usd: 0 }
  let fallbackMode = false

  try {
    const supabase = getSupabaseAdmin()
    let q = supabase
      .from('ghl_pipeline_snapshots')
      .select('stage_name, deal_count, value_usd, weighted_value_usd, captured_at')
      .eq('client_id', clientId)
      .order('captured_at', { ascending: false })
      .limit(20)
    if (pipelineId) q = q.eq('ghl_pipeline_id', pipelineId)
    const { data, error } = await q

    if (!error && data && data.length > 0) {
      // Aggregate latest snapshot per stage_name (already ordered desc).
      const seen = new Set<string>()
      for (const r of data) {
        if (seen.has(r.stage_name)) continue
        seen.add(r.stage_name)
        stages.push({
          stage_name: String(r.stage_name),
          deal_count: typeof r.deal_count === 'number' ? r.deal_count : 0,
          value_usd: typeof r.value_usd === 'number' ? r.value_usd : 0,
        })
      }
      totals = {
        deals: stages.reduce((s, x) => s + x.deal_count, 0),
        value_usd: stages.reduce((s, x) => s + x.value_usd, 0),
        weighted_value_usd: data.reduce((s, x) => s + (typeof x.weighted_value_usd === 'number' ? x.weighted_value_usd : 0), 0),
      }
    } else {
      fallbackMode = true
      const stub = stubPipeline()
      stages = stub.stages
      totals = stub.totals
    }
  } catch {
    fallbackMode = true
    const stub = stubPipeline()
    stages = stub.stages
    totals = stub.totals
  }

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    pipeline_id: pipelineId,
    as_of: new Date().toISOString(),
    stages,
    totals,
    ...(fallbackMode ? { fallback_mode: true } : {}),
  })
}
