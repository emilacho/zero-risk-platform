/**
 * /api/ingress-quarantine/list · GET pending review canon canonical
 *
 * Spec · ADR-012 §5.3 quarantine workflow + R7 canon canonical
 *
 * Canon canonical · admin-only access via internal-auth canon · service-role
 * bypasea RLS · canon canonical results filtered to pending status by default.
 *
 * NO decrypts payload here · payload_decrypted populated only on detail
 * endpoint canon canonical · operator must canonical-click-into row.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending'
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limitSafe = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ingress_quarantine')
    .select(
      'id, source, ingress_route, payload_size_bytes, gate_decisions, severity, status, hitl_decided_by, hitl_decided_at, hitl_reason, client_id, workflow_id, created_at, expires_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limitSafe)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [], count: data?.length ?? 0 })
}
