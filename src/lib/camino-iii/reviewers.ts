/**
 * src/lib/camino-iii/reviewers.ts · Camino III reviewer registry.
 *
 * Single source of truth for WHO reviews and WHETHER their review counts
 * toward the 3-of-N gate decision.
 *
 *   Voting reviewers (3 · canonical) · tally the gate (green/amber/red) ·
 *     qa-reviewer-A → editor-en-jefe        (primary)
 *     qa-reviewer-B → brand-strategist      (secondary)
 *     qa-reviewer-C → jefe-client-success   (tertiary)
 *
 *   Non-voting advisor (1) · review captured but NEVER sways the gate ·
 *     qa-advisor-D  → gpt-5.5-advisor        (GPT-5.5 · cross-model perspective)
 *
 * Rationale · the GPT-5.5 advisor adds an independent cross-model lens (the 3
 * voters are Claude-family agents) without changing the canonical 3-of-N math.
 * Its vote is recorded for the editorial record + HITL context only. Keeping it
 * non-voting preserves the gate matrix proven in Sprint 7.6 while surfacing a
 * dissenting outside opinion when one exists.
 *
 * See `tabulate.ts` for the gate math (advisors filtered via `is_voting`).
 */
import { CANONICAL_REVIEWER_POSITIONS } from './tabulate'

/** Canonical agent slug for the non-voting GPT-5.5 advisor. */
export const CAMINO_III_ADVISOR_AGENT = 'gpt-5.5-advisor' as const

/** Position label for the non-voting advisor (distinct from voting A/B/C). */
export const CAMINO_III_ADVISOR_POSITION = 'qa-advisor-D' as const

/**
 * Model id the advisor runs on. Configurable so the model can be upgraded
 * without code changes · routed via the Vercel AI Gateway like every other
 * model in the stack. Defaults to GPT-5.5.
 */
export function caminoIiiAdvisorModel(): string {
  return process.env.CAMINO_III_ADVISOR_MODEL?.trim() || 'gpt-5.5'
}

/**
 * The set of reviewer identities (agent slug OR position label) that DO NOT
 * count toward the gate tally. Currently just the GPT-5.5 advisor.
 */
const NON_VOTING_REVIEWERS: ReadonlySet<string> = new Set([
  CAMINO_III_ADVISOR_AGENT,
  CAMINO_III_ADVISOR_POSITION,
])

/**
 * True when the given reviewer (agent slug or position) counts toward the gate.
 *
 * Default is `true` · any reviewer not explicitly registered as non-voting is
 * treated as a voter (backward-compatible with the original 3-voter design and
 * any ad-hoc reviewer_agent). Only registered advisors return `false`.
 */
export function isVotingReviewer(agentOrPosition: string): boolean {
  return !NON_VOTING_REVIEWERS.has(agentOrPosition.trim())
}

/** Convenience · the 3 canonical voting agent slugs. */
export const VOTING_REVIEWER_AGENTS: readonly string[] = Object.values(
  CANONICAL_REVIEWER_POSITIONS,
)
