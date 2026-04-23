/**
 * POST /api/nexus/advance-phase — replaces NEXUS "Advance to Next Phase" Code node.
 *
 * Accepts: full state blob + phase_output (passed from Execute Phase node).
 * Returns: updated state with current_phase_index++, retry_count=0, status.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

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

    const current_phase = (typeof body.current_phase === 'string' && body.current_phase) || PHASES[0]
    const phase_output = (typeof body.phase_output === 'string' ? body.phase_output : JSON.stringify(body.phase_output ?? '')) || ''
    const phase_outputs = (body.phase_outputs && typeof body.phase_outputs === 'object' && !Array.isArray(body.phase_outputs))
      ? { ...(body.phase_outputs as Record<string, unknown>) } : {}

    const current_idx = PHASES.indexOf(current_phase)
    const next_idx = current_idx + 1

    phase_outputs[current_phase] = phase_output

    if (next_idx < PHASES.length) {
      return NextResponse.json({
        ...body,
        ok: true,
        phases: PHASES,
        current_phase_index: next_idx,
        current_phase: PHASES[next_idx],
        phase_outputs,
        retry_count: 0,
        status: 'in_progress',
      })
    }

    return NextResponse.json({
      ...body,
      ok: true,
      phases: PHASES,
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
