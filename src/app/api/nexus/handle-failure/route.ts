/**
 * POST /api/nexus/handle-failure — replaces NEXUS "Handle Validation Failure" Code node.
 *
 * Accepts: full state blob + validation_error.
 * Returns: updated state with retry_count++ and status = 'retrying' or 'escalated_to_hitl'.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>) : {}

    const retry_count = (typeof body.retry_count === 'number' ? body.retry_count : 0) + 1
    const last_validation_error = (typeof body.validation_error === 'string' && body.validation_error)
      || (typeof body.error === 'string' && body.error)
      || 'Unknown validation error'
    const current_phase = (typeof body.current_phase === 'string' && body.current_phase) || 'UNKNOWN'

    const escalated = retry_count >= 3

    return NextResponse.json({
      ...body,
      ok: true,
      retry_count,
      last_validation_error,
      status: escalated ? 'escalated_to_hitl' : 'retrying',
      escalation_reason: escalated ? `Phase ${current_phase} failed validation ${retry_count} times` : null,
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/nexus/handle-failure',
      source: 'route_handler',
    })
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: false,
      status: 'failure_handler_error',
      retry_count: 3,
      handler_error: msg.slice(0, 400),
    })
  }
}
