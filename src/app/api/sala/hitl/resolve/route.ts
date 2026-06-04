/**
 * POST /api/sala/hitl/resolve · sala-canon HITL gate resolution surface.
 *
 * Sprint 12 Fase 0 prep finale · CC#3 owner. Bridges the MC inbox panel
 * (existing n8n + dashboard UI) to the new sala-domain method
 * `RealSalaIntegration.resolveGate()` shipped in PR #161 (Track T).
 *
 * Body shapes (discriminated by `source`):
 *   1. `source: "sala"` · native sala caller (dashboard UI · sala-side
 *      workflow). Fields: tenant_id, stream_id, gate_event_id, outcome,
 *      resolved_by?, payload?.
 *   2. `source: "n8n-mc-inbox"` · n8n MC inbox bridge. Fields: tenant_id,
 *      stream_id, gate_event_id, decision ("approved" | "rejected" |
 *      "edited"), feedback?, edited_content?, reviewer?.
 *
 * §148 honest · this endpoint is SHADOW by default. Default-OFF gate ·
 * `SALA_HITL_RESOLVE_ENABLED` must be `"true"` for the endpoint to
 * accept requests · otherwise returns 503. Flipping to enabled = §144
 * decision (escalón 5 of the encendido roadmap).
 *
 * NO enforce · NO dispatch real · NO legacy `pipeline_steps` write-back
 * (the dual-write to legacy MC inbox lives in a separate workflow ·
 * deliberately outside this endpoint per Track T spec open question #1).
 *
 * Auth · `checkInternalOrAdmin` · same dual-auth as the legacy
 * `/api/hitl/resolve` (n8n workflows pass `x-api-key` · dashboard UI
 * rides the admin session cookie).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalOrAdmin } from '@/lib/internal-auth'
import { SupabaseEventLogStorage } from '@/lib/sala-event-log'
import { RealSalaIntegration } from '@/lib/sala-integration'
import {
  isHitlResolveEnabled,
  parseHitlResolveBody,
} from '@/lib/sala-hitl-bridge'

export async function POST(request: Request) {
  // ─── 1 · feature flag (default-OFF · canon §144 shadow gate) ───
  if (!isHitlResolveEnabled()) {
    return NextResponse.json(
      {
        error: 'sala_hitl_resolve_disabled',
        detail:
          'SALA_HITL_RESOLVE_ENABLED must be "true" to accept requests. Default-OFF (canon §144 shadow gate).',
      },
      { status: 503 },
    )
  }

  // ─── 2 · auth (dual: x-api-key OR admin session) ───
  const auth = await checkInternalOrAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  // ─── 3 · parse + validate body ───
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', detail: 'request body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = parseHitlResolveBody(raw)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'invalid_body', detail: parsed.reason },
      { status: 400 },
    )
  }

  // ─── 4 · compose harness + invoke resolveGate ───
  const supabase = getSupabaseAdmin()
  const storage = new SupabaseEventLogStorage(supabase)
  const integration = new RealSalaIntegration({ storage })

  try {
    const result = await integration.resolveGate({
      tenant_id: parsed.value.tenant_id,
      stream_id: parsed.value.stream_id,
      gate_event_id: parsed.value.gate_event_id,
      outcome: parsed.value.outcome,
      resolved_by: parsed.value.resolved_by,
      payload: parsed.value.payload,
    })

    return NextResponse.json({
      ok: true,
      via: auth.via,
      gate_event_id: parsed.value.gate_event_id,
      outcome: parsed.value.outcome,
      decisions: result.decisions.map((d) => ({
        kind: d.kind,
        step_id: 'step_id' in d ? d.step_id : null,
      })),
      events_appended: result.events_appended,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Canon canonical · the resolveGate method throws on three known
    // validation failures · all 409 (conflict · client-fixable). Anything
    // else is 500 (server-side / unexpected).
    const isKnown =
      /not found in stream|expected gate_pending|already has a gate_resolved event/.test(
        msg,
      )
    return NextResponse.json(
      { error: isKnown ? 'resolve_failed' : 'internal_error', detail: msg },
      { status: isKnown ? 409 : 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/hitl/resolve',
    method: 'POST',
    description:
      'Sala-canon HITL gate resolution · appends gate_resolved event + processes router decision.',
    feature_flag: 'SALA_HITL_RESOLVE_ENABLED · default-OFF',
    auth: 'x-api-key (INTERNAL_API_KEY) OR admin session cookie',
    body_shapes: {
      sala: {
        source: '"sala"',
        tenant_id: 'uuid',
        stream_id: 'string',
        gate_event_id: 'uuid (the gate_pending event_id)',
        outcome: '"approved" | "rejected"',
        resolved_by: 'string (optional · default "sala:unknown")',
        payload: 'object (optional · custom audit data)',
      },
      n8n_mc_inbox: {
        source: '"n8n-mc-inbox"',
        tenant_id: 'uuid',
        stream_id: 'string',
        gate_event_id: 'uuid',
        decision: '"approved" | "rejected" | "edited"',
        feedback: 'string (optional)',
        edited_content: 'string (optional)',
        reviewer: 'string (optional · default "mc-inbox:unknown")',
      },
    },
    canon: 'Track T spec · zr-vault/00-meta/opus-4-8-traspaso/RESULTS-CC3-Track-T-step11-resume-spec-2026-06-04.md',
  })
}
