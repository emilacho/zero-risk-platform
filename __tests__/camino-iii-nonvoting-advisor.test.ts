/**
 * §144 · CC#2 · Camino III 4th NON-voting reviewer (GPT-5.5 advisor) tests.
 *
 * Guarantees the advisor lane is captured but NEVER sways the 3-of-N gate.
 * Pure function tests · NO DB · NO HTTP.
 */
import { describe, it, expect } from 'vitest'
import { tabulateVotes, type VoteRecord } from '@/lib/camino-iii/tabulate'
import {
  isVotingReviewer,
  caminoIiiAdvisorModel,
  CAMINO_III_ADVISOR_AGENT,
  CAMINO_III_ADVISOR_POSITION,
} from '@/lib/camino-iii/reviewers'

function voter(reviewer: string, vote: 'green' | 'amber' | 'red'): VoteRecord {
  return { reviewer_agent: reviewer, vote, rationale: 'test' }
}
function advisor(vote: 'green' | 'amber' | 'red'): VoteRecord {
  return { reviewer_agent: CAMINO_III_ADVISOR_AGENT, vote, rationale: 'advisory', is_voting: false }
}

describe('Camino III · non-voting advisor · gate isolation', () => {
  it('3 voting green + advisor red → still approved (advisor never blocks)', () => {
    const r = tabulateVotes([voter('a', 'green'), voter('b', 'green'), voter('c', 'green'), advisor('red')])
    expect(r.status).toBe('approved')
    expect(r.votes).toEqual({ green: 3, amber: 0, red: 0, total: 3 })
  })

  it('advisor surfaced in result.advisory · excluded from votes', () => {
    const r = tabulateVotes([voter('a', 'green'), voter('b', 'green'), voter('c', 'amber'), advisor('red')])
    expect(r.advisory).toHaveLength(1)
    expect(r.advisory?.[0]).toMatchObject({ reviewer_agent: CAMINO_III_ADVISOR_AGENT, vote: 'red' })
    expect(r.votes.total).toBe(3)
  })

  it('advisor does NOT count toward the pending gate (2 voters + advisor = 2/3 pending)', () => {
    const r = tabulateVotes([voter('a', 'green'), voter('b', 'green'), advisor('green')])
    expect(r.status).toBe('pending')
    expect(r.decision_reason).toContain('2/3')
  })

  it('2 voting red + advisor green → rejected (advisor cannot rescue)', () => {
    const r = tabulateVotes([voter('a', 'red'), voter('b', 'red'), voter('c', 'green'), advisor('green')])
    expect(r.status).toBe('rejected')
    expect(r.votes.red).toBe(2)
  })

  it('no advisory key when no advisors supplied (backward compatible)', () => {
    const r = tabulateVotes([voter('a', 'green'), voter('b', 'green'), voter('c', 'green')])
    expect(r.advisory).toBeUndefined()
  })
})

describe('Camino III · reviewer registry', () => {
  it('advisor agent + position are non-voting', () => {
    expect(isVotingReviewer(CAMINO_III_ADVISOR_AGENT)).toBe(false)
    expect(isVotingReviewer(CAMINO_III_ADVISOR_POSITION)).toBe(false)
  })

  it('canonical reviewers and ad-hoc agents are voting by default', () => {
    expect(isVotingReviewer('editor-en-jefe')).toBe(true)
    expect(isVotingReviewer('brand-strategist')).toBe(true)
    expect(isVotingReviewer('jefe-client-success')).toBe(true)
    expect(isVotingReviewer('some-other-agent')).toBe(true)
  })

  it('advisor model defaults to gpt-5.5', () => {
    const prev = process.env.CAMINO_III_ADVISOR_MODEL
    delete process.env.CAMINO_III_ADVISOR_MODEL
    expect(caminoIiiAdvisorModel()).toBe('gpt-5.5')
    if (prev !== undefined) process.env.CAMINO_III_ADVISOR_MODEL = prev
  })

  it('advisor model is env-overridable', () => {
    const prev = process.env.CAMINO_III_ADVISOR_MODEL
    process.env.CAMINO_III_ADVISOR_MODEL = 'gpt-5.5-turbo'
    expect(caminoIiiAdvisorModel()).toBe('gpt-5.5-turbo')
    if (prev === undefined) delete process.env.CAMINO_III_ADVISOR_MODEL
    else process.env.CAMINO_III_ADVISOR_MODEL = prev
  })
})
