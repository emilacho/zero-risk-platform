/**
 * Tests · Costura C contract · phase-taxonomy alignment.
 *
 * Sprint 12 SEAM-CLOSE Costura C (2026-06-05) · this test ENFORCES
 * that the sala-side phase list matches CC#4's canonical 7-phase
 * taxonomy. If either side drifts, CI breaks · the canon contract
 * is preserved.
 *
 * §148 honest · the canonical list lives in
 * `CANONICAL_PHASES_LyVoKcrypS5uLyuu` (`journey-workflow-map.ts`).
 * CC#4's worker emits exactly these phase names in the
 * `modelb-phase-boundary-emit` node payload `phase_name` field per
 * MODELB-ADAPTER contract §2.2.
 *
 * Drift detection ·
 *   - Renaming a phase (e.g. NOTIFICATION → ALERT) breaks this test.
 *   - Adding/removing a phase breaks this test.
 *   - Reordering breaks this test (order is contract-significant for
 *     reconciliation logic).
 */
import { describe, it, expect } from 'vitest'
import {
  CANONICAL_PHASES_LyVoKcrypS5uLyuu,
  JOURNEY_WORKFLOW_MAP,
  isCanonicalPhase,
} from '@/lib/sala-journey-dispatch'

// The expected canonical list per CC#4 contract spec §2.2 + §1.3.
// This list must be edited TOGETHER on both sides (sala libreto + n8n
// worker) when a phase changes · canon §148 single source of truth.
const EXPECTED_CC4_PHASES = [
  'INTAKE',
  'DISCOVERY',
  'WORKSPACE',
  'SCHEDULING',
  'NOTIFICATION',
  'CASCADE',
  'APIFY_WIRE',
] as const

describe('Costura C · phase taxonomy canon · sala mirrors CC#4 contract', () => {
  it('canon · CANONICAL_PHASES_LyVoKcrypS5uLyuu has exactly 7 entries', () => {
    expect(CANONICAL_PHASES_LyVoKcrypS5uLyuu.length).toBe(7)
  })

  it('canon · phase names match CC#4 contract spec §2.2 exactly (order + spelling)', () => {
    expect(Array.from(CANONICAL_PHASES_LyVoKcrypS5uLyuu)).toEqual(
      Array.from(EXPECTED_CC4_PHASES),
    )
  })

  it('canon · JOURNEY_WORKFLOW_MAP.ONBOARD.phase_boundaries === canonical phase list', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD!
    expect(Array.from(target.phase_boundaries)).toEqual(
      Array.from(CANONICAL_PHASES_LyVoKcrypS5uLyuu),
    )
  })

  it('canon · isCanonicalPhase recognizes all 7', () => {
    for (const phase of CANONICAL_PHASES_LyVoKcrypS5uLyuu) {
      expect(isCanonicalPhase(phase)).toBe(true)
    }
  })

  it('canon · isCanonicalPhase rejects legacy non-canonical names', () => {
    // The 8 old boundaries from the original adapter design (pre-Costura C)
    expect(isCanonicalPhase('deal_won_received')).toBe(false)
    expect(isCanonicalPhase('onboarding_specialist_done')).toBe(false)
    expect(isCanonicalPhase('notion_workspace_created')).toBe(false)
    expect(isCanonicalPhase('journey_completed')).toBe(false)
    // Made-up names
    expect(isCanonicalPhase('made_up_phase')).toBe(false)
    expect(isCanonicalPhase('')).toBe(false)
  })

  it('canon · phase list is immutable at runtime (Object.freeze)', () => {
    expect(Object.isFrozen(CANONICAL_PHASES_LyVoKcrypS5uLyuu)).toBe(true)
  })

  it('canon · the libreto ONBOARD path is GRUESO (no internal nodes leak)', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD!
    for (const name of target.phase_boundaries) {
      // Per Opus anti-drift canon · libreto-grueso means names are
      // UPPERCASE phase labels, not lowercase node ids.
      expect(name).toMatch(/^[A-Z][A-Z_]*$/)
    }
  })
})
