/**
 * §144 · CC#2 · Camino III reviewer slot interface tests.
 *
 * Guarantees the 4th slot is advisory (non-voting) and model-agnostic.
 * Pure config tests · NO DB · NO HTTP. The gate math wiring lands in PR #188.
 */
import { describe, it, expect } from 'vitest'
import {
  getReviewerSlots,
  getVotingSlots,
  getAdvisorySlots,
  getAdvisorModel,
  isAdvisory,
  ADVISOR_MODEL_DEFAULT,
  ADVISOR_MODEL_ENV,
} from '@/lib/camino-iii/reviewer-slots'

describe('Camino III · reviewer slots · interface', () => {
  it('exposes exactly 3 voting + 1 advisory slot', () => {
    expect(getReviewerSlots()).toHaveLength(4)
    expect(getVotingSlots()).toHaveLength(3)
    expect(getAdvisorySlots()).toHaveLength(1)
  })

  it('the 4th slot is the GPT-5.5 advisor · role advisory · qa-advisor-D', () => {
    const advisor = getAdvisorySlots()[0]
    expect(advisor.position).toBe('qa-advisor-D')
    expect(advisor.role).toBe('advisory')
    expect(advisor.agent).toBe('gpt-5.5-advisor')
  })

  it('no advisory slot leaks into the voting set (matrix math untouched)', () => {
    expect(getVotingSlots().every((s) => s.role === 'voting')).toBe(true)
    expect(getVotingSlots().some((s) => s.position === 'qa-advisor-D')).toBe(false)
  })

  it('isAdvisory true for advisor position/agent · false for voters', () => {
    expect(isAdvisory('qa-advisor-D')).toBe(true)
    expect(isAdvisory('gpt-5.5-advisor')).toBe(true)
    expect(isAdvisory('editor-en-jefe')).toBe(false)
    expect(isAdvisory('qa-reviewer-A')).toBe(false)
  })

  it('advisor model is config-driven · default gpt-5.5 · env-overridable', () => {
    const prev = process.env[ADVISOR_MODEL_ENV]
    delete process.env[ADVISOR_MODEL_ENV]
    expect(getAdvisorModel()).toBe(ADVISOR_MODEL_DEFAULT)

    process.env[ADVISOR_MODEL_ENV] = 'some-other-model'
    expect(getAdvisorModel()).toBe('some-other-model')
    expect(getAdvisorySlots()[0].model).toBe('some-other-model')

    if (prev === undefined) delete process.env[ADVISOR_MODEL_ENV]
    else process.env[ADVISOR_MODEL_ENV] = prev
  })
})
