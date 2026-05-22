/**
 * /api/camino-iii/reviews · Sprint 7.6 Track B · CC#2
 *
 * Camino III 3-of-N voting review item header endpoint.
 *
 * GET  · list reviews · admin-gated · ?status filter · ?client_id filter
 * POST · create new review · admin or internal-key · returns review_id
 *
 * Per cascade canon · single-purpose DB endpoint · NO agent invocations.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_ITEM_TYPES = [
  'campaign_brief',
  'content_deliverable',
  'phase_5_qa',
  'landing_copy',
  'email_sequence',
  'ad_creative',
  'manual_review',
  'other',
]

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const clientId = url.searchParams.get('client_id')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  try {
    const supabase = getSupabaseAdmin()
    let q = supabase
      .from('camino_iii_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (status) q = q.eq('status', status)
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-CAMINO-LIST', detail: error.message },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, reviews: data ?? [], count: (data ?? []).length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-CAMINO-LIST-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-CAMINO-JSON' },
      { status: 400 },
    )
  }

  const itemType = typeof body.item_type === 'string' ? body.item_type : ''
  const itemId = typeof body.item_id === 'string' ? body.item_id.trim() : ''

  if (!itemType || !VALID_ITEM_TYPES.includes(itemType)) {
    return NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-CAMINO-ITEM-TYPE',
        detail: `item_type required · must be one of · ${VALID_ITEM_TYPES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  if (!itemId) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-CAMINO-ITEM-ID', detail: 'item_id required' },
      { status: 400 },
    )
  }

  const expectedVotes = typeof body.expected_votes_count === 'number' ? body.expected_votes_count : 3
  if (expectedVotes < 1 || expectedVotes > 7) {
    return NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-CAMINO-EXPECTED-VOTES',
        detail: 'expected_votes_count must be 1-7',
      },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('camino_iii_reviews')
      .insert({
        item_type: itemType,
        item_id: itemId,
        client_id: typeof body.client_id === 'string' ? body.client_id : null,
        campaign_id: typeof body.campaign_id === 'string' ? body.campaign_id : null,
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        expected_votes_count: expectedVotes,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-CAMINO-INSERT', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, review: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-CAMINO-INSERT-EXC', detail: msg },
      { status: 500 },
    )
  }
}
