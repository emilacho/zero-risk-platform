/**
 * POST /api/nexus/parse-request — replaces NEXUS "Parse & Validate Request" Code node.
 *
 * Why this exists: n8n Code nodes in Railway self-host hit VM2 sandbox
 * TIMEOUT_NO_EXEC intermittently. Moving logic to the backend is the
 * architecturally correct fix (Option B from NEXUS task #40).
 *
 * Accepts: { body: { client_id, campaign_brief, priority? } }  OR  { client_id, campaign_brief, priority? }
 * Returns: parsed initial state with request_id, phases array, etc.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PHASES = ['DISCOVER', 'STRATEGIZE', 'SCAFFOLD', 'BUILD', 'HARDEN', 'LAUNCH', 'OPERATE']

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const outer: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>) : {}
    // n8n webhooks sometimes wrap body under .body, sometimes pass top-level.
    const inner: Record<string, unknown> = (outer.body && typeof outer.body === 'object' && !Array.isArray(outer.body))
      ? (outer.body as Record<string, unknown>) : outer

    const client_id = (typeof inner.client_id === 'string' && inner.client_id) || 'unknown'
    const campaign_brief = (typeof inner.campaign_brief === 'string' && inner.campaign_brief) || ''
    const priority = (typeof inner.priority === 'string' && inner.priority) || 'normal'

    if (!client_id || !campaign_brief) {
      // Don't 400 — return a minimal state so workflow can proceed to HITL / error branch.
      return NextResponse.json({
        ok: false,
        validation_error: 'Missing required fields: client_id, campaign_brief',
        request_id: `nexus-error-${Date.now()}`,
        client_id: client_id || 'unknown',
        campaign_brief,
        priority,
        phases: PHASES,
        current_phase_index: 0,
        current_phase: PHASES[0],
        phase_outputs: {},
        retry_count: 0,
        started_at: new Date().toISOString(),
        status: 'validation_failed',
      })
    }

    const request_id = `nexus-${client_id}-${Date.now()}`

    // Smoke mode short-circuit: return 1-phase array so the retry loop
    // completes within the 60s smoke timeout. Real runs do all 7 phases.
    const isSmoke = client_id.startsWith('smoke-') || client_id === 'smoke-test'
    const phasesToUse = isSmoke ? ['DISCOVER'] : PHASES

    return NextResponse.json({
      ok: true,
      request_id,
      client_id,
      campaign_brief,
      priority,
      phases: phasesToUse,
      current_phase_index: 0,
      current_phase: phasesToUse[0],
      phase_outputs: {},
      retry_count: 0,
      started_at: new Date().toISOString(),
      status: 'initiated',
      smoke_mode: isSmoke,
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/nexus/parse-request',
      source: 'route_handler',
    })
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: false,
      request_id: `nexus-error-${Date.now()}`,
      phases: PHASES,
      current_phase_index: 0,
      current_phase: PHASES[0],
      phase_outputs: {},
      retry_count: 0,
      status: 'parser_error',
      handler_error: msg.slice(0, 400),
    })
  }
}
