/**
 * Tracking — Attribution Audits
 *
 * Called by Cross-Platform Attribution Validator workflow (hourly).
 * Persists discrepancy-detection records to attribution_audits table.
 *
 * POST body:
 *   {
 *     campaign_id: string,
 *     client_id: string,
 *     audit_type?: "hourly_cross_platform" | "daily" | "campaign_end",
 *     severity?: "ok" | "low" | "medium" | "high" | "critical",
 *     platform_conversions?: { meta, google, tiktok, ga4, ... },
 *     discrepancies?: Array<{ source, diff_pct, ... }>,
 *     qa_results?: Array<{ check, status, ... }>,
 *     max_discrepancy_pct?: number
 *   }
 *
 * GET ?client_id=xxx&severity=high&limit=20 → recent audits (for dashboards)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'

const VALID_AUDIT_TYPES = new Set(['hourly_cross_platform', 'daily', 'campaign_end'])
const VALID_SEVERITY = new Set(['ok', 'low', 'medium', 'high', 'critical'])

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const _raw = await request.json().catch(() => null)
  if (!_raw) return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  const _v = validateObject<Record<string, unknown>>(_raw, 'analytics-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body || !body.campaign_id || !body.client_id) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['campaign_id', 'client_id'] },
      { status: 400 }
    )
  }

  const row = {
    campaign_id: body.campaign_id,
    client_id: body.client_id,
    audit_type: VALID_AUDIT_TYPES.has(body.audit_type) ? body.audit_type : 'hourly_cross_platform',
    severity: VALID_SEVERITY.has(body.severity) ? body.severity : 'ok',
    platform_conversions: body.platform_conversions || {},
    discrepancies: Array.isArray(body.discrepancies) ? body.discrepancies : [],
    qa_results: Array.isArray(body.qa_results) ? body.qa_results : [],
    max_discrepancy_pct:
      typeof body.max_discrepancy_pct === 'number' ? body.max_discrepancy_pct : null,
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('attribution_audits')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[tracking/attribution-audits] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    severity: data.severity,
  })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const client_id = request.nextUrl.searchParams.get('client_id')
  const severity = request.nextUrl.searchParams.get('severity')
  const campaign_id = request.nextUrl.searchParams.get('campaign_id')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '20'), 200)

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('attribution_audits')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (client_id) query = query.eq('client_id', client_id)
  if (severity) query = query.eq('severity', severity)
  if (campaign_id) query = query.eq('campaign_id', campaign_id)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [], count: (data || []).length })
}
