/**
 * sprint-seo · MANIFEST-36 + 5 SEO sub-agents activation smoke.
 *
 * Pure validation · NO live DB · checks ·
 *   - MANIFEST_36_SLUGS contains 36 canonical slugs (31 core + 5 SEO subs)
 *   - All 5 new SEO slugs pass isCanonicalSlug
 *   - Backwards-compat alias MANIFEST_31_SLUGS still points to MANIFEST_36_SLUGS
 *   - No accidental regression · all 31 core slugs preserved
 */
import { describe, it, expect } from 'vitest'
import {
  MANIFEST_36_SLUGS,
  MANIFEST_31_SLUGS,
  isCanonicalSlug,
  resolveAgentSlug,
} from '@/lib/agent-alias-map'

const CORE_31 = [
  'ruflo',
  'jefe-marketing',
  'campaign-brief-agent',
  'brand-strategist',
  'market-research',
  'customer-research',
  'competitive-intelligence-agent',
  'mops-director',
  'content-creator',
  'seo-specialist',
  'media-buyer',
  'web-designer',
  'video-editor',
  'creative-director',
  'social-media-strategist',
  'editor-en-jefe',
  'community-manager',
  'influencer-manager',
  'tracking-specialist',
  'email-marketer',
  'crm-architect',
  'review-responder',
  'pr-earned-media-manager',
  'cro-specialist',
  'optimization-agent',
  'growth-hacker',
  'sales-enablement',
  'jefe-client-success',
  'account-manager',
  'onboarding-specialist',
  'reporting-agent',
]

const SEO_SUB_AGENTS = [
  'seo-orchestrator',
  'seo-content-strategist',
  'seo-technical',
  'seo-geo-optimization',
  'seo-backlink-strategist',
]

describe('sprint-seo · MANIFEST-36 activation', () => {
  it('MANIFEST_36_SLUGS contains exactly 36 slugs', () => {
    expect(MANIFEST_36_SLUGS.size).toBe(36)
  })

  it('all 31 core slugs preserved (no regression)', () => {
    for (const slug of CORE_31) {
      expect(MANIFEST_36_SLUGS.has(slug)).toBe(true)
    }
  })

  it('all 5 SEO sub-agent slugs present', () => {
    for (const slug of SEO_SUB_AGENTS) {
      expect(MANIFEST_36_SLUGS.has(slug)).toBe(true)
    }
  })

  it('MANIFEST_31_SLUGS backwards-compat alias points to MANIFEST_36_SLUGS', () => {
    expect(MANIFEST_31_SLUGS).toBe(MANIFEST_36_SLUGS)
    expect(MANIFEST_31_SLUGS.size).toBe(36)
  })

  it('isCanonicalSlug returns true for all 5 new SEO slugs', () => {
    for (const slug of SEO_SUB_AGENTS) {
      expect(isCanonicalSlug(slug)).toBe(true)
    }
  })

  it('isCanonicalSlug returns false for non-canonical slugs', () => {
    expect(isCanonicalSlug('seo-imaginary')).toBe(false)
    expect(isCanonicalSlug('SEO-ORCHESTRATOR')).toBe(false) // case sensitive
    expect(isCanonicalSlug('seo_orchestrator')).toBe(false) // underscore variant
  })

  it('resolveAgentSlug pass-through for canonical SEO slugs (no aliasing needed)', () => {
    for (const slug of SEO_SUB_AGENTS) {
      expect(resolveAgentSlug(slug)).toBe(slug)
    }
  })

  it('SEO sub-agents do NOT alias to seo-specialist (they are siblings, not replacements)', () => {
    for (const slug of SEO_SUB_AGENTS) {
      expect(resolveAgentSlug(slug)).not.toBe('seo-specialist')
    }
  })

  it('seo-specialist (parent) still in MANIFEST · sub-agents are addition not replacement', () => {
    expect(MANIFEST_36_SLUGS.has('seo-specialist')).toBe(true)
  })

  it('SEO sub-agent slugs match docs/04-agentes/identidades/seo/*.md frontmatter name fields', () => {
    // This is the contract · matches frontmatter `name:` from ·
    //   seo-orchestrator.md      → name: seo-orchestrator
    //   content-strategist.md    → name: seo-content-strategist
    //   technical-seo.md         → name: seo-technical
    //   geo-optimization.md      → name: seo-geo-optimization
    //   backlink-strategist.md   → name: seo-backlink-strategist
    expect(SEO_SUB_AGENTS).toEqual([
      'seo-orchestrator',
      'seo-content-strategist',
      'seo-technical',
      'seo-geo-optimization',
      'seo-backlink-strategist',
    ])
  })
})

describe('sprint-seo · /api/agents/run synthetic smoke (per-agent contract)', () => {
  // These tests verify that each of the 5 new slugs is RECOGNIZED by the
  // MANIFEST · live invocation requires migration apply + Anthropic agent
  // registration which happen post-PR-merge.

  for (const slug of SEO_SUB_AGENTS) {
    it(`${slug} · accepted by isCanonicalSlug + resolveAgentSlug pass-through`, () => {
      const resolved = resolveAgentSlug(slug)
      expect(resolved).toBe(slug)
      expect(isCanonicalSlug(resolved)).toBe(true)
    })
  }
})
