/**
 * editor-routing.test.ts · Wave 16 · CC#3 · T3 (coverage)
 *
 * Covers `src/lib/editor-routing.ts` — pure module: whitelist lookups +
 * dual-reviewer aggregate verdict logic. Zero I/O so tests are fast and
 * deterministic.
 *
 * Coverage targets (per requiresEditorReview / getEditorConfig / aggregateVerdicts):
 *  - whitelist membership (positive + negative)
 *  - all 16 whitelisted slugs are well-formed (max_revisions, escalate_on)
 *  - aggregateVerdicts: every status combo + severity max + dedup + disagreement
 */
import { describe, it, expect } from 'vitest'
import {
  EDITOR_WHITELIST,
  PRIMARY_REVIEWER,
  SECOND_REVIEWER,
  REVIEW_CONFIG,
  requiresEditorReview,
  getEditorConfig,
  aggregateVerdicts,
  type EditorVerdict,
} from '../src/lib/editor-routing'

// ──────────────────────────────────────────────────────────
// Fixture builders
// ──────────────────────────────────────────────────────────
function v(
  status: EditorVerdict['status'],
  severity: EditorVerdict['severity'] = 'low',
  issues: string[] = [],
  feedback = '',
): EditorVerdict {
  return { status, severity, issues, feedback }
}

// ──────────────────────────────────────────────────────────
// Whitelist invariants
// ──────────────────────────────────────────────────────────
describe('EDITOR_WHITELIST · invariants', () => {
  it('contains exactly the 15 documented content-producing agents (per docs/04-agentes/ESTRUCTURA_ORGANIZACIONAL.md)', () => {
    const slugs = Object.keys(EDITOR_WHITELIST)
    expect(slugs.length).toBe(15)
    // Spot-check a few from each branch
    expect(slugs).toContain('creative-director')
    expect(slugs).toContain('content-creator')
    expect(slugs).toContain('seo-specialist')
    expect(slugs).toContain('email-marketer')
    expect(slugs).toContain('reporting-agent')
  })

  it('every whitelist entry has positive max_revisions and a non-empty escalate_on', () => {
    for (const [slug, cfg] of Object.entries(EDITOR_WHITELIST)) {
      expect(cfg.max_revisions, `${slug}.max_revisions`).toBeGreaterThan(0)
      expect(cfg.escalate_on.length, `${slug}.escalate_on`).toBeGreaterThan(0)
      // every escalate_on entry is a valid severity
      for (const s of cfg.escalate_on) {
        expect(['low', 'medium', 'high', 'critical']).toContain(s)
      }
    }
  })

  it('email/review/PR/onboarding/reporting agents escalate on medium severity (low tolerance)', () => {
    for (const slug of [
      'email-marketer',
      'review-responder',
      'pr-earned-media-manager',
      'onboarding-specialist',
      'reporting-agent',
    ]) {
      expect(EDITOR_WHITELIST[slug].escalate_on, slug).toContain('medium')
    }
  })

  it('exposes constants for the dual-reviewer pattern', () => {
    expect(PRIMARY_REVIEWER).toBe('editor-en-jefe')
    expect(SECOND_REVIEWER).toBe('brand-strategist')
    expect(REVIEW_CONFIG.pattern).toBe('parallel')
    expect(REVIEW_CONFIG.disagreement_policy).toBe('hitl')
  })
})

// ──────────────────────────────────────────────────────────
// requiresEditorReview / getEditorConfig
// ──────────────────────────────────────────────────────────
describe('requiresEditorReview', () => {
  it('returns true for whitelisted agents', () => {
    expect(requiresEditorReview('content-creator')).toBe(true)
    expect(requiresEditorReview('seo-specialist')).toBe(true)
  })

  it('returns false for non-whitelisted agents (e.g. infra/ops)', () => {
    expect(requiresEditorReview('jefe-marketing')).toBe(false)
    expect(requiresEditorReview('qa-empleado')).toBe(false)
    expect(requiresEditorReview('')).toBe(false)
  })

  // Sprint #2 P0 — slug normalization fix (87% bypass closed)
  it('normalizes underscore variants (workflow legacy slugs)', () => {
    expect(requiresEditorReview('content_creator')).toBe(true)
    expect(requiresEditorReview('email_marketer')).toBe(true)
    expect(requiresEditorReview('seo_specialist')).toBe(true)
    expect(requiresEditorReview('pr_earned_media_manager')).toBe(true)
    expect(requiresEditorReview('reporting_agent')).toBe(true)
  })

  it('is case-insensitive after normalization', () => {
    expect(requiresEditorReview('Content-Creator')).toBe(true)
    expect(requiresEditorReview('CONTENT-CREATOR')).toBe(true)
    expect(requiresEditorReview('Email_Marketer')).toBe(true)
  })

  it('resolves semantic aliases via resolveAgentSlug', () => {
    expect(requiresEditorReview('copywriter')).toBe(true) // → content-creator
    expect(requiresEditorReview('landing_optimizer')).toBe(true) // → cro-specialist
    expect(requiresEditorReview('qbr_generator')).toBe(true) // → reporting-agent
  })

  it('still rejects truly unknown slugs', () => {
    expect(requiresEditorReview('totally-fake-agent')).toBe(false)
    expect(requiresEditorReview(null as unknown as string)).toBe(false)
    expect(requiresEditorReview(undefined as unknown as string)).toBe(false)
  })
})

describe('getEditorConfig', () => {
  it('returns the config object for a whitelisted agent', () => {
    const cfg = getEditorConfig('creative-director')
    expect(cfg).not.toBeNull()
    expect(cfg!.max_revisions).toBe(2)
    expect(cfg!.lens_emphasis).toBe('schwartz')
    expect(cfg!.escalate_on).toEqual(['high', 'critical'])
  })

  it('returns null for unknown agents', () => {
    expect(getEditorConfig('does-not-exist')).toBeNull()
    expect(getEditorConfig('')).toBeNull()
  })

  // Sprint #2 P0 — slug normalization
  it('returns same config for normalized variants', () => {
    const canonical = getEditorConfig('email-marketer')
    expect(getEditorConfig('email_marketer')).toEqual(canonical)
    expect(getEditorConfig('Email-Marketer')).toEqual(canonical)
    expect(getEditorConfig('EMAIL_MARKETER')).toEqual(canonical)
  })
})

// ──────────────────────────────────────────────────────────
// aggregateVerdicts — all status combinations
// ──────────────────────────────────────────────────────────
describe('aggregateVerdicts · status logic', () => {
  it('both approved → approved (no disagreement)', () => {
    const r = aggregateVerdicts(v('approved'), v('approved'))
    expect(r.status).toBe('approved')
    expect(r.disagreement).toBe(false)
    expect(r.disagreement_reason).toBeUndefined()
  })

  it('one approved + one escalated → escalated WITH disagreement flag', () => {
    const r1 = aggregateVerdicts(v('approved'), v('escalated', 'high'))
    expect(r1.status).toBe('escalated')
    expect(r1.disagreement).toBe(true)
    expect(r1.disagreement_reason).toMatch(/Editor=approved.*Brand Strategist=escalated/i)

    // symmetric
    const r2 = aggregateVerdicts(v('escalated', 'high'), v('approved'))
    expect(r2.status).toBe('escalated')
    expect(r2.disagreement).toBe(true)
    expect(r2.disagreement_reason).toMatch(/Editor=escalated.*Brand Strategist=approved/i)
  })

  it('both escalated → escalated (no disagreement, both agree)', () => {
    const r = aggregateVerdicts(v('escalated', 'critical'), v('escalated', 'high'))
    expect(r.status).toBe('escalated')
    expect(r.disagreement).toBe(false)
  })

  it('one revision_needed + one approved → revision_needed (no disagreement)', () => {
    const r = aggregateVerdicts(v('revision_needed', 'medium'), v('approved'))
    expect(r.status).toBe('revision_needed')
    expect(r.disagreement).toBe(false)
  })

  it('escalated wins over revision_needed', () => {
    const r = aggregateVerdicts(v('revision_needed', 'medium'), v('escalated', 'high'))
    expect(r.status).toBe('escalated')
    // Note: this combo is NOT flagged as disagreement (only approved↔escalated triggers it)
    expect(r.disagreement).toBe(false)
  })

  it('both revision_needed → revision_needed', () => {
    const r = aggregateVerdicts(v('revision_needed', 'low'), v('revision_needed', 'medium'))
    expect(r.status).toBe('revision_needed')
  })
})

describe('aggregateVerdicts · severity max', () => {
  it('takes the higher severity from editor', () => {
    const r = aggregateVerdicts(v('approved', 'critical'), v('approved', 'low'))
    expect(r.severity).toBe('critical')
  })

  it('takes the higher severity from brand strategist', () => {
    const r = aggregateVerdicts(v('approved', 'low'), v('approved', 'high'))
    expect(r.severity).toBe('high')
  })

  it('keeps editor severity on a tie', () => {
    const r = aggregateVerdicts(v('approved', 'medium'), v('approved', 'medium'))
    expect(r.severity).toBe('medium')
  })
})

describe('aggregateVerdicts · issues + feedback merge', () => {
  it('dedupes issues across reviewers', () => {
    const r = aggregateVerdicts(
      v('revision_needed', 'medium', ['voice off-brand', 'missing CTA']),
      v('revision_needed', 'medium', ['voice off-brand', 'CTA too soft']),
    )
    expect(r.issues.sort()).toEqual(['CTA too soft', 'missing CTA', 'voice off-brand'])
  })

  it('combines feedback with reviewer headers', () => {
    const r = aggregateVerdicts(
      v('revision_needed', 'medium', [], 'Voice is too formal.'),
      v('revision_needed', 'medium', [], 'Brand book section 3 conflict.'),
    )
    expect(r.feedback).toContain('[Editor en Jefe]')
    expect(r.feedback).toContain('Voice is too formal.')
    expect(r.feedback).toContain('[Brand Strategist]')
    expect(r.feedback).toContain('Brand book section 3 conflict.')
  })

  it('omits empty feedback sections gracefully', () => {
    const r = aggregateVerdicts(
      v('approved', 'low', [], ''),
      v('approved', 'low', [], 'Looks great.'),
    )
    expect(r.feedback).toBe('[Brand Strategist]\nLooks great.')
    expect(r.feedback).not.toContain('[Editor en Jefe]')
  })

  it('exposes per-reviewer status + severity in `reviewers`', () => {
    const r = aggregateVerdicts(
      v('approved', 'low'),
      v('escalated', 'critical'),
    )
    expect(r.reviewers.editor).toEqual({ status: 'approved', severity: 'low' })
    expect(r.reviewers.brand_strategist).toEqual({ status: 'escalated', severity: 'critical' })
  })
})
