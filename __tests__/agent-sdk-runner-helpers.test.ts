/**
 * Unit tests for agent-sdk-runner internal helpers (Wave 15 · CC#1 · T4 refactor).
 *
 * Pre-W15-T4: agent-sdk-runner.ts had a single 215-line runAgentViaSDK function
 * with no helpers exported → impossible to unit-test without mocking the entire
 * Supabase + Claude SDK chain.
 *
 * W15-T4 refactor extracted 7 internal helpers, two of which are pure and worth
 * dedicated tests:
 *   - _buildSystemPrompt(identity, skills, ctx) → string
 *   - _costFor(model, inTok, outTok)            → number
 *
 * The other 5 (resolveCanonicalSlug, loadAgentConfig, loadSkills, buildSdkOptions,
 * drainStream, logExecution) are integration-tested through runAgentViaSDK at
 * the route level — separate test pass.
 */
import { describe, it, expect } from 'vitest'
import { _buildSystemPrompt, _costFor } from '../src/lib/agent-sdk-runner'

describe('_buildSystemPrompt', () => {
  it('produces identity-only prompt when no skills + no context', () => {
    const out = _buildSystemPrompt('Eres un agente.', [], {})
    expect(out).toContain('# Tu Identidad')
    expect(out).toContain('Eres un agente.')
    expect(out).toContain('# Contexto de Operación')
    expect(out).toContain('Zero Risk')
    expect(out).toContain('Idioma: Español')
  })

  it('appends each skill as a separate section', () => {
    const skills = [
      { name: 'web-research', content: 'Use WebFetch.' },
      { name: 'rag-query', content: 'Query Client Brain.' },
    ]
    const out = _buildSystemPrompt('Identity X', skills, {})
    expect(out).toContain('# Skill: web-research')
    expect(out).toContain('Use WebFetch.')
    expect(out).toContain('# Skill: rag-query')
    expect(out).toContain('Query Client Brain.')
  })

  it('includes pipelineId + stepName when provided', () => {
    const out = _buildSystemPrompt('I', [], { pipelineId: 'pipe-1', stepName: 'brief' })
    expect(out).toContain('Pipeline ID: pipe-1')
    expect(out).toContain('Step: brief')
  })

  it('omits empty context fields cleanly (no trailing blank lines)', () => {
    const out = _buildSystemPrompt('I', [], {})
    expect(out).not.toContain('Pipeline ID:')
    expect(out).not.toContain('Step:')
    expect(out).not.toContain('Extra:')
  })

  it('JSON-serializes extra metadata', () => {
    const out = _buildSystemPrompt('I', [], { extra: { campaign_id: 'c-1', priority: 'high' } })
    expect(out).toContain('Extra:')
    expect(out).toContain('"campaign_id"')
    expect(out).toContain('c-1')
  })

  it('skill ordering follows array order (priority-sorted by caller)', () => {
    const skills = [
      { name: 'first', content: 'A' },
      { name: 'second', content: 'B' },
      { name: 'third', content: 'C' },
    ]
    const out = _buildSystemPrompt('I', skills, {})
    const firstIdx = out.indexOf('first')
    const secondIdx = out.indexOf('second')
    const thirdIdx = out.indexOf('third')
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(secondIdx).toBeLessThan(thirdIdx)
  })
})

describe('_costFor · model pricing detection', () => {
  it('detects sonnet model (default tier)', () => {
    // 1M in + 1M out at sonnet pricing = 3 + 15 = $18
    expect(_costFor('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBe(18)
  })

  it('detects haiku model', () => {
    // 1M in + 1M out at haiku pricing = 1 + 5 = $6
    expect(_costFor('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)).toBe(6)
  })

  it('detects opus model', () => {
    // 1M in + 1M out at opus pricing = 15 + 75 = $90
    expect(_costFor('claude-opus-4-6', 1_000_000, 1_000_000)).toBe(90)
  })

  it('falls back to sonnet pricing for unknown model', () => {
    expect(_costFor('claude-future-9000', 1_000_000, 1_000_000)).toBe(18)
  })

  it('zero tokens → zero cost', () => {
    expect(_costFor('claude-sonnet-4-6', 0, 0)).toBe(0)
  })

  it('partial token amounts produce fractional cost', () => {
    // 100k input at sonnet = 0.3 USD; 0 output
    expect(_costFor('claude-sonnet-4-6', 100_000, 0)).toBeCloseTo(0.3, 5)
  })

  it('matches Sonnet pricing precisely (sanity)', () => {
    const inT = 12_345
    const outT = 6_789
    const expected = (inT / 1_000_000) * 3 + (outT / 1_000_000) * 15
    expect(_costFor('claude-sonnet-4-6', inT, outT)).toBeCloseTo(expected, 8)
  })
})
