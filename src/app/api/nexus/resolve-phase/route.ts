/**
 * POST /api/nexus/resolve-phase — replaces NEXUS "Resolve Phase" Code node.
 *
 * Pass-through resolver: picks the current_phase from either Advance to Next
 * Phase output, Parse & Validate Request output, or defaults to DISCOVER.
 * Keeps state flowing through the retry loop without using a Code node (which
 * causes VM2 sandbox TIMEOUT_NO_EXEC on Railway).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

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
    const _v = validateObject<Record<string, unknown>>(body, 'nexus-action')
    if (!_v.ok) return _v.response

    const current_phase =
      (typeof body.advance_current_phase === 'string' && body.advance_current_phase) ||
      (typeof body.parse_current_phase === 'string' && body.parse_current_phase) ||
      (typeof body.current_phase === 'string' && body.current_phase) ||
      'DISCOVER'

    return NextResponse.json({
      ...body,
      ok: true,
      current_phase,
      request_id: body.request_id || body.parse_request_id || null,
      client_id: body.client_id || body.parse_client_id || null,
      campaign_brief: body.campaign_brief || body.parse_campaign_brief || null,
      priority: body.priority || body.parse_priority || 'normal',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: false,
      current_phase: 'DISCOVER',
      handler_error: msg.slice(0, 400),
    })
  }
}
