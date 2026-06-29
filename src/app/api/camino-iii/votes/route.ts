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
import { isVotingReviewer } from '@/lib/camino-iii/reviewers'
import { filterValidCorrections } from '@/lib/camino-iii/corrections'

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
  // Corrections parsed from the agent's JSON output (raw_agent_output path).
  // Used as the fallback source for validateCorrectionsForVote so a `red` vote
  // emitted by an agent (which carries its corrections inline) is accepted
  // without the n8n node having to re-parse + forward them as body.corrections.
  let parsedCorrections: unknown = null

  if (typeof body.raw_agent_output === 'string' && body.raw_agent_output.length > 0) {
    const parsed = parseAgentVoteResponse(body.raw_agent_output, reviewerAgent)
    vote = parsed.vote
    rationale = parsed.rationale ?? ''
    confidence = parsed.confidence ?? null
    parsedCorrections = parsed.corrections ?? null
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

  // ── Camino III lazo de corrección · hardening de seguridad (2026-06-29) ──
  // Un voto `red` (REJECT) idealmente trae corrections accionables, pero NUNCA
  // debe dropearse por una corrección malformada: un red perdido = falso
  // `approved` (el bloqueo del revisor se pierde · bug de seguridad). Filtramos
  // LENIENTE — descartamos las inválidas, conservamos las válidas — y SIEMPRE
  // registramos el voto. Las válidas se persisten en camino_iii_votes.corrections
  // y se consolidan a editorial_decisions para viajar al creador.
  const { valid: corrections, dropped: droppedCorrections } = filterValidCorrections(
    body.corrections ?? parsedCorrections,
  )
  if (droppedCorrections > 0) {
    console.warn(
      `[camino-vote] ${reviewerAgent} · ${droppedCorrections} corrección(es) inválida(s) descartada(s) · vote=${vote}`,
    )
  }
  if (vote === 'red' && corrections.length === 0) {
    // El bloqueo cuenta igual · pero el creador queda sin feedback accionable.
    console.warn(
      `[camino-vote] ${reviewerAgent} · voto RED sin corrections válidas · se registra (preserva el bloqueo) · sin feedback para el creador`,
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
        // Advisors (GPT-5.5 · qa-advisor-D) record their review but are excluded
        // from the gate tally · SQL camino_iii_tabulate counts is_voting=true only.
        is_voting: isVotingReviewer(reviewerAgent),
        vote,
        rationale,
        confidence,
        concerns,
        corrections,
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
