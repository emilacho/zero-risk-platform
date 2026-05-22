/**
 * POST /api/camino-iii/votes · Sprint 7.6 Track B · CC#2
 *
 * Record a single reviewer vote against an existing review.
 *
 * Auto-tabulates · if N votes collected (matching review.expected_votes_count)
 * the SQL trigger `camino_iii_tabulate(review_id)` is invoked to update review
 * status + decision_reason atomically.
 *
 * Idempotent · UNIQUE (review_id, reviewer_agent) · re-posting same vote
 * returns 200 deduped.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import {
  parseAgentVoteResponse,
  resolveReviewerPosition,
  type Vote,
} from '@/lib/camino-iii/tabulate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_VOTES: ReadonlySet<Vote> = new Set(['green', 'amber', 'red'])

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
      { error: 'invalid_json', code: 'E-CAMINO-VOTE-JSON' },
      { status: 400 },
    )
  }

  const reviewId = typeof body.review_id === 'string' ? body.review_id : ''
  const reviewerAgent = typeof body.reviewer_agent === 'string' ? body.reviewer_agent.trim() : ''

  if (!UUID_RE.test(reviewId)) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-CAMINO-VOTE-REVIEW-ID', detail: 'review_id must be uuid' },
      { status: 400 },
    )
  }
  if (!reviewerAgent) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-CAMINO-VOTE-AGENT', detail: 'reviewer_agent required' },
      { status: 400 },
    )
  }

  // Two input modes ·
  //   (a) structured · explicit vote + rationale fields
  //   (b) raw_agent_output · LLM response string · parse it
  let vote: Vote
  let rationale: string
  let confidence: number | null = null
  let concerns: unknown[] = []
  let rawOutput: unknown = null

  if (typeof body.raw_agent_output === 'string' && body.raw_agent_output.length > 0) {
    const parsed = parseAgentVoteResponse(body.raw_agent_output, reviewerAgent)
    vote = parsed.vote
    rationale = parsed.rationale ?? ''
    confidence = parsed.confidence ?? null
    rawOutput = body.raw_agent_output
  } else {
    const voteRaw = typeof body.vote === 'string' ? body.vote.toLowerCase() : ''
    if (!VALID_VOTES.has(voteRaw as Vote)) {
      return NextResponse.json(
        {
          error: 'validation_error',
          code: 'E-CAMINO-VOTE-VALUE',
          detail: 'vote must be green | amber | red · OR provide raw_agent_output to parse',
        },
        { status: 400 },
      )
    }
    vote = voteRaw as Vote
    rationale = typeof body.rationale === 'string' ? body.rationale : ''
    confidence = typeof body.confidence === 'number' ? body.confidence : null
    concerns = Array.isArray(body.concerns) ? body.concerns : []
  }

  if (!rationale) {
    return NextResponse.json(
      {
        error: 'validation_error',
        code: 'E-CAMINO-VOTE-RATIONALE',
        detail: 'rationale required · explain why vote was cast',
      },
      { status: 400 },
    )
  }

  const reviewerPosition = resolveReviewerPosition(reviewerAgent)

  try {
    const supabase = getSupabaseAdmin()
    const { data: voteRow, error: voteErr } = await supabase
      .from('camino_iii_votes')
      .insert({
        review_id: reviewId,
        reviewer_agent: reviewerAgent,
        reviewer_position: reviewerPosition,
        vote,
        rationale,
        confidence,
        concerns,
        raw_agent_output: rawOutput,
        agent_invocation_id: typeof body.agent_invocation_id === 'string' ? body.agent_invocation_id : null,
        duration_ms: typeof body.duration_ms === 'number' ? body.duration_ms : null,
        cost_usd: typeof body.cost_usd === 'number' ? body.cost_usd : null,
      })
      .select()
      .single()

    if (voteErr) {
      if (voteErr.code === '23505') {
        return NextResponse.json(
          { ok: true, deduped: true, code: 'E-CAMINO-VOTE-DUP' },
          { status: 200 },
        )
      }
      if (voteErr.code === '23503') {
        return NextResponse.json(
          { error: 'not_found', code: 'E-CAMINO-VOTE-REVIEW-404', detail: 'review_id does not exist' },
          { status: 404 },
        )
      }
      return NextResponse.json(
        { error: 'db_error', code: 'E-CAMINO-VOTE', detail: voteErr.message },
        { status: 500 },
      )
    }

    // Trigger SQL tabulation · updates review.status if N votes collected
    const { data: tabResult } = await supabase.rpc('camino_iii_tabulate', { p_review_id: reviewId })

    return NextResponse.json(
      {
        ok: true,
        vote: voteRow,
        tabulation: tabResult ?? null,
      },
      { status: 201 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-CAMINO-VOTE-EXC', detail: msg },
      { status: 500 },
    )
  }
}
