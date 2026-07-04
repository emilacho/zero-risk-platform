/**
 * Tests · central model config (src/lib/models.ts). Guards against the drift
 * that broke onboarding discovery (`claude-sonnet-4-20250514` → 404).
 */
import { describe, it, expect } from 'vitest'
import { MODELS, DEFAULT_ANALYSIS_MODEL, resolveModel } from '../src/lib/models'

describe('models · central config', () => {
  it('current Sonnet id matches the agent-runner MODEL_MAP', () => {
    expect(MODELS.sonnet).toBe('claude-sonnet-4-6')
    expect(DEFAULT_ANALYSIS_MODEL).toBe('claude-sonnet-4-6')
  })

  it('resolveModel · empty/unknown → default Sonnet', () => {
    expect(resolveModel()).toBe('claude-sonnet-4-6')
    expect(resolveModel(null)).toBe('claude-sonnet-4-6')
    expect(resolveModel('whatever-unknown')).toBe('claude-sonnet-4-6')
  })

  it('resolveModel · aliases resolve to current ids', () => {
    expect(resolveModel('claude-sonnet')).toBe('claude-sonnet-4-6')
    expect(resolveModel('claude-opus')).toBe('claude-opus-4-6')
    expect(resolveModel('claude-haiku')).toBe('claude-haiku-4-5-20251001')
  })

  it('resolveModel · the drifted 404 id maps to current Sonnet (defensive)', () => {
    expect(resolveModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-6')
  })

  it('never returns a deprecated id', () => {
    for (const k of ['claude-sonnet-4-20250514', 'nope', undefined, 'claude-sonnet'])
      expect(resolveModel(k)).not.toBe('claude-sonnet-4-20250514')
  })
})
