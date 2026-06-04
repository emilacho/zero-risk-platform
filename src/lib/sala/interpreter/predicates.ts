/**
 * Canonical predicate registry · Sprint 12 Fase 0 Ronda 3 Track G.
 *
 * NAMED predicates referenced by libreto `when` fields. Adding a new
 * predicate = adding an entry HERE · reviewed at commit time. The
 * libreto NEVER carries arbitrary code · Opus §H-b ratifies this
 * cleanly: data on one side, code on the other, no eval.
 *
 * Naming convention · `domain.action_or_state` ·
 * - `classification.*`  · checks on RUFLO classification output
 * - `recommendation.*`  · checks on agent recommendation output
 * - `branch.*`          · join-readiness checks against the blackboard
 * - `flag.*`            · boolean flags on event/blackboard
 *
 * Adding a predicate · pick a name following the convention, add an
 * entry to `CANONICAL_PREDICATES`, document the contract in a JSDoc
 * comment, add a test in `__tests__/sala-interpreter-predicates.test.ts`.
 */
import type {
  Predicate,
  PredicateContext,
  PredicateRegistry,
} from './types'

// ─── Built-in canonical predicates ──────────────────────────────────
//
// These cover every `when` reference used by the 6 canonical libretos
// shipped in PR #145 (after the rename in this PR). The list grows
// additively · existing entries are NEVER mutated (the libreto carries
// a name; if the predicate behind the name changes, that is a code
// review event).

export const CANONICAL_PREDICATES: Readonly<Record<string, Predicate>> = {
  // ─── Classification predicates (RUFLO output) ─────────────────────

  /** `event.classification.kind === "email_lifecycle"` */
  'classification.is_email_lifecycle': (ctx) =>
    ctx.event.classification?.kind === 'email_lifecycle',

  /** `event.classification.kind === "social_engagement"` */
  'classification.is_social_engagement': (ctx) =>
    ctx.event.classification?.kind === 'social_engagement',

  /** `event.classification.kind === "review_received"` */
  'classification.is_review_received': (ctx) =>
    ctx.event.classification?.kind === 'review_received',

  /** `event.classification.fit === "high"` · lead qualification */
  'classification.fit_is_high': (ctx) =>
    ctx.event.classification?.fit === 'high',

  /** `event.classification.fit === "medium"` */
  'classification.fit_is_medium': (ctx) =>
    ctx.event.classification?.fit === 'medium',

  /** `event.classification.fit === "low"` */
  'classification.fit_is_low': (ctx) =>
    ctx.event.classification?.fit === 'low',

  // ─── Recommendation predicates (sales-qualifier output) ───────────

  /** `event.payload.recommendation === "reach_out"` */
  'recommendation.is_reach_out': (ctx) =>
    ctx.event.payload?.recommendation === 'reach_out',

  /** `event.payload.recommendation === "nurture"` */
  'recommendation.is_nurture': (ctx) =>
    ctx.event.payload?.recommendation === 'nurture',

  /** `event.payload.recommendation === "drop"` */
  'recommendation.is_drop': (ctx) =>
    ctx.event.payload?.recommendation === 'drop',
}

// ─── Registry factory ───────────────────────────────────────────────

/** Build a predicate registry. By default seeds with the canonical
 *  set; tests pass `seed: {}` to start empty or `seed: { ... }` to
 *  swap in stubs. */
export function createPredicateRegistry(
  seed: Readonly<Record<string, Predicate>> = CANONICAL_PREDICATES,
): PredicateRegistry {
  const map = new Map<string, Predicate>(Object.entries(seed))
  return {
    has(name: string): boolean {
      return map.has(name)
    },
    evaluate(name: string, ctx: PredicateContext): boolean | undefined {
      const fn = map.get(name)
      if (!fn) return undefined
      try {
        return Boolean(fn(ctx))
      } catch {
        // A predicate that throws is a code bug · treat as "false" so
        // the router can fall through to its default + flag the issue.
        // We deliberately do not surface the exception to the caller
        // because predicates are NOT user input · they are reviewed
        // code · throws here should be caught upstream during tests.
        return false
      }
    },
    list(): ReadonlyArray<string> {
      return [...map.keys()].sort()
    },
    register(name: string, fn: Predicate): void {
      map.set(name, fn)
    },
  }
}

/** Single canonical registry singleton bound at module load · the
 *  router uses this in production. Tests build fresh registries via
 *  `createPredicateRegistry({})` when isolation matters. */
export const canonicalPredicateRegistry: PredicateRegistry =
  createPredicateRegistry(CANONICAL_PREDICATES)
