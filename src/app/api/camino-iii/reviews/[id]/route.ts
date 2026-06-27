/**
 * GET /api/camino-iii/reviews/[id] · Sprint 7.6 Track B · CC#2
 *
 * Returns review with all collected votes + tabulation result.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { tabulateVotes } from '@/lib/camino-iii/tabulate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-CAMINO-ID', detail: 'id must be uuid' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data: review, error: reviewErr } = await supabase
      .from('camino_iii_reviews')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (reviewErr) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-CAMINO-GET', detail: reviewErr.message },
        { status: 500 },
      )
    }
    if (!review) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-CAMINO-404', detail: `review ${id} not found` },
        { status: 404 },
      )
    }

    const { data: votes } = await supabase
      .from('camino_iii_votes')
      .select('*')
      .eq('review_id', id)
      .order('created_at', { ascending: true })

    const tabulation = tabulateVotes(
      (votes ?? []).map((v) => ({
        reviewer_agent: v.reviewer_agent,
        vote: v.vote,
        rationale: v.rationale,
        confidence: v.confidence,
        // Advisors (is_voting=false) are surfaced in tabulation.advisory, not tallied.
        is_voting: v.is_voting,
      })),
      review.expected_votes_count ?? 3,
    )

    return NextResponse.json({ ok: true, review, votes: votes ?? [], tabulation })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-CAMINO-GET-EXC', detail: msg },
      { status: 500 },
    )
  }
}
