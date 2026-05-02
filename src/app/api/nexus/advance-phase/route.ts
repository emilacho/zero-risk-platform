/**
 * POST /api/nexus/advance-phase — replaces NEXUS "Advance to Next Phase" Code node.
 *
 * Accepts: full state blob + phase_output (passed from Execute Phase node).
 * Returns: updated state with current_phase_index++, retry_count=0, status.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PHASES = ['DISCOVER', 'STRATEGIZE', 'SCAFFOLD', 'BUILD', 'HARDEN', 'LAUNCH', 'OPERATE']

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>) : {}
    const _v = validateObject<Record<string, unknown>>(body, 'nexus-action')
    if (!_v.ok) return _v.response

    const current_phase = (typeof body.current_phase === 'string' && body.current_phase) || PHASES[0]
    const phase_output = (typeof body.phase_output === 'string' ? body.phase_output : JSON.stringify(body.phase_output ?? '')) || ''
    const phase_outputs = (body.phase_outputs && typeof body.phase_outputs === 'object' && !Array.isArray(body.phase_outputs))
      ? { ...(body.phase_outputs as Record<string, unknown>) } : {}

    // Respect the phases array from the body — smoke mode passes a 1-phase
    // array to avoid the 7-phase × Claude calls timeout. Real runs pass all 7.
    // Auto-detect smoke mode by client_id prefix as fallback — intermediate
    // workflow nodes don't always forward the `phases` array, so we need to
    // re-short-circuit based on client_id here too.
    const client_id_from_body = typeof body.client_id === 'string' ? body.client_id : ''
    const isSmoke = client_id_from_body.startsWith('smoke-') || client_id_from_body === 'smoke-test'
    const phasesFromBody = Array.isArray(body.phases) && body.phases.length
      ? (body.phases as string[])
      : (isSmoke ? ['DISCOVER'] : PHASES)
    const current_idx = phasesFromBody.indexOf(current_phase)
    const next_idx = current_idx + 1

    phase_outputs[current_phase] = phase_output

    if (next_idx < phasesFromBody.length) {
      return NextResponse.json({
        ...body,
        ok: true,
        phases: phasesFromBody,
        current_phase_index: next_idx,
        current_phase: phasesFromBody[next_idx],
        phase_outputs,
        retry_count: 0,
        status: 'in_progress',
      })
    }

    return NextResponse.json({
      ...body,
      ok: true,
      phases: phasesFromBody,
      current_phase_index: current_idx,
      current_phase,
      phase_outputs,
      retry_count: 0,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: false,
      status: 'advance_error',
      phases: PHASES,
      current_phase_index: 0,
      current_phase: PHASES[0],
      retry_count: 0,
      handler_error: msg.slice(0, 400),
    })
  }
}
