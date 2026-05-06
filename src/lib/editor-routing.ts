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

export type ReviewPattern = 'parallel' | 'sequential' | 'conditional'
export type DisagreementPolicy = 'strict' | 'lenient' | 'hitl'

export const REVIEW_CONFIG = {
  pattern: 'parallel' as ReviewPattern,
  disagreement_policy: 'hitl' as DisagreementPolicy,
} as const

// ============================================================
// AGGREGATE VERDICT — combines Editor + Brand Strategist verdicts
//
// Disagreement = uno aprueba y el otro escala → HITL tiebreaker
// Escalation wins over revision_needed
// Severity = max(editor.severity, brand.severity)
// ============================================================

export interface AggregateVerdict {
  status: EditorVerdictStatus
  severity: EditorVerdictSeverity
  issues: string[]
  feedback: string
  reviewers: {
    editor: { status: EditorVerdictStatus; severity: EditorVerdictSeverity }
    brand_strategist: { status: EditorVerdictStatus; severity: EditorVerdictSeverity }
  }
  disagreement: boolean
  disagreement_reason?: string
}

const SEVERITY_RANK: Record<EditorVerdictSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

export function aggregateVerdicts(
  editorVerdict: EditorVerdict,
  brandVerdict: EditorVerdict
): AggregateVerdict {
  const isDisagreement =
    (editorVerdict.status === 'approved' && brandVerdict.status === 'escalated') ||
    (editorVerdict.status === 'escalated' && brandVerdict.status === 'approved')

  let aggregateStatus: EditorVerdictStatus
  if (isDisagreement) {
    aggregateStatus = 'escalated'
  } else if (editorVerdict.status === 'escalated' || brandVerdict.status === 'escalated') {
    aggregateStatus = 'escalated'
  } else if (editorVerdict.status === 'revision_needed' || brandVerdict.status === 'revision_needed') {
    aggregateStatus = 'revision_needed'
  } else {
    aggregateStatus = 'approved'
  }

  const aggregateSeverity: EditorVerdictSeverity =
    SEVERITY_RANK[editorVerdict.severity] >= SEVERITY_RANK[brandVerdict.severity]
      ? editorVerdict.severity
      : brandVerdict.severity

  const dedupedIssues = Array.from(new Set([...editorVerdict.issues, ...brandVerdict.issues]))

  const combinedFeedback = [
    editorVerdict.feedback ? `[Editor en Jefe]\n${editorVerdict.feedback}` : '',
    brandVerdict.feedback ? `[Brand Strategist]\n${brandVerdict.feedback}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    status: aggregateStatus,
    severity: aggregateSeverity,
    issues: dedupedIssues,
    feedback: combinedFeedback,
    reviewers: {
      editor: { status: editorVerdict.status, severity: editorVerdict.severity },
      brand_strategist: { status: brandVerdict.status, severity: brandVerdict.severity },
    },
    disagreement: isDisagreement,
    disagreement_reason: isDisagreement
      ? `Editor=${editorVerdict.status}, Brand Strategist=${brandVerdict.status} — escalating to HITL for tiebreaker`
      : undefined,
  }
}
