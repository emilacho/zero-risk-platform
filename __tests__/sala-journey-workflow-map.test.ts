/**
 * Tests · JOURNEY_WORKFLOW_MAP + helpers · Model B (conexión 2026-06-05).
 */
import { describe, it, expect } from 'vitest'
import {
  JOURNEY_WORKFLOW_MAP,
  getJourneyWorkflowTarget,
  isWorkflowJourney,
} from '@/lib/sala-journey-dispatch'

describe('JOURNEY_WORKFLOW_MAP · Phase 1 scope', () => {
  it('canon · ONBOARD maps to LyVoKcrypS5uLyuu (Client Onboarding E2E v2)', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD
    expect(target).toBeDefined()
    expect(target!.workflow_id).toBe('LyVoKcrypS5uLyuu')
    expect(target!.webhook_path).toBe('zero-risk/deal-won-onboarding')
    expect(target!.worker_name).toMatch(/Client Onboarding E2E v2/)
  })

  it('canon · ONBOARD declares 8 phase_boundaries · coarse-grain libreto', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD!
    expect(target.phase_boundaries.length).toBe(8)
    expect(target.phase_boundaries[0]).toBe('deal_won_received')
    expect(target.phase_boundaries[target.phase_boundaries.length - 1]).toBe(
      'journey_completed',
    )
  })

  it('canon · ONBOARD declares an idempotency_suffix (STOP-2 dispatch-único)', () => {
    expect(JOURNEY_WORKFLOW_MAP.ONBOARD!.idempotency_suffix).toMatch(/onboard/)
  })

  it('canon · PRODUCE/ACQUIRE/etc deliberately UNMAPPED · legacy agent path', () => {
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.ACQUIRE).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.ALWAYS_ON).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.REVIEW).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.GROWTH).toBeUndefined()
  })

  it('canon · JOURNEY_WORKFLOW_MAP is immutable (Object.freeze)', () => {
    expect(Object.isFrozen(JOURNEY_WORKFLOW_MAP)).toBe(true)
  })
})

describe('getJourneyWorkflowTarget', () => {
  it('canon · returns target for mapped journey', () => {
    const target = getJourneyWorkflowTarget('ONBOARD')
    expect(target?.workflow_id).toBe('LyVoKcrypS5uLyuu')
  })
  it('canon · returns undefined for unmapped journey', () => {
    expect(getJourneyWorkflowTarget('PRODUCE')).toBeUndefined()
  })
})

describe('isWorkflowJourney', () => {
  it('canon · true for mapped journey', () => {
    expect(isWorkflowJourney('ONBOARD')).toBe(true)
  })
  it('canon · false for unmapped journey (legacy agent path)', () => {
    expect(isWorkflowJourney('PRODUCE')).toBe(false)
    expect(isWorkflowJourney('GROWTH')).toBe(false)
  })
})
