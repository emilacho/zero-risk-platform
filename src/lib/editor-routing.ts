/**
 * Editor en Jefe — Routing Configuration + Aggregate Verdict Logic
 *
 * Whitelist de 15 agentes content-producers cuyos outputs pasan automáticamente
 * por revisión DUAL (Editor en Jefe + Brand Strategist en paralelo) via middleware
 * en /api/agents/run.
 *
 * Approach: ALL-LENS. El Editor aplica TODOS sus criterios en cada review.
 *
 * Per-agent config:
 * - max_revisions: # de iteraciones automáticas antes de escalar a HITL humano
 * - escalate_on: severities que escalan DIRECTAMENTE a HITL (sin esperar revisions)
 *
 * Slug normalization (Sprint #2 P0 · 2026-05-06):
 * `requiresEditorReview` y `getEditorConfig` ahora normalizan el slug ANTES del
 * lookup — corrige el bypass del 87% donde workflows que mandaban
 * `email_marketer` (underscore) escapaban al whitelist (que solo tenía `email-marketer`).
 * La normalización aplica resolveAgentSlug + toLowerCase + underscore→hyphen.
 *
 * Doc canonical: docs/04-agentes/ESTRUCTURA_ORGANIZACIONAL.md sección 7
 */

import { resolveAgentSlug } from '@/lib/agent-alias-map'

export type EditorVerdictStatus = 'approved' | 'revision_needed' | 'escalated'
export type EditorVerdictSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface EditorVerdict {
  status: EditorVerdictStatus
  issues: string[]
  feedback: string
  severity: EditorVerdictSeverity
}

export interface EditorRoutingConfig {
  max_revisions: number
  escalate_on: EditorVerdictSeverity[]
  lens_emphasis?: string
}

export const EDITOR_WHITELIST: Record<string, EditorRoutingConfig> = {
  // CREATIVE STUDIO (3)
  'creative-director': {
    max_revisions: 2,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'schwartz',
  },
  'content-creator': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'video-editor': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'brand_voice',
  },

  // PERFORMANCE (3 content-producing)
  'web-designer': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'cro',
  },
  'seo-specialist': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'seo_content',
  },
  'cro-specialist': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'schwartz',
  },

  // COMMUNICATIONS (7)
  'email-marketer': {
    max_revisions: 1,
    escalate_on: ['medium', 'high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'social-media-strategist': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'community-manager': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'review-responder': {
    max_revisions: 1,
    escalate_on: ['medium', 'high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'influencer-manager': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'pr-earned-media-manager': {
    max_revisions: 1,
    escalate_on: ['medium', 'high', 'critical'],
    lens_emphasis: 'pr',
  },
  'sales-enablement': {
    max_revisions: 1,
    escalate_on: ['high', 'critical'],
    lens_emphasis: 'schwartz',
  },

  // CCO BRANCH (2)
  'onboarding-specialist': {
    max_revisions: 1,
    escalate_on: ['medium', 'high', 'critical'],
    lens_emphasis: 'brand_voice',
  },
  'reporting-agent': {
    max_revisions: 1,
    escalate_on: ['medium', 'high', 'critical'],
    lens_emphasis: 'accuracy',
  },
}

/**
 * Normaliza un slug a kebab-case canónico antes del lookup en EDITOR_WHITELIST.
 * Aplica:
 *   1. trim + toLowerCase
 *   2. underscore → hyphen (cubre "email_marketer" → "email-marketer")
 *   3. resolveAgentSlug (cubre aliases legados como "copywriter" → "content-creator")
 *
 * Esto cierra el bypass del 87% reportado en Sprint #1 análisis cruzado workflows
 * vs estructura organizacional (PM_REPORT_S33P5).
 */
export function normalizeAgentSlug(agentSlug: string | null | undefined): string {
  if (!agentSlug || typeof agentSlug !== 'string') return ''
  const lowered = agentSlug.trim().toLowerCase()
  if (!lowered) return ''
  // Try resolveAgentSlug on the raw lowered form FIRST — the alias map keys
  // semantic aliases like "landing_optimizer" with underscores, so converting
  // to hyphens prematurely would miss them.
  const resolvedRaw = resolveAgentSlug(lowered)
  if (resolvedRaw !== lowered) return resolvedRaw
  // Fallback: kebab-case (covers MANIFEST-31 canonical kebab forms like
  // "Email-Marketer" → "email-marketer", and any snake_case slug whose alias
  // resolves to a hyphenated canonical).
  const hyphenated = lowered.replace(/_/g, '-')
  return resolveAgentSlug(hyphenated)
}

export function requiresEditorReview(agentSlug: string): boolean {
  return normalizeAgentSlug(agentSlug) in EDITOR_WHITELIST
}

export function getEditorConfig(agentSlug: string): EditorRoutingConfig | null {
  return EDITOR_WHITELIST[normalizeAgentSlug(agentSlug)] || null
}

// ============================================================
// DUAL REVIEWER CONFIG
// ============================================================

export const PRIMARY_REVIEWER = 'editor-en-jefe'
export const SECOND_REVIEWER = 'brand-strategist'
// Camino III · 3-of-N voting (Sprint #5) · third reviewer angle = "would the
// client be happy with this output". jefe-client-success (CCO Tier 2) owns
// the client-success lens; agent-alias-map.ts aliases `client-success-lead`
// (playbook name) to this slug.
export const THIRD_REVIEWER = 'jefe-client-success'

export type ReviewerRole = 'editor' | 'brand_strategist' | 'client_success_lead'

export const REVIEWER_SLUGS: Record<ReviewerRole, string> = {
  editor: PRIMARY_REVIEWER,
  brand_strategist: SECOND_REVIEWER,
  client_success_lead: THIRD_REVIEWER,
}

export type ReviewPattern = 'parallel' | 'sequential' | 'conditional'
export type DisagreementPolicy = 'strict' | 'lenient' | 'hitl'

export const REVIEW_CONFIG = {
  pattern: 'parallel' as ReviewPattern,
  disagreement_policy: 'hitl' as DisagreementPolicy,
  /**
   * Number of reviewers required for a verdict. Defaults to 3 (Camino III
   * 3-of-N voting). The middleware reads this to decide how many parallel
   * invokes to fire; setting back to 2 would skip the client-success lens
   * without changing the rest of the pipeline.
   */
  reviewer_count: 3,
} as const

// ============================================================
// AGGREGATE VERDICT — combines Editor + Brand Strategist verdicts
//
// Disagreement = uno aprueba y el otro escala → HITL tiebreaker
// Escalation wins over revision_needed
// Severity = max(editor.severity, brand.severity)
// ============================================================

export interface ReviewerVerdictSummary {
  status: EditorVerdictStatus
  severity: EditorVerdictSeverity
}

export interface AggregateVerdict {
  status: EditorVerdictStatus
  severity: EditorVerdictSeverity
  issues: string[]
  feedback: string
  reviewers: {
    editor: ReviewerVerdictSummary
    brand_strategist: ReviewerVerdictSummary
    /**
     * Camino III 3-of-N voting · optional so the legacy 2-reviewer call sites
     * (and any downstream consumers reading the API response) continue to
     * work without conditional checks for older paths.
     */
    client_success_lead?: ReviewerVerdictSummary
  }
  disagreement: boolean
  disagreement_reason?: string
  /** Count of reviewers that produced a verdict (2 or 3 in practice). */
  reviewer_count?: number
}

const SEVERITY_RANK: Record<EditorVerdictSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

/**
 * Aggregate N reviewer verdicts into one consensus.
 *
 * Status rule (covers both the legacy 2-reviewer case and Camino III 3-of-N):
 *   - any reviewer escalated → status = 'escalated'
 *   - else any reviewer revision_needed → status = 'revision_needed'
 *   - else (all approved) → status = 'approved'
 *
 * Disagreement = at least two reviewers produced different statuses. The
 * 1-1-1 tie (one approved, one revision_needed, one escalated) lands in the
 * "escalated" bucket (per the playbook · tie → HITL) and also flips the
 * disagreement flag so downstream consumers can show "X reviewers disagreed".
 *
 * Severity = max severity across all reviewers.
 *
 * Feedback = concatenated by role label so the operator sees who said what.
 */
export interface ReviewerInput {
  role: ReviewerRole
  verdict: EditorVerdict
}

const REVIEWER_LABEL: Record<ReviewerRole, string> = {
  editor: 'Editor en Jefe',
  brand_strategist: 'Brand Strategist',
  client_success_lead: 'Client Success Lead',
}

export function aggregateVerdictsN(reviewers: ReviewerInput[]): AggregateVerdict {
  if (reviewers.length === 0) {
    throw new Error('aggregateVerdictsN requires at least one reviewer input')
  }

  const statuses = new Set(reviewers.map((r) => r.verdict.status))
  const disagreement = statuses.size > 1

  let aggregateStatus: EditorVerdictStatus
  if (reviewers.some((r) => r.verdict.status === 'escalated')) {
    aggregateStatus = 'escalated'
  } else if (reviewers.some((r) => r.verdict.status === 'revision_needed')) {
    aggregateStatus = 'revision_needed'
  } else {
    aggregateStatus = 'approved'
  }

  let aggregateSeverity: EditorVerdictSeverity = 'low'
  for (const { verdict } of reviewers) {
    if (SEVERITY_RANK[verdict.severity] > SEVERITY_RANK[aggregateSeverity]) {
      aggregateSeverity = verdict.severity
    }
  }

  const dedupedIssues = Array.from(new Set(reviewers.flatMap((r) => r.verdict.issues)))
  const combinedFeedback = reviewers
    .filter((r) => r.verdict.feedback)
    .map((r) => `[${REVIEWER_LABEL[r.role]}]\n${r.verdict.feedback}`)
    .join('\n\n')

  const reviewersField: AggregateVerdict['reviewers'] = {
    editor: { status: 'approved', severity: 'low' },
    brand_strategist: { status: 'approved', severity: 'low' },
  }
  for (const { role, verdict } of reviewers) {
    reviewersField[role] = { status: verdict.status, severity: verdict.severity }
  }

  let disagreementReason: string | undefined
  if (disagreement) {
    const summary = reviewers
      .map(({ role, verdict }) => `${REVIEWER_LABEL[role]}=${verdict.status}`)
      .join(', ')
    disagreementReason = `${summary} — escalating to HITL for tiebreaker`
  }

  return {
    status: aggregateStatus,
    severity: aggregateSeverity,
    issues: dedupedIssues,
    feedback: combinedFeedback,
    reviewers: reviewersField,
    disagreement,
    disagreement_reason: disagreementReason,
    reviewer_count: reviewers.length,
  }
}

/**
 * Legacy 2-reviewer entry point. Preserved for any callers that haven't
 * moved to `aggregateVerdictsN`; internally it just delegates.
 */
export function aggregateVerdicts(
  editorVerdict: EditorVerdict,
  brandVerdict: EditorVerdict,
): AggregateVerdict {
  return aggregateVerdictsN([
    { role: 'editor', verdict: editorVerdict },
    { role: 'brand_strategist', verdict: brandVerdict },
  ])
}
