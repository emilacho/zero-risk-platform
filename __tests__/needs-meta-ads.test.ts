/**
 * Unit tests for `needsMetaAds()` helper exported from agent-sdk-runner ·
 * gates the Pipeboard Meta Ads MCP server registration in `buildMcpServers()`.
 *
 * Why a dedicated test file (not appended to agent-sdk-runner-helpers.test.ts) ·
 * the legacy helper test imports `../src/lib/agent-sdk-runner` which was
 * deleted in commit 7c36877 (Vercel proxy refactor · SDK moved fully to
 * Railway service `services/agent-runner/`). That test file is already
 * broken pre this PR · fixing it is out of scope. This new file imports
 * directly from the Railway copy where the helper now lives.
 *
 * Regex under test ·
 *   /media[-_]buyer|paid[-_]social|paid[-_]media|instagram|social[-_]media|community[-_]manager|\bmeta\b/i
 *
 * Six positive cases (one per Brazo 3 agent slug · all healthy per audit
 * `2026-05-18-brazo3-meta-ads-gap-analysis.md` Frente 3) + two negative
 * cases (non-Meta agents that should NOT spawn the meta-ads MCP server).
 */
import { describe, it, expect } from 'vitest'
import { needsMetaAds } from '../services/agent-runner/src/lib/agent-sdk-runner'

describe('needsMetaAds() · Brazo 3 agent slug gate', () => {
  describe('positive matches · spawns meta-ads MCP server', () => {
    it('matches media-buyer', () => {
      expect(needsMetaAds({ agentName: 'media-buyer' })).toBe(true)
    })
    it('matches paid_media_paid_social_strategist', () => {
      expect(
        needsMetaAds({ agentName: 'paid_media_paid_social_strategist' }),
      ).toBe(true)
    })
    it('matches marketing_instagram_curator', () => {
      expect(
        needsMetaAds({ agentName: 'marketing_instagram_curator' }),
      ).toBe(true)
    })
    it('matches social-media-strategist (kebab-case)', () => {
      expect(needsMetaAds({ agentName: 'social-media-strategist' })).toBe(true)
    })
    it('matches marketing_social_media_strategist (snake-case)', () => {
      expect(
        needsMetaAds({ agentName: 'marketing_social_media_strategist' }),
      ).toBe(true)
    })
    it('matches community_manager', () => {
      expect(needsMetaAds({ agentName: 'community_manager' })).toBe(true)
    })
    it('matches explicit meta-related slug', () => {
      expect(needsMetaAds({ agentName: 'meta-ops' })).toBe(true)
    })
  })

  describe('negative matches · does NOT spawn meta-ads MCP server', () => {
    it('rejects unrelated agent · brand-strategist', () => {
      expect(needsMetaAds({ agentName: 'brand-strategist' })).toBe(false)
    })
    it('rejects unrelated agent · seo-content-writer', () => {
      expect(needsMetaAds({ agentName: 'seo-content-writer' })).toBe(false)
    })
    it('rejects empty string', () => {
      expect(needsMetaAds({ agentName: '' })).toBe(false)
    })
    it('avoids substring false-positive · "metabolic-analyst"', () => {
      // \bmeta\b uses word boundary · "metabolic" should NOT match
      expect(needsMetaAds({ agentName: 'metabolic-analyst' })).toBe(false)
    })
  })

  describe('case-insensitivity', () => {
    it('matches uppercase slug', () => {
      expect(needsMetaAds({ agentName: 'MEDIA-BUYER' })).toBe(true)
    })
    it('matches mixed-case Instagram', () => {
      expect(
        needsMetaAds({ agentName: 'Marketing_Instagram_Curator' }),
      ).toBe(true)
    })
  })
})
