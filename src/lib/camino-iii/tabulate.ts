/**
 * src/lib/camino-iii/tabulate.ts · Sprint 7.6 Track B · CC#2
 *
 * Pure function for Camino III 3-of-N vote tabulation. Mirrors the SQL
 * `camino_iii_tabulate(p_review_id)` plpgsql function · same decision matrix ·
 * useful for client-side preview before DB tabulation + test coverage.
 *
 * Canonical 3-of-N gate decision matrix ·
 *   ≥2 green AND 0 red    → approved        (majority confidence · no blocks)
 *   ≥2 red                → rejected        (majority block)
 *   otherwise             → escalated_hitl  (mixed · ambiguous · escalate)
 *
 * "Pending" returned when not enough votes collected yet.
 */

export type Vote = 'green' | 'amber' | 'red'

export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'escalated_hitl'
  | 'expired'
  | 'cancelled'

export interface VoteRecord {
  reviewer_agent: string
  vote: Vote
  rationale?: string
  confidence?: number | null
  /**
   * Whether this record counts toward the gate tally. Defaults to `true`.
   * Non-voting reviewers (e.g. the GPT-5.5 advisor · `qa-advisor-D`) set this
   * to `false` · their review is captured for the editorial record + HITL
   * context but NEVER sways the 3-of-N decision. See `reviewers.ts`.
   */
  is_voting?: boolean
}

/** A non-voting reviewer's review · surfaced for transparency, never tallied. */
export interface AdvisoryRecord {
  reviewer_agent: string
  vote: Vote
  rationale?: string
  confidence?: number | null
}

export interface TabulationResult {
  status: ReviewStatus
  decision_reason: string
  votes: {
    green: number
    amber: number
    red: number
    total: number
  }
  expected_votes: number
  /**
   * Reviews from non-voting reviewers (advisors). Present only when at least
   * one advisory record was supplied. Excluded from `votes` and the gate
   * decision · informational only.
   */
  advisory?: AdvisoryRecord[]
}

/**
 * Pure tabulation function · canonical matrix per Sprint 7.6 vault decision.
 *
 * @param records · array of VoteRecord · order-independent · de-dup by reviewer_agent expected upstream.
 *   Records with `is_voting === false` (advisors · e.g. GPT-5.5) are split out:
 *   captured in `result.advisory` but excluded from the tally + the gate.
 * @param expectedVotes · canonical 3 · configurable for asymmetric setups (1-7 range)
 */
export function tabulateVotes(records: VoteRecord[], expectedVotes = 3): TabulationResult {
  // Only voting reviewers count toward the gate. Advisors (is_voting === false)
  // are surfaced separately and never affect status, counts, or the pending gate.
  const votes = records.filter((v) => v.is_voting !== false)
  const advisors = records.filter((v) => v.is_voting === false)

  const green = votes.filter((v) => v.vote === 'green').length
  const amber = votes.filter((v) => v.vote === 'amber').length
  const red = votes.filter((v) => v.vote === 'red').length
  const total = votes.length

  const advisory: AdvisoryRecord[] | undefined = advisors.length
    ? advisors.map((a) => ({
        reviewer_agent: a.reviewer_agent,
        vote: a.vote,
        rationale: a.rationale,
        confidence: a.confidence ?? null,
      }))
    : undefined

  if (total < expectedVotes) {
    return {
      status: 'pending',
      decision_reason: `awaiting votes · ${total}/${expectedVotes} collected`,
      votes: { green, amber, red, total },
      expected_votes: expectedVotes,
      ...(advisory ? { advisory } : {}),
    }
  }

  let status: ReviewStatus
  let reason: string

  if (green >= 2 && red === 0) {
    status = 'approved'
    reason = `majority green · ${green}/${total} · 0 red blocks`
  } else if (red >= 2) {
    status = 'rejected'
    reason = `majority red · ${red}/${total} reject`
  } else {
    status = 'escalated_hitl'
    reason = `split decision · ${green} green · ${amber} amber · ${red} red · HITL required`
  }

  return {
    status,
    decision_reason: reason,
    votes: { green, amber, red, total },
    expected_votes: expectedVotes,
    ...(advisory ? { advisory } : {}),
  }
}

/**
 * Helper · canonical 3 reviewer positions per Sprint 7 B8 alias canonization
 * (`src/lib/agent-alias-map.ts` · PR #72) ·
 */
export const CANONICAL_REVIEWER_POSITIONS = {
  'qa-reviewer-A': 'editor-en-jefe',
  'qa-reviewer-B': 'brand-strategist',
  'qa-reviewer-C': 'jefe-client-success',
} as const

export type ReviewerPosition = keyof typeof CANONICAL_REVIEWER_POSITIONS

export function resolveReviewerPosition(agent: string): ReviewerPosition | null {
  for (const [pos, canonical] of Object.entries(CANONICAL_REVIEWER_POSITIONS)) {
    if (canonical === agent || pos === agent) return pos as ReviewerPosition
  }
  return null
}

/**
 * Helper · parse an agent's vote response into VoteRecord ·
 * tolerates JSON wrapped in markdown code fence OR loose JSON OR plain text
 * with explicit "vote: green" line. Always returns a VoteRecord (defaults to
 * amber + rationale="parse failure" when input is unrecognizable).
 */
export function parseAgentVoteResponse(
  rawOutput: string,
  reviewerAgent: string,
): VoteRecord {
  let parsed: Record<string, unknown> | null = null

  // Try markdown-fenced JSON first
  const fenceMatch = rawOutput.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenceMatch) {
    try {
      parsed = JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>
    } catch {
      parsed = null
    }
  }

  // Try loose JSON object
  if (!parsed) {
    const jsonStart = rawOutput.indexOf('{')
    const jsonEnd = rawOutput.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }
  }

  // Try line-based "vote: green" pattern
  if (!parsed) {
    const voteLine = rawOutput.match(/^vote\s*[:=]\s*(green|amber|red)/im)
    if (voteLine) {
      const rationaleLine = rawOutput.match(/^rationale\s*[:=]\s*(.+)$/im)
      parsed = {
        vote: voteLine[1].toLowerCase(),
        rationale: rationaleLine ? rationaleLine[1].trim() : '(no rationale provided)',
      }
    }
  }

  if (!parsed) {
    return {
      reviewer_agent: reviewerAgent,
      vote: 'amber',
      rationale: '(parse failure · agent output not recognized · escalate)',
    }
  }

  const voteValue = typeof parsed.vote === 'string' ? parsed.vote.toLowerCase() : ''
  if (!['green', 'amber', 'red'].includes(voteValue)) {
    return {
      reviewer_agent: reviewerAgent,
      vote: 'amber',
      rationale: `(invalid vote value "${voteValue}" · escalate)`,
    }
  }

  const confidence =
    typeof parsed.confidence === 'number' &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : null

  return {
    reviewer_agent: reviewerAgent,
    vote: voteValue as Vote,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    confidence,
  }
}
