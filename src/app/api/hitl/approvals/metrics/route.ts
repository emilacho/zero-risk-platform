/**
 * HITL Approvals — METRICS (V3)
 *
 * Called by HITL Inbox Processor at the end of each 15-min cycle.
 * Writes one row to hitl_cycle_metrics for trend analysis.
 *
 * POST body:
 *   {
 *     cycle_id: string,
 *     queue_depth: number,
 *     items_expired: number,
 *     items_escalated: number,
 *     items_renotified: number,
 *     cycle_timestamp?: string (ISO)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const row = {
    queue_depth: Number(body.queue_depth) || 0,
    items_renotified: Number(body.items_renotified) || 0,
    items_expired: Number(body.items_expired) || 0,
    items_escalated: Number(body.items_escalated) || 0,
    cycle_timestamp: body.cycle_timestamp || new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('hitl_cycle_metrics')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[hitl/approvals/metrics] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, cycle_id: data.cycle_id })
}
