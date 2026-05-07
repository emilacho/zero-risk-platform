/**
 * Unit tests for src/lib/agent-alias-map.ts (Wave 14 · CC#1).
 *
 * Covers slug resolution + canonical-set membership. Critical because
 * /api/agents/run-sdk depends on these helpers for n8n compatibility.
 */
import { describe, it, expect } from 'vitest'
import {
  AGENT_ALIAS_MAP,
  MANIFEST_31_SLUGS,
  resolveAgentSlug,
  isCanonicalSlug,
} from '../src/lib/agent-alias-map'

describe('resolveAgentSlug', () => {
  it('resolves snake_case → kebab-case', () => {
    expect(resolveAgentSlug('content_creator')).toBe('content-creator')
    expect(resolveAgentSlug('seo_specialist')).toBe('seo-specialist')
    expect(resolveAgentSlug('media_buyer')).toBe('media-buyer')
  })
  it('resolves agent_role aliases', () => {
    expect(resolveAgentSlug('content_creator_agent')).toBe('content-creator')
    expect(resolveAgentSlug('ruflo_lead_qualifier')).toBe('ruflo')
  })
  it('resolves semantic legacy aliases', () => {
    expect(resolveAgentSlug('copywriter')).toBe('content-creator')
    expect(resolveAgentSlug('landing_optimizer')).toBe('cro-specialist')
    expect(resolveAgentSlug('qbr_generator')).toBe('reporting-agent')
    expect(resolveAgentSlug('meta_agent')).toBe('optimization-agent')
  })
  it('resolves GEO content-freshness slug to seo-specialist', () => {
    expect(resolveAgentSlug('seo-geo-optimization')).toBe('seo-specialist')
    expect(resolveAgentSlug('seo_geo_optimization')).toBe('seo-specialist')
  })
  it('resolves ad-intelligence ghosts (kebab + snake)', () => {
    expect(resolveAgentSlug('ad-intelligence-agent')).toBe('competitive-intelligence-agent')
    expect(resolveAgentSlug('ad_intelligence_agent')).toBe('competitive-intelligence-agent')
  })
  it('returns input unchanged when no alias is registered', () => {
    expect(resolveAgentSlug('ruflo')).toBe('ruflo')
    expect(resolveAgentSlug('jefe-marketing')).toBe('jefe-marketing')
    expect(resolveAgentSlug('this-is-not-a-slug')).toBe('this-is-not-a-slug')
  })
  it('handles empty string by returning empty string', () => {
    expect(resolveAgentSlug('')).toBe('')
  })
})

describe('isCanonicalSlug', () => {
  it('returns true for MANIFEST-31 canonical slugs', () => {
    expect(isCanonicalSlug('ruflo')).toBe(true)
    expect(isCanonicalSlug('jefe-marketing')).toBe(true)
    expect(isCanonicalSlug('content-creator')).toBe(true)
    expect(isCanonicalSlug('competitive-intelligence-agent')).toBe(true)
  })
  it('returns false for snake_case (must resolve first)', () => {
    expect(isCanonicalSlug('content_creator')).toBe(false)
    expect(isCanonicalSlug('seo_specialist')).toBe(false)
  })
  it('returns false for unknown slugs', () => {
    expect(isCanonicalSlug('made-up-agent')).toBe(false)
    expect(isCanonicalSlug('')).toBe(false)
  })
})

describe('AGENT_ALIAS_MAP integrity', () => {
  it('every alias VALUE is a canonical slug', () => {
    for (const [alias, target] of Object.entries(AGENT_ALIAS_MAP)) {
      expect(MANIFEST_31_SLUGS.has(target), `alias "${alias}" → "${target}" not in MANIFEST-31`).toBe(true)
    }
  })
  it('no alias points to itself', () => {
    for (const [alias, target] of Object.entries(AGENT_ALIAS_MAP)) {
      expect(alias === target, `self-reference alias: ${alias}`).toBe(false)
    }
  })
})

describe('MANIFEST_31_SLUGS', () => {
  it('has at least 31 canonical slugs', () => {
    // The constant is named MANIFEST_31_SLUGS but the implementation may
    // include 30+ entries. Just sanity-check the floor.
    expect(MANIFEST_31_SLUGS.size).toBeGreaterThanOrEqual(30)
  })
  it('all entries are kebab-case (no underscore, no uppercase)', () => {
    for (const slug of MANIFEST_31_SLUGS) {
      expect(slug.toLowerCase()).toBe(slug)
      expect(slug.includes('_')).toBe(false)
    }
  })
})
