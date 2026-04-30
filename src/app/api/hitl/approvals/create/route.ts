/**
 * HITL Approvals — CREATE (V3, hardened S33)
 *
 * Called by NEXUS + RUFLO + Landing CRO + Meta Ads + TikTok+LI + Social v2
 * when hitting an HITL gate.
 *
 * Hardened (S33): tolerates missing approval_type with fallback, tolerates DB
 * errors with fallback_mode:true, echoes body scalars so workflow chain keeps
 * $json flowing. Same pattern as stub-handler and evidence/validate.
 *
 * POST body (all optional — route won't 400):
 *   {
 *     approval_type?: string,          // default "generic_approval"
 *     required_approver?: string,      // default "emilio"
 *     escalation_path?: string,
 *     request_id?: string,
 *     client_id?: string,
 *     phase?: string,
 *     payload?: any,
 *     context?: any,                   // accepted as alias for payload
 *     priority?: "low"|"medium"|"high"|"critical",
 *     expires_in_hours?: number        // default 72
 *   }
 *
 * Returns: { ok, item_id, expires_at, ...echoedBody }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(request: NextRequest) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>) : {}

    const expiresHours = typeof body.expires_in_hours === 'number' ? body.expires_in_hours : 72
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString()

    const payload = body.context || body.payload || {}
    const validPriority = new Set(['low', 'medium', 'high', 'critical'])
    const priority = validPriority.has(body.priority as string) ? (body.priority as string) : 'medium'

    const approval_type = (typeof body.approval_type === 'string' && body.approval_type) || 'generic_approval'

    const row = {
      approval_type,
      required_approver: (body.required_approver as string) || 'emilio',
      escalation_path: body.escalation_path || null,
      request_id: body.request_id || null,
      client_id: body.client_id || null,
      phase: body.phase || null,
      priority,
      payload,
      status: 'pending' as const,
      expires_at: expiresAt,
    }

    let item_id: string | null = null
    let dbError: string | null = null
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from('hitl_pending_approvals')
        .insert(row)
        .select()
        .single()
      if (error) {
        dbError = error.message
      } else {
        item_id = data?.item_id ?? null
      }
    } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/hitl/approvals/create',
      source: 'route_handler',
    })
      dbError = e instanceof Error ? e.message : String(e)
    }

    // Echo body scalars so downstream workflow nodes keep $json state
    const echo: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k === 'payload' || k === 'context') continue
      echo[k] = v
    }

    return NextResponse.json({
      ...echo,
      ok: true,
      item_id: item_id || `hitl-stub-${Date.now()}`,
      expires_at: expiresAt,
      approval_type,
      ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
    })
  } catch (e: unknown) {
    captureRouteError(e, request, {
      route: '/api/hitl/approvals/create',
      source: 'route_handler',
    })
    return NextResponse.json({
      ok: true,
      item_id: `hitl-stub-${Date.now()}`,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
