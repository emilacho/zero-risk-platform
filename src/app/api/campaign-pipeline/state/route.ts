/**
 * Campaign Pipeline State
 *
 * Used by NEXUS 7-Phase Orchestrator (n8n) to persist phase state per campaign.
 * One row per campaign. Upserts on request_id.
 *
 * POST body:
 *   {
 *     request_id: string,         // required
 *     client_id: string,          // required
 *     current_phase: "DISCOVER" | "STRATEGIZE" | ... | "DONE" | "FAILED",
 *     status?: "active" | "retrying" | "blocked_hitl" | "completed" | "failed",
 *     retry_count?: number,
 *     phase_outputs?: Record<phase, any>,   // JSON merged into existing
 *     metadata?: Record<string, any>
 *   }
 *
 * GET ?request_id=xxx  → fetch single pipeline state (for resume/dashboards)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_PHASES = new Set([
  'DISCOVER', 'STRATEGIZE', 'SCAFFOLD', 'BUILD', 'HARDEN', 'LAUNCH', 'OPERATE', 'DONE', 'FAILED',
])
const VALID_STATUS = new Set(['active', 'retrying', 'blocked_hitl', 'completed', 'failed'])

// Normalize common aliases from research-generated workflows
const STATUS_ALIASES: Record<string, string> = {
  initiated: 'active',
  started: 'active',
  running: 'active',
  in_progress: 'active',
  pending: 'active',
  blocked: 'blocked_hitl',
  done: 'completed',
  success: 'completed',
  error: 'failed',
}

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const _raw = await request.json().catch(() => null)
  if (!_raw) return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  const _v = validateObject<Record<string, unknown>>(_raw, 'pipeline-action')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { request_id, client_id, current_phase, retry_count } = body
  let status = body.status
  if (!request_id || !current_phase) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['request_id', 'current_phase'] },
      { status: 400 }
    )
  }
  if (!VALID_PHASES.has(current_phase)) {
    return NextResponse.json({ error: 'invalid_phase', got: current_phase }, { status: 400 })
  }
  // Apply aliases before validating
  if (status && typeof status === 'string') {
    const normalized = STATUS_ALIASES[status.toLowerCase()] || status
    status = normalized
  }
  if (status && !VALID_STATUS.has(status)) {
    return NextResponse.json(
      { error: 'invalid_status', got: status, accepted: Array.from(VALID_STATUS), aliases: Object.keys(STATUS_ALIASES) },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()

  // Fetch existing row to merge phase_outputs / metadata
  const { data: existing } = await supabase
    .from('campaign_pipeline_state')
    .select('phase_outputs, metadata, client_id')
    .eq('request_id', request_id)
    .maybeSingle()

  // client_id required only on initial INSERT
  if (!existing && !client_id) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['client_id (on first write)'] },
      { status: 400 }
    )
  }

  // Accept either phase_outputs (object, canonical) OR phase_output (single value to merge under current_phase)
  const phaseOutputsInput =
    body.phase_outputs && typeof body.phase_outputs === 'object'
      ? body.phase_outputs
      : body.phase_output !== undefined
        ? { [current_phase]: body.phase_output }
        : {}

  // Everything else not captured goes into metadata (preserves campaign_brief, priority, etc.)
  const KNOWN_FIELDS = new Set([
    'request_id', 'client_id', 'current_phase', 'status', 'retry_count',
    'phase_outputs', 'phase_output', 'metadata'
  ])
  const extraMetadata: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!KNOWN_FIELDS.has(k) && v !== undefined) {
      extraMetadata[k] = v
    }
  }

  const mergedPhaseOutputs = { ...(existing?.phase_outputs || {}), ...phaseOutputsInput }
  const mergedMetadata = { ...(existing?.metadata || {}), ...extraMetadata, ...(body.metadata || {}) }

  const row: Record<string, unknown> = {
    request_id,
    current_phase,
    status: status || 'active',
    phase_outputs: mergedPhaseOutputs,
    metadata: mergedMetadata,
  }
  // Always include client_id when present in body OR from existing row.
  // Upsert with onConflict sends the row as both INSERT + UPDATE candidate;
  // if we omit client_id, the UPDATE path can try to set NULL and violate NOT NULL.
  if (client_id) {
    row.client_id = client_id
  } else if (existing?.client_id) {
    row.client_id = existing.client_id
  }

  // retry_count: only set if explicitly provided OR on insert
  if (typeof retry_count === 'number') row.retry_count = retry_count
  else if (!existing) row.retry_count = 0

  const { data, error } = await supabase
    .from('campaign_pipeline_state')
    .upsert(row, { onConflict: 'request_id' })
    .select()
    .single()

  if (error) {
    console.error('[campaign-pipeline/state] upsert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  // Also spread `data` at the top level so downstream n8n nodes can read
  // `$json.current_phase`, `$json.request_id`, etc. directly after calling
  // this endpoint (instead of having to dig into `$json.state.*`). This is
  // the canonical shape expected by the NEXUS workflow's Execute Phase /
  // Advance / Persist nodes. Backwards-compatible with `$json.state.*`.
  return NextResponse.json({ ok: true, state: data, ...(data || {}) })
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const requestId = request.nextUrl.searchParams.get('request_id')
  if (!requestId) {
    return NextResponse.json({ error: 'missing_request_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('campaign_pipeline_state')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found', request_id: requestId }, { status: 404 })
  }

  return NextResponse.json({ ok: true, state: data })
}
