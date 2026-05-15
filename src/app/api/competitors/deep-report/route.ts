/**
 * POST /api/competitors/deep-report · 5-layer deep scan enrich
 *
 * Sprint #6 Brazo 2 Path C · replaces the prior stub that wrote to a
 * non-existent `competitor_deep_reports` table. Now ENRICHES the existing
 * `client_competitive_landscape` row for the same (client_id, competitor)
 * pair, or CREATES a new landscape row when the competitor hasn't been
 * recorded yet.
 *
 * Consumers · `Competitive Intelligence 5-Layer Deep Scan` n8n workflow
 * (B1 · 11 nodes · webhook on-demand). The strategist synthesis blob from
 * the Opus agent lands in `deep_scan_data` (JSONB column added by migration
 * 202605151430); the structured fields (value_proposition, key_differentiators,
 * weaknesses) merge-dedupe with whatever was already on the row.
 *
 * Body shape (n8n B1 `Persist Deep Report` node sends this):
 *   {
 *     client_id?: string,                          // optional · resolver chain
 *     competitor_name?: string,                    // either name or website req'd
 *     competitor_website?: string,
 *     competitor_id?: string,                      // optional · landscape UUID
 *     value_proposition?: string,
 *     key_differentiators?: string[],
 *     weaknesses?: string[],
 *     deep_scan_data?: object,                     // full strategist synthesis
 *     analysis_source?: string                     // defaults '5-layer-scanner'
 *   }
 *
 * Returns · { ok, landscape_id, action: 'created'|'updated', client_id }
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface DeepReportInput {
  client_id?: string
  competitor_id?: string | null
  competitor_name?: string
  competitor_website?: string
  competitor_type?: 'direct' | 'indirect' | 'aspirational' | 'alternative'
  value_proposition?: string
  key_differentiators?: unknown[]
  weaknesses?: unknown[]
  tagline?: string
  pricing_model?: string
  pricing_range?: string
  target_audience?: string
  ad_strategy_summary?: string
  content_strategy_summary?: string
  recent_moves?: unknown[]
  deep_scan_data?: Record<string, unknown>
  analysis_source?: string
  // Sprint #6 Brazo 2 closeout · the B1 workflow sends `raw` (merged 5-layer
  // payload) and `synthesis` (strategist Opus output) as siblings, NOT as a
  // pre-assembled `deep_scan_data` blob. When the route only read
  // `body.deep_scan_data` directly, every landscape row landed with `{}`
  // (Finding #2 of B1-EXPRESSION-FIXED report 15:47Z). Accept both shapes
  // so the existing direct-API contract (deep_scan_data: {...}) keeps
  // working AND the n8n workflow flow populates the jsonb.
  raw?: unknown
  synthesis?: unknown
  task_id?: string
}

/**
 * Build the deep_scan_data jsonb from the incoming body.
 *
 * Precedence:
 *  1. If `body.deep_scan_data` is a non-empty object → use it as-is
 *     (direct-API callers that already assemble the blob client-side)
 *  2. Otherwise, if `body.raw` or `body.synthesis` or `body.task_id` are
 *     present → assemble a structured jsonb from those siblings (the n8n
 *     B1 workflow shape · Sprint #6 Brazo 2 contract)
 *  3. Otherwise → `{}` (no scan data on this call · still valid for
 *     callers that only want to upsert scalar fields)
 */
function buildDeepScanData(body: DeepReportInput): Record<string, unknown> {
  if (
    body.deep_scan_data &&
    typeof body.deep_scan_data === 'object' &&
    Object.keys(body.deep_scan_data).length > 0
  ) {
    return body.deep_scan_data
  }

  const hasWorkflowFields =
    body.raw !== undefined ||
    body.synthesis !== undefined ||
    (typeof body.task_id === 'string' && body.task_id.length > 0)

  if (!hasWorkflowFields) return {}

  const assembled: Record<string, unknown> = {
    scan_timestamp: new Date().toISOString(),
  }
  if (body.task_id) assembled.task_id = body.task_id
  if (body.raw !== undefined) assembled.raw = body.raw
  if (body.synthesis !== undefined) assembled.synthesis = body.synthesis
  return assembled
}

/**
 * Merge two arrays of strings · dedupe case-insensitively, preserve insertion
 * order from the existing array first, then append new items not already
 * present. Non-string values are coerced via JSON.stringify so JSONB blobs
 * survive without throwing.
 */
function mergeDedupeArray(
  existing: unknown,
  incoming: unknown,
): unknown[] {
  const toArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const e = toArr(existing)
  const i = toArr(incoming)
  const seen = new Set<string>()
  const out: unknown[] = []
  const key = (v: unknown) =>
    typeof v === 'string' ? v.trim().toLowerCase() : JSON.stringify(v)
  for (const item of [...e, ...i]) {
    if (item == null) continue
    const k = key(item)
    if (k === '' || seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: DeepReportInput
  try {
    body = (await request.json()) as DeepReportInput
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
  const competitorWebsite =
    typeof body.competitor_website === 'string' && body.competitor_website.trim()
      ? body.competitor_website.trim()
      : null

  if (!competitorName && !competitorWebsite && !body.competitor_id) {
    return NextResponse.json(
      {
        error: 'missing_field',
        field: 'competitor_name|competitor_website|competitor_id',
      },
      { status: 400 },
    )
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

  // ── 1 · find existing landscape row for this (client, competitor) ──────
  // Match precedence: competitor_id explicit → competitor_name + client_id
  // → competitor_website + client_id. We don't trust competitor_name alone
  // (clients can share competitors but each has its own landscape row).
  let existing: Record<string, unknown> | null = null
  if (body.competitor_id) {
    const { data } = await supabase
      .from('client_competitive_landscape')
      .select('*')
      .eq('id', body.competitor_id)
      .eq('client_id', clientId)
      .maybeSingle()
    existing = data ?? null
  }
  if (!existing && competitorName) {
    const { data } = await supabase
      .from('client_competitive_landscape')
      .select('*')
      .eq('client_id', clientId)
      .eq('competitor_name', competitorName)
      .maybeSingle()
    existing = data ?? null
  }
  if (!existing && competitorWebsite) {
    const { data } = await supabase
      .from('client_competitive_landscape')
      .select('*')
      .eq('client_id', clientId)
      .eq('competitor_website', competitorWebsite)
      .maybeSingle()
    existing = data ?? null
  }

  const nowIso = new Date().toISOString()
  const analysisSource = body.analysis_source ?? '5-layer-scanner'
  const deepScanData = buildDeepScanData(body)

  if (existing) {
    // ── 2a · UPDATE existing · merge arrays + overlay scalars + JSONB ──
    // Scalar fields are overwritten ONLY when the incoming value is non-empty.
    // value_proposition was kept · the brief said "if higher confidence" but
    // we don't have a confidence signal yet, so we prefer the latest scan as
    // the fresher source rather than locking in an older value.
    const patch: Record<string, unknown> = {
      key_differentiators: mergeDedupeArray(
        existing.key_differentiators,
        body.key_differentiators,
      ),
      weaknesses: mergeDedupeArray(existing.weaknesses, body.weaknesses),
      recent_moves: mergeDedupeArray(existing.recent_moves, body.recent_moves),
      deep_scan_data: deepScanData,
      analysis_source: analysisSource,
      last_analyzed_at: nowIso,
      updated_at: nowIso,
    }
    if (body.value_proposition) patch.value_proposition = body.value_proposition
    if (body.tagline) patch.tagline = body.tagline
    if (body.pricing_model) patch.pricing_model = body.pricing_model
    if (body.pricing_range) patch.pricing_range = body.pricing_range
    if (body.target_audience) patch.target_audience = body.target_audience
    if (body.ad_strategy_summary)
      patch.ad_strategy_summary = body.ad_strategy_summary
    if (body.content_strategy_summary)
      patch.content_strategy_summary = body.content_strategy_summary
    if (competitorWebsite && !existing.competitor_website)
      patch.competitor_website = competitorWebsite

    const { data: updated, error: upErr } = await supabase
      .from('client_competitive_landscape')
      .update(patch)
      .eq('id', existing.id as string)
      .select('id')
      .single()

    if (upErr || !updated) {
      return NextResponse.json(
        {
          error: 'landscape_update_failed',
          detail: upErr?.message?.slice(0, 400) ?? 'unknown error',
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      landscape_id: updated.id,
      client_id: clientId,
      action: 'updated',
    })
  }

  // ── 2b · INSERT new landscape row · competitor wasn't tracked yet ──────
  const insertRow: Record<string, unknown> = {
    client_id: clientId,
    competitor_name: competitorName ?? competitorWebsite ?? 'unknown',
    competitor_website: competitorWebsite,
    competitor_type: body.competitor_type ?? 'direct',
    tagline: body.tagline ?? null,
    value_proposition: body.value_proposition ?? null,
    key_differentiators: Array.isArray(body.key_differentiators)
      ? body.key_differentiators
      : [],
    weaknesses: Array.isArray(body.weaknesses) ? body.weaknesses : [],
    pricing_model: body.pricing_model ?? null,
    pricing_range: body.pricing_range ?? null,
    target_audience: body.target_audience ?? null,
    content_strategy_summary: body.content_strategy_summary ?? null,
    ad_strategy_summary: body.ad_strategy_summary ?? null,
    recent_moves: Array.isArray(body.recent_moves) ? body.recent_moves : [],
    deep_scan_data: deepScanData,
    analysis_source: analysisSource,
    last_analyzed_at: nowIso,
  }

  const { data: inserted, error: insErr } = await supabase
    .from('client_competitive_landscape')
    .insert(insertRow)
    .select('id')
    .single()

  if (insErr || !inserted) {
    return NextResponse.json(
      {
        error: 'landscape_insert_failed',
        detail: insErr?.message?.slice(0, 400) ?? 'unknown error',
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    landscape_id: inserted.id,
    client_id: clientId,
    action: 'created',
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/competitors/deep-report',
    method: 'POST',
    runtime: 'nodejs',
    description:
      'Enrich client_competitive_landscape · UPDATE if (client, competitor) exists, INSERT new landscape row otherwise. Used by Competitive Intelligence 5-Layer Deep Scan (B1) workflow.',
    match_precedence:
      'competitor_id → competitor_name+client_id → competitor_website+client_id',
  })
}
