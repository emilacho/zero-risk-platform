/**
 * Sprint 7.6 Track B · Camino III vote tabulation tests
 *
 * Validates the canonical 3-of-N gate decision matrix per spec ·
 *   ≥2 green AND 0 red    → approved
 *   ≥2 red                → rejected
 *   otherwise             → escalated_hitl
 *
 * Pure function tests · NO DB · NO HTTP · fast.
 */
import { describe, it, expect } from 'vitest'
import {
  tabulateVotes,
  parseAgentVoteResponse,
  resolveReviewerPosition,
  CANONICAL_REVIEWER_POSITIONS,
  type VoteRecord,
} from '@/lib/camino-iii/tabulate'

function v(reviewer: string, vote: 'green' | 'amber' | 'red'): VoteRecord {
  return { reviewer_agent: reviewer, vote, rationale: 'test' }
}

describe('Camino III · tabulateVotes · gate decision matrix', () => {
  it('3 green → approved', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'green'), v('c', 'green')])
    expect(r.status).toBe('approved')
    expect(r.votes).toEqual({ green: 3, amber: 0, red: 0, total: 3 })
    expect(r.decision_reason).toContain('majority green')
  })

  it('2 green + 1 amber → approved (majority confidence · no red blocks)', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'green'), v('c', 'amber')])
    expect(r.status).toBe('approved')
    expect(r.votes.green).toBe(2)
    expect(r.votes.amber).toBe(1)
  })

  it('2 green + 1 red → escalated_hitl (split decision · red blocks)', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'green'), v('c', 'red')])
    expect(r.status).toBe('escalated_hitl')
    expect(r.decision_reason).toContain('split decision')
  })

  it('1 green + 2 amber → escalated_hitl (no majority)', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'amber'), v('c', 'amber')])
    expect(r.status).toBe('escalated_hitl')
  })

  it('1 green + 1 amber + 1 red → escalated_hitl (true split)', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'amber'), v('c', 'red')])
    expect(r.status).toBe('escalated_hitl')
  })

  it('2 red + 1 green → rejected (majority red overrides single green)', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'red'), v('c', 'red')])
    expect(r.status).toBe('rejected')
    expect(r.decision_reason).toContain('majority red')
  })

  it('3 red → rejected (strong reject)', () => {
    const r = tabulateVotes([v('a', 'red'), v('b', 'red'), v('c', 'red')])
    expect(r.status).toBe('rejected')
    expect(r.votes.red).toBe(3)
  })

  it('3 amber → escalated_hitl (cautious unanimous)', () => {
    const r = tabulateVotes([v('a', 'amber'), v('b', 'amber'), v('c', 'amber')])
    expect(r.status).toBe('escalated_hitl')
  })

  it('2 amber + 1 red → escalated_hitl (single red not majority)', () => {
    const r = tabulateVotes([v('a', 'amber'), v('b', 'amber'), v('c', 'red')])
    expect(r.status).toBe('escalated_hitl')
  })

  it('1 amber + 2 red → rejected (majority red)', () => {
    const r = tabulateVotes([v('a', 'amber'), v('b', 'red'), v('c', 'red')])
    expect(r.status).toBe('rejected')
  })

  it('pending · 0 votes collected', () => {
    const r = tabulateVotes([])
    expect(r.status).toBe('pending')
    expect(r.decision_reason).toContain('0/3 collected')
  })

  it('pending · 1 vote collected of 3 expected', () => {
    const r = tabulateVotes([v('a', 'green')])
    expect(r.status).toBe('pending')
    expect(r.decision_reason).toContain('1/3')
  })

  it('pending · 2 votes collected of 3 expected', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'green')])
    expect(r.status).toBe('pending')
    expect(r.decision_reason).toContain('2/3')
  })

  it('respects expectedVotes parameter · 2-reviewer setup', () => {
    const r = tabulateVotes([v('a', 'green'), v('b', 'green')], 2)
    expect(r.status).toBe('approved')
    expect(r.expected_votes).toBe(2)
  })

  it('respects expectedVotes parameter · 1-reviewer setup', () => {
    const r = tabulateVotes([v('a', 'green')], 1)
    // 1 green is "≥2 green AND 0 red" false · single vote escalates
    expect(r.status).toBe('escalated_hitl')
  })
})

describe('Camino III · resolveReviewerPosition', () => {
  it('resolves canonical agent name to position', () => {
    expect(resolveReviewerPosition('editor-en-jefe')).toBe('qa-reviewer-A')
    expect(resolveReviewerPosition('brand-strategist')).toBe('qa-reviewer-B')
    expect(resolveReviewerPosition('jefe-client-success')).toBe('qa-reviewer-C')
  })

  it('resolves position alias to itself', () => {
    expect(resolveReviewerPosition('qa-reviewer-A')).toBe('qa-reviewer-A')
  })

  it('returns null for non-reviewer agents', () => {
    expect(resolveReviewerPosition('jefe-marketing')).toBeNull()
    expect(resolveReviewerPosition('seo-orchestrator')).toBeNull()
  })

  it('CANONICAL_REVIEWER_POSITIONS map has exactly 3 entries · matches PR #72 alias canonization', () => {
    expect(Object.keys(CANONICAL_REVIEWER_POSITIONS).length).toBe(3)
    expect(CANONICAL_REVIEWER_POSITIONS['qa-reviewer-A']).toBe('editor-en-jefe')
    expect(CANONICAL_REVIEWER_POSITIONS['qa-reviewer-B']).toBe('brand-strategist')
    expect(CANONICAL_REVIEWER_POSITIONS['qa-reviewer-C']).toBe('jefe-client-success')
  })
})

describe('Camino III · parseAgentVoteResponse', () => {
  it('parses markdown-fenced JSON response', () => {
    const raw = '```json\n{"vote":"green","rationale":"matches brand voice","confidence":0.85}\n```'
    const r = parseAgentVoteResponse(raw, 'editor-en-jefe')
    expect(r.vote).toBe('green')
    expect(r.rationale).toBe('matches brand voice')
    expect(r.confidence).toBe(0.85)
  })

  it('parses loose JSON object embedded in text', () => {
    const raw = 'Here is my vote: {"vote":"red","rationale":"factual error in claim X"} ·END'
    const r = parseAgentVoteResponse(raw, 'brand-strategist')
    expect(r.vote).toBe('red')
    expect(r.rationale).toBe('factual error in claim X')
  })

  it('parses line-based "vote: X" format', () => {
    const raw = 'vote: amber\nrationale: ICP fit unclear · needs more evidence\nother text'
    const r = parseAgentVoteResponse(raw, 'jefe-client-success')
    expect(r.vote).toBe('amber')
    expect(r.rationale).toContain('ICP fit')
  })

  it('returns amber + parse failure rationale on unparseable input', () => {
    const r = parseAgentVoteResponse('blah blah no structured vote here', 'editor-en-jefe')
    expect(r.vote).toBe('amber')
    expect(r.rationale).toContain('parse failure')
  })

  it('returns amber on invalid vote value', () => {
    const r = parseAgentVoteResponse('{"vote":"orange","rationale":"x"}', 'editor-en-jefe')
    expect(r.vote).toBe('amber')
    expect(r.rationale).toContain('invalid vote value')
  })

  it('handles case-insensitive vote values', () => {
    const r = parseAgentVoteResponse('{"vote":"GREEN","rationale":"ok"}', 'editor-en-jefe')
    expect(r.vote).toBe('green')
  })

  it('discards out-of-range confidence', () => {
    const r = parseAgentVoteResponse('{"vote":"green","rationale":"ok","confidence":1.5}', 'editor-en-jefe')
    expect(r.confidence).toBeNull()
  })

  it('extracts corrections[] from a red vote (red+corrections fix)', () => {
    const raw =
      '{"vote":"red","rationale":"choca con el posicionamiento","corrections":[' +
      '{"eje":"posicionamiento","severidad":"red","donde":"headline","problema":"contradice el core",' +
      '"por_que":"el brand book ancla a cocina costera","cambio_sugerido":"usar brunch costero"}]}'
    const r = parseAgentVoteResponse(raw, 'brand-strategist')
    expect(r.vote).toBe('red')
    expect(Array.isArray(r.corrections)).toBe(true)
    expect(r.corrections).toHaveLength(1)
    expect((r.corrections![0] as Record<string, unknown>).eje).toBe('posicionamiento')
  })

  it('returns empty corrections[] when the agent emits none', () => {
    const r = parseAgentVoteResponse('{"vote":"green","rationale":"ok"}', 'editor-en-jefe')
    expect(r.corrections).toEqual([])
  })
})
