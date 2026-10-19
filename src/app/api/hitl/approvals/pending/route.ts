/**
 * HITL Approvals — PENDING list (V3)
 *
 * Called by HITL Inbox Processor workflow (cron every 15 min).
 * Returns items from the single inbox (`hitl_queue`, arreglo 3 · 19-oct) filtered by status, in the legacy approval shape.
 *
 * GET ?status=pending&limit=100
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { aprobacionLegada, listarAprobaciones } from '@/lib/hitl/bandeja'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '100'), 500)
  const client_id = request.nextUrl.searchParams.get('client_id')

  // La bandeja es una sola (`hitl_queue`): la lista conserva la forma de aprobación de siempre (item_id, approval_type…).
  const { filas, error } = await listarAprobaciones(getSupabaseAdmin(), { estado: status, limite: limit, clienteId: client_id })

  if (error) {
    console.error('[hitl/approvals/pending] query error:', error)
    return NextResponse.json({ error: 'db_error', detail: error }, { status: 500 })
  }

  const items = filas.map(aprobacionLegada)
  return NextResponse.json({
    items,
    count: items.length,
  })
}
