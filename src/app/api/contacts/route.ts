/**
 * GET /api/contacts?client_id=<uuid>&limit=<n>&offset=<n>
 *
 * Sprint 6 Track A · Stack V4 native CRM read endpoint on platform repo.
 * Used by ·
 *   - RFM Segmentation Nightly workflow (replaces leadconnectorhq direct call)
 *   - Generic n8n workflows that previously hit `/api/ghl/...` for contacts
 *
 * Returns champions for a client (paginated). NOT a write endpoint · POST
 * + PATCH + DELETE live in the dashboard repo per Sprint 4 PR #17 canon.
 *
 * Response · { ok, rows, total, limit, offset }
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)
  const tag = url.searchParams.get('tag')

  try {
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('client_champions')
      .select(
        'id, client_id, champion_name, champion_role, champion_email, champion_phone, relationship_strength, influence_level, last_contact_at, notes, metadata, created_at, updated_at',
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (clientId) query = query.eq('client_id', clientId)
    const { data: rows, error, count } = await query
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    let result = rows ?? []
    if (tag) {
      // Tag filter requires a second hop · fetch matching contact_tags then filter.
      const { data: tagRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag', tag)
      const allowed = new Set((tagRows ?? []).map((t) => t.contact_id))
      result = result.filter((r) => allowed.has(r.id))
    }

    return NextResponse.json({
      ok: true,
      rows: result,
      total: count ?? result.length,
      limit,
      offset,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
