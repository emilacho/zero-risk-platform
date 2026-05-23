/**
 * GET /api/contacts/expansion-signals?client_id=<uuid>
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/expansion-intent?client_id=…` consumed by the Expansion
 * Readiness Scanner (Fridays 2pm) workflow.
 *
 * Reads `client_expansion_signals` rows for the given client, returning
 * an array of expansion intent indicators captured by any agent or
 * workflow (e.g. champion mentions, usage spikes, executive escalations).
 *
 * Response · { ok, client_id, signals: SignalRow[], count }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'client_id_required' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('client_expansion_signals')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      // Table may not exist yet in some environments · return empty signals
      // so the upstream scanner can still proceed without 500.
      if (error.code === '42P01') {
        return NextResponse.json({
          ok: true,
          client_id: clientId,
          signals: [],
          count: 0,
          note: 'client_expansion_signals table not present · returning empty',
        })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      client_id: clientId,
      signals: data ?? [],
      count: (data ?? []).length,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
