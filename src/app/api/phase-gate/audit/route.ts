/**
 * Phase Gate Audit — write/read standalone audit records.
 *
 * Note: /api/evidence/validate ALREADY writes to phase_gate_audits as part of its
 * validation flow. This endpoint is for workflows that want to write a standalone
 * audit without going through validation (e.g., manual overrides), or for the
 * Phase Gate Evidence Collector workflow to persist its results.
 *
 * POST body:
 *   {
 *     request_id: string,
 *     phase: string,
 *     verdict: "PASS" | "RETRY" | "FAIL",
 *     structural_issues?: string[],
 *     semantic_issues?: string[],
 *     rationale?: string,
 *     editor_review?: object
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'

const VALID_VERDICTS = new Set(['PASS', 'RETRY', 'FAIL'])

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
  if (!body || !body.request_id || !body.phase || !body.verdict) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['request_id', 'phase', 'verdict'] },
      { status: 400 }
    )
  }

  if (!VALID_VERDICTS.has(body.verdict)) {
    return NextResponse.json({ error: 'invalid_verdict', got: body.verdict }, { status: 400 })
  }

  const row = {
    request_id: body.request_id,
    phase: body.phase,
    verdict: body.verdict,
    structural_issues: Array.isArray(body.structural_issues) ? body.structural_issues : [],
    semantic_issues: Array.isArray(body.semantic_issues) ? body.semantic_issues : [],
    rationale: body.rationale || null,
    editor_review: body.editor_review || {},
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('phase_gate_audits')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[phase-gate/audit] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    validation_id: data.validation_id,
    verdict: data.verdict,
  })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const request_id = request.nextUrl.searchParams.get('request_id')
  if (!request_id) {
    return NextResponse.json({ error: 'missing_request_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('phase_gate_audits')
    .select('*')
    .eq('request_id', request_id)
    .order('validated_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })

  return NextResponse.json({ items: data || [], count: (data || []).length })
}
