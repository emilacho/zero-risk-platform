/**
 * GET /api/contacts/relationships?client_id=<uuid>
 *
 * Sprint 6 Track A2 · Stack V4 GHL-Out · replaces deprecated
 * `/api/ghl/relationships?client_id=…` consumed by Account Health Score
 * Daily + Churn Prediction 90d workflows in n8n.
 *
 * Returns directional edges from `contact_relationships` for any contact
 * (champion) belonging to the given client_id. Used by analytics workflows
 * that compute "relationship thread density" per account.
 *
 * Response shape ·
 *   { ok, client_id, relationships: [{from, to, type, strength, ...}], count }
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
    const { data: champions, error: cErr } = await supabase
      .from('client_champions')
      .select('id')
      .eq('client_id', clientId)
    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 })
    }
    const championIds = (champions ?? []).map((c) => c.id)
    if (championIds.length === 0) {
      return NextResponse.json({
        ok: true,
        client_id: clientId,
        relationships: [],
        count: 0,
      })
    }

    const { data: rels, error: rErr } = await supabase
      .from('contact_relationships')
      .select('*')
      .or(
        championIds.map((id) => `from_contact_id.eq.${id},to_contact_id.eq.${id}`).join(','),
      )
      .limit(500)
    if (rErr) {
      return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      client_id: clientId,
      relationships: rels ?? [],
      count: (rels ?? []).length,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
