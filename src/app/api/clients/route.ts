/**
 * GET /api/clients — list active clients from the `clients` table.
 *
 * Many workflows iterate over the client list to run cron jobs per client.
 * Supports filter by status (default 'active') and basic pagination.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'active'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)

  const supabase = getSupabaseAdmin()
  // `clients` table has minimal columns (legacy schema) — request generous select
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', status)
    .limit(limit)

  if (error) {
    // If the status column doesn't exist, fall back to unfiltered
    const fallback = await supabase.from('clients').select('*').limit(limit)
    if (fallback.error) {
      return NextResponse.json({ error: 'db_error', detail: fallback.error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, clients: fallback.data || [], count: fallback.data?.length ?? 0, filter: 'none_fallback' })
  }

  return NextResponse.json({ ok: true, clients: data || [], count: data?.length ?? 0, filter: { status, limit } })
}
