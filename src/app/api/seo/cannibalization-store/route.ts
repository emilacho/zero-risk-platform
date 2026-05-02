/**
 * SEO — Cannibalization Store (internal, no external API)
 *
 * Used by Cannibalization Audit Weekly workflow (cluster 3) to persist
 * detected keyword cannibalization conflicts across a client's domain.
 *
 * POST body:
 *   {
 *     client_id: string,
 *     domain: string,
 *     audit_date?: string ISO (default now),
 *     conflict_count: number,
 *     severity: "low" | "medium" | "high" | "critical",
 *     conflict_matrix: Array<{ query, pages_count, pages: [...] }>,
 *     agent_recommendations?: { consolidation, demotion, reframing },
 *     total_pages_scanned?: number,
 *     total_queries?: number
 *   }
 *
 * Returns: { ok, id, severity }
 *
 * Severity mapping:
 *   - conflict_count 0-5: "low"
 *   - conflict_count 6-20: "medium"
 *   - conflict_count 21-50: "high"
 *   - conflict_count 50+: "critical"
 * Auto-computed if severity not provided.
 *
 * High/critical severity triggers Slack alert in the workflow (not here).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_SEVERITY = new Set(['low', 'medium', 'high', 'critical'])

function autoSeverity(count: number): string {
  if (count <= 5) return 'low'
  if (count <= 20) return 'medium'
  if (count <= 50) return 'high'
  return 'critical'
}

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
  if (!body || !body.client_id || !body.domain) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['client_id', 'domain'] },
      { status: 400 }
    )
  }

  const conflictCount = Number(body.conflict_count) || 0
  const severity =
    body.severity && VALID_SEVERITY.has(body.severity)
      ? body.severity
      : autoSeverity(conflictCount)

  const row = {
    client_id: body.client_id,
    domain: body.domain,
    audit_date: body.audit_date || new Date().toISOString(),
    conflict_count: conflictCount,
    severity,
    conflict_matrix: Array.isArray(body.conflict_matrix) ? body.conflict_matrix : [],
    agent_recommendations: body.agent_recommendations || {},
    total_pages_scanned: Number(body.total_pages_scanned) || null,
    total_queries: Number(body.total_queries) || null,
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('cannibalization_audits')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[seo/cannibalization-store] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    severity: data.severity,
    conflict_count: data.conflict_count,
    flag_for_alert: severity === 'high' || severity === 'critical',
  })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const client_id = request.nextUrl.searchParams.get('client_id')
  const severity = request.nextUrl.searchParams.get('severity')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '20'), 200)

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('cannibalization_audits')
    .select('*')
    .order('audit_date', { ascending: false })
    .limit(limit)

  if (client_id) query = query.eq('client_id', client_id)
  if (severity) query = query.eq('severity', severity)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })

  return NextResponse.json({ items: data || [], count: (data || []).length })
}
