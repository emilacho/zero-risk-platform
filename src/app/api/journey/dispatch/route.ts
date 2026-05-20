/**
 * POST /api/journey/dispatch · Sprint 1 L1 Master Journey Orchestrator
 *
 * Single entry point for all journey dispatching · validates the inbound
 * payload, computes target stage, persists `client_journey_state`,
 * invokes the L2 target, returns `{journey_id, dispatch_status, ...}`.
 *
 * Auth · internal x-api-key header. Caller can be ·
 *   - Mission Control UI button (manual dispatches)
 *   - OnboardingOrchestrator hook (post-Phase-1 transition)
 *   - n8n cron job (Journey D supervisors)
 *   - HITL approval webhook (Mission Control inbox)
 *
 * Body shape · per `DispatchRequest` in `src/lib/journey-orchestrator/types.ts`.
 */
import { NextResponse } from 'next/server'
import {
  dispatchJourney,
  validateDispatchRequest,
} from '@/lib/journey-orchestrator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function checkInternalKey(req: Request): { ok: boolean; reason?: string } {
  const headerKey = req.headers.get('x-api-key') || ''
  const expected = process.env.INTERNAL_API_KEY || ''
  if (!expected) {
    return { ok: false, reason: 'INTERNAL_API_KEY env not set on this deployment' }
  }
  if (!headerKey) {
    return { ok: false, reason: 'Missing x-api-key header' }
  }
  if (headerKey !== expected) {
    return { ok: false, reason: 'Invalid x-api-key' }
  }
  return { ok: true }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', detail: auth.reason, code: 'E-JOURNEY-AUTH' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-JOURNEY-JSON' },
      { status: 400 },
    )
  }

  const validated = validateDispatchRequest(body)
  if (!validated.ok || !validated.data) {
    return NextResponse.json(
      { ok: false, error: 'validation_failed', detail: validated.error, code: 'E-JOURNEY-VALIDATE' },
      { status: 400 },
    )
  }

  try {
    const result = await dispatchJourney(validated.data)
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json(
      { ok: false, error: 'dispatch_failed', detail: msg, code: 'E-JOURNEY-DISPATCH' },
      { status: 500 },
    )
  }
}
