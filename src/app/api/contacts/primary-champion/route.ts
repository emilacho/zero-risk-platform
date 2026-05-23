/**
 * GET /api/contacts/primary-champion?client_id=<uuid>
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/primary-champion?client_id=…` consumed by NPS+CSAT Monthly
 * Pulse workflow.
 *
 * Returns the highest-influence champion for a given client. Selection
 * heuristic · ORDER BY influence_level (executive > high > medium > low),
 * THEN relationship_strength (very_strong > strong > medium > weak),
 * THEN updated_at DESC. Returns null contact if no champion found.
 *
 * Response · { ok, client_id, contact: ChampionRow | null }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INFLUENCE_ORDER: Record<string, number> = {
  executive: 4,
  high: 3,
  medium: 2,
  low: 1,
}
const STRENGTH_ORDER: Record<string, number> = {
  very_strong: 4,
  strong: 3,
  medium: 2,
  weak: 1,
}

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
      .from('client_champions')
      .select('*')
      .eq('client_id', clientId)
      .limit(50)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    const rows = data ?? []
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, client_id: clientId, contact: null })
    }
    rows.sort((a, b) => {
      const ai = INFLUENCE_ORDER[a.influence_level] ?? 0
      const bi = INFLUENCE_ORDER[b.influence_level] ?? 0
      if (ai !== bi) return bi - ai
      const as = STRENGTH_ORDER[a.relationship_strength] ?? 0
      const bs = STRENGTH_ORDER[b.relationship_strength] ?? 0
      if (as !== bs) return bs - as
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    })
    return NextResponse.json({ ok: true, client_id: clientId, contact: rows[0] })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
