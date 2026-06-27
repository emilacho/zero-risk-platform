/**
 * src/lib/camino-iii/reviewer-slots.ts · Camino III reviewer slot interface · §144 · CC#2
 *
 * INTERFACE ONLY. Declares WHO can review and in WHICH role. The actual gate
 * wiring (tabulation excluding advisory votes) lands in PR #188 · this file is
 * the config surface that wiring consumes.
 *
 * Two roles ·
 *   'voting'   · counts toward the 3-of-N matrix (≥2 green AND 0 red → pass)
 *   'advisory' · review captured for the editorial record · NEVER votes, NEVER
 *                affects the math. The 4th slot (GPT-5.5) is advisory.
 *
 * Model-agnostic by design · the advisory model is read from config (env), so
 * it can be swapped (GPT-5.5 → any model) WITHOUT touching code. Routed via the
 * Vercel AI Gateway like the rest of the stack.
 */

export type ReviewerRole = 'voting' | 'advisory'

export interface ReviewerSlot {
  /** Stable position label · A/B/C are voting · D is the advisory slot. */
  position: 'qa-reviewer-A' | 'qa-reviewer-B' | 'qa-reviewer-C' | 'qa-advisor-D'
  /** Canonical agent slug invoked for this slot. */
  agent: string
  /** Whether this slot's review counts toward the gate. */
  role: ReviewerRole
  /**
   * Model id for this slot. `undefined` = use the agent's default model
   * (the 3 voting agents resolve their own model). The advisory slot reads
   * its model from config so it stays swappable.
   */
  model?: string
}

/** Env key for the advisory model · swap the model without code changes. */
export const ADVISOR_MODEL_ENV = 'CAMINO_III_ADVISOR_MODEL' as const

/** Default advisory model when the env override is unset. */
export const ADVISOR_MODEL_DEFAULT = 'gpt-5.5' as const

/** Resolve the advisory slot's model from config (env), never hardcoded at call sites. */
export function getAdvisorModel(): string {
  return process.env[ADVISOR_MODEL_ENV]?.trim() || ADVISOR_MODEL_DEFAULT
}

/**
 * The canonical reviewer slot configuration · 3 voting + 1 advisory.
 *
 * The advisory slot is declared `role: 'advisory'` with a config-driven model.
 * PR #188 reads `role` to keep advisory reviews out of the tally.
 */
export function getReviewerSlots(): ReviewerSlot[] {
  return [
    { position: 'qa-reviewer-A', agent: 'editor-en-jefe', role: 'voting' },
    { position: 'qa-reviewer-B', agent: 'brand-strategist', role: 'voting' },
    { position: 'qa-reviewer-C', agent: 'jefe-client-success', role: 'voting' },
    { position: 'qa-advisor-D', agent: 'gpt-5.5-advisor', role: 'advisory', model: getAdvisorModel() },
  ]
}

/** Voting slots only (the 3 that drive the matrix). */
export function getVotingSlots(): ReviewerSlot[] {
  return getReviewerSlots().filter((s) => s.role === 'voting')
}

/** Advisory slots only (non-voting · e.g. GPT-5.5). */
export function getAdvisorySlots(): ReviewerSlot[] {
  return getReviewerSlots().filter((s) => s.role === 'advisory')
}

/** True when a given slot position / agent is advisory (does not vote). */
export function isAdvisory(positionOrAgent: string): boolean {
  const key = positionOrAgent.trim()
  return getAdvisorySlots().some((s) => s.position === key || s.agent === key)
}
