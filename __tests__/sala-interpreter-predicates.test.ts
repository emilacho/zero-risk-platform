/**
 * Tests for src/lib/sala/interpreter/predicates.ts · Sprint 12 Fase 0
 * Ronda 3 Track G.
 *
 * Coverage ·
 * - Canonical predicates ship with the expected 9 names
 * - Each canonical predicate honours its documented contract
 * - createPredicateRegistry seeds + supports register/has/evaluate/list
 * - Registry returns undefined for unknown names (the failure mode the
 *   interpreter surfaces as `unknown_predicate`)
 * - A predicate that throws is caught and returns false (defensive)
 */
import { describe, it, expect, vi } from 'vitest'
import {
  CANONICAL_PREDICATES,
  canonicalPredicateRegistry,
  createPredicateRegistry,
} from '../src/lib/sala/interpreter/predicates'
import type {
  InterpreterBlackboard,
  InterpreterEvent,
  PredicateContext,
} from '../src/lib/sala/interpreter/types'

// ─── Helpers ───────────────────────────────────────────────────────

function emptyBlackboard(): InterpreterBlackboard {
  return {
    read: () => undefined,
    has: () => false,
  }
}

function buildCtx(event: Partial<InterpreterEvent> = {}): PredicateContext {
  return {
    event: {
      event_type: event.event_type ?? 'classification_decided',
      client_id: event.client_id ?? 'client-test',
      payload: event.payload ?? {},
      classification: event.classification,
      metadata: event.metadata,
    },
    blackboard: emptyBlackboard(),
  }
}

// ─── Canonical predicates · structure ─────────────────────────────

describe('CANONICAL_PREDICATES · structure', () => {
  it('ships every name the 6 canonical libretos reference (after rename)', () => {
    const expected = [
      'classification.is_email_lifecycle',
      'classification.is_social_engagement',
      'classification.is_review_received',
      'classification.fit_is_high',
      'classification.fit_is_medium',
      'classification.fit_is_low',
      'recommendation.is_reach_out',
      'recommendation.is_nurture',
      'recommendation.is_drop',
    ]
    for (const name of expected) {
      expect(CANONICAL_PREDICATES[name]).toBeDefined()
    }
  })

  it('exposes 9 canonical predicates (initial set)', () => {
    expect(Object.keys(CANONICAL_PREDICATES)).toHaveLength(9)
  })

  it('every entry is a function', () => {
    for (const fn of Object.values(CANONICAL_PREDICATES)) {
      expect(typeof fn).toBe('function')
    }
  })
})

// ─── Canonical predicates · behaviour ─────────────────────────────

describe('CANONICAL_PREDICATES · classification kinds', () => {
  const cases: Array<{ name: string; truthy: Partial<InterpreterEvent>; falsy: Partial<InterpreterEvent> }> = [
    {
      name: 'classification.is_email_lifecycle',
      truthy: { classification: { kind: 'email_lifecycle' } },
      falsy: { classification: { kind: 'social_engagement' } },
    },
    {
      name: 'classification.is_social_engagement',
      truthy: { classification: { kind: 'social_engagement' } },
      falsy: { classification: { kind: 'email_lifecycle' } },
    },
    {
      name: 'classification.is_review_received',
      truthy: { classification: { kind: 'review_received' } },
      falsy: { classification: { kind: 'email_lifecycle' } },
    },
  ]
  it.each(cases)('$name returns true on match · false otherwise', ({ name, truthy, falsy }) => {
    const fn = CANONICAL_PREDICATES[name]!
    expect(fn(buildCtx(truthy))).toBe(true)
    expect(fn(buildCtx(falsy))).toBe(false)
    expect(fn(buildCtx({}))).toBe(false)
  })
})

describe('CANONICAL_PREDICATES · fit tiers', () => {
  const tiers: Array<['high' | 'medium' | 'low', string]> = [
    ['high', 'classification.fit_is_high'],
    ['medium', 'classification.fit_is_medium'],
    ['low', 'classification.fit_is_low'],
  ]
  it.each(tiers)('fit %s matches predicate %s', (fit, predicateName) => {
    const fn = CANONICAL_PREDICATES[predicateName]!
    expect(fn(buildCtx({ classification: { fit } }))).toBe(true)
    expect(fn(buildCtx({ classification: { fit: 'other' } }))).toBe(false)
    expect(fn(buildCtx({}))).toBe(false)
  })
})

describe('CANONICAL_PREDICATES · recommendation outputs', () => {
  const recs: Array<['reach_out' | 'nurture' | 'drop', string]> = [
    ['reach_out', 'recommendation.is_reach_out'],
    ['nurture', 'recommendation.is_nurture'],
    ['drop', 'recommendation.is_drop'],
  ]
  it.each(recs)('recommendation %s matches predicate %s', (rec, predicateName) => {
    const fn = CANONICAL_PREDICATES[predicateName]!
    expect(fn(buildCtx({ payload: { recommendation: rec } }))).toBe(true)
    expect(fn(buildCtx({ payload: { recommendation: 'other' } }))).toBe(false)
    expect(fn(buildCtx({}))).toBe(false)
  })
})

// ─── createPredicateRegistry ──────────────────────────────────────

describe('createPredicateRegistry', () => {
  it('seeds with CANONICAL_PREDICATES by default', () => {
    const r = createPredicateRegistry()
    expect(r.has('classification.is_email_lifecycle')).toBe(true)
    expect(r.list().length).toBe(9)
  })

  it('seeds empty when called with {}', () => {
    const r = createPredicateRegistry({})
    expect(r.has('classification.is_email_lifecycle')).toBe(false)
    expect(r.list()).toEqual([])
  })

  it('supports register · adds a new predicate', () => {
    const r = createPredicateRegistry({})
    r.register('test.always_true', () => true)
    expect(r.has('test.always_true')).toBe(true)
    expect(r.evaluate('test.always_true', buildCtx())).toBe(true)
  })

  it('evaluate returns undefined for unknown names', () => {
    const r = createPredicateRegistry({})
    expect(r.evaluate('ghost.predicate', buildCtx())).toBeUndefined()
  })

  it('evaluate returns false when the predicate throws (defensive)', () => {
    const r = createPredicateRegistry({})
    r.register('throws', () => {
      throw new Error('boom')
    })
    expect(r.evaluate('throws', buildCtx())).toBe(false)
  })

  it('list returns sorted names', () => {
    const r = createPredicateRegistry({})
    r.register('z.last', () => true)
    r.register('a.first', () => true)
    r.register('m.middle', () => true)
    expect(r.list()).toEqual(['a.first', 'm.middle', 'z.last'])
  })

  it('register overwrites an existing predicate (last write wins)', () => {
    const r = createPredicateRegistry({})
    const v1 = vi.fn(() => true)
    const v2 = vi.fn(() => false)
    r.register('p', v1)
    r.register('p', v2)
    expect(r.evaluate('p', buildCtx())).toBe(false)
    expect(v1).not.toHaveBeenCalled()
    expect(v2).toHaveBeenCalledOnce()
  })
})

// ─── canonicalPredicateRegistry singleton ─────────────────────────

describe('canonicalPredicateRegistry singleton', () => {
  it('exposes the 9 canonical names', () => {
    expect(canonicalPredicateRegistry.list()).toHaveLength(9)
  })

  it('evaluates a canonical predicate end-to-end', () => {
    const ok = canonicalPredicateRegistry.evaluate(
      'classification.is_email_lifecycle',
      buildCtx({ classification: { kind: 'email_lifecycle' } }),
    )
    expect(ok).toBe(true)
  })
})
