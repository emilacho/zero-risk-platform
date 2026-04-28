/**
 * POST /api/journey/dispatch
 *
 * Master Journey Orchestrator entry point. Recibe trigger (manual desde
 * Mission Control, webhook desde landing page, callback desde sub-workflows,
 * cron 90-day mark) y persiste un row en `client_journey_state` con
 * status='initiated'.
 *
 * Toda la lógica de negocio vive en `src/lib/journey-orchestrator.ts` para
 * que sea testable. Este file es solo la "shell" Next.js: auth + parse + wrap.
 *
 * Spec: docs/05-orquestacion/sprint-3-implementation-pack/02_API_SPEC.md
 * Migration: zero-risk-platform/supabase/migrations/202604280001_client_journey_state.sql
 *
 * Auth: x-api-key header (INTERNAL_API_KEY · server-side shared con n8n)
 *
 * Returns:
 *  201 Created   → { journey_id, status: 'initiated', ... }
 *  400 Bad Request → schema validation failed
 *  401 Unauthorized → missing / invalid x-api-key
 *  404 Not Found  → client_id no existe en `clients` (excepto ACQUIRE)
 *  409 Conflict   → cliente ya tiene journey activo del mismo type
 *  503 Service Unavailable → migration `client_journey_state` no aplicada
 *  500 Internal Error → DB error genérico
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { capture } from '@/lib/posthog'
import { dispatchJourney, type SupabaseLike } from '@/lib/journey-orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) {
      return NextResponse.json(
        { error: 'unauthorized', detail: auth.reason },
        { status: 401 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'validation_error', detail: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin() as unknown as SupabaseLike
    const result = await dispatchJourney(body, { supabase, capture })
    return NextResponse.json(result.body, { status: result.status })
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: 'internal_error',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/journey/dispatch',
    method: 'POST',
    auth: 'x-api-key (INTERNAL_API_KEY)',
    returns: '201 Created · { journey_id, status: "initiated", ... }',
    spec: 'docs/05-orquestacion/sprint-3-implementation-pack/02_API_SPEC.md',
  })
}
