/**
 * Journey Orchestrator · L1 · stage transition state machine
 *
 * Pure logic · no I/O. Codifies the canonical per-journey stage
 * progressions documented in `docs/05-orquestacion/MASTER_WORKFLOW_DESIGN.md`.
 *
 * State machine is intentionally permissive · L1 logs invalid transitions
 * but does NOT block them · L2 orchestrators own the strict stage gating.
 * L1 just answers · "given current stage + a trigger, what's the next
 * stage label we should persist?"
 */
import type { JourneyType, TriggerType } from './types'

/** Canonical stage labels per journey (one-line summary · L2 has details). */
export const JOURNEY_STAGES: Record<JourneyType, readonly string[]> = {
  ACQUIRE: [
    'lead_capture',
    'qualified',
    'discovery_call',
    'proposal_generated',
    'won',
  ],
  ONBOARD: [
    'kickoff', // Phase 1 · OnboardingOrchestrator startOnboarding()
    'auto_discovery_complete', // Phase 2 · auto-discovery agent finished (9 live rows post Sprint 7.6 #79)
    'send_intake_form', // Phase 3 · Tally/GHL form · Peniche stuck here
    'intake_received', // Phase 4 · client filled form
    'brand_discovery', // Phase 5 · brand-strategist auto-research
    'review_handoff', // Phase 6 · ready for first PRODUCE journey
  ],
  PRODUCE: [
    'brief_intake', // NEXUS Phase 1
    'research', // Phase 2
    'creative_concepts', // Phase 3
    'production', // Phase 4
    'qa_review', // Phase 5
    'launch', // Phase 6
    'optimize', // Phase 7
  ],
  ALWAYS_ON: [
    'monitoring', // cron supervisors awake · no specific stage
    'anomaly_detected',
    'recovery_dispatched',
  ],
  REVIEW: ['data_collection', 'qbr_drafted', 'qbr_reviewed', 'qbr_sent'],
  GROWTH: ['expansion_identified', 'pitch_prepared', 'committed'],
} as const

/**
 * Resolve next stage label for a (journey, current_stage, trigger) tuple.
 * Returns null when transition is unmapped · caller should log + persist
 * whatever stage label the L2 invocation responds with.
 */
export function resolveNextStage(
  journey: JourneyType,
  currentStage: string | null,
  trigger: TriggerType,
): string | null {
  const stages = JOURNEY_STAGES[journey]
  if (!stages || stages.length === 0) return null

  // First dispatch of this journey · start at index 0
  if (currentStage == null) return stages[0]

  // Resume from a known stuck-stage · stay at that stage (caller will
  // invoke the worker that produces this stage's output)
  if (trigger === 'resume_stuck') return currentStage

  // HITL resolved · advance one stage
  if (trigger === 'hitl_resolved') {
    const idx = stages.indexOf(currentStage)
    if (idx < 0 || idx >= stages.length - 1) return currentStage
    return stages[idx + 1]
  }

  // cascade_done from a sub-workflow · advance one stage
  if (trigger === 'cascade_done') {
    const idx = stages.indexOf(currentStage)
    if (idx < 0 || idx >= stages.length - 1) return currentStage
    return stages[idx + 1]
  }

  // anomaly_detected on ALWAYS_ON · go straight to escalation
  if (journey === 'ALWAYS_ON' && trigger === 'anomaly_detected') {
    return 'anomaly_detected'
  }

  // Default · keep current stage (L1 dispatcher logs activity but the L2
  // call itself drives stage progression and reports back via callback)
  return currentStage
}

/**
 * Detect a terminal stage (journey complete). Used by L1 to set
 * `client_journey_state.status = 'completed'` when L2 callback hits the
 * final stage.
 */
export function isTerminalStage(
  journey: JourneyType,
  stage: string | null,
): boolean {
  if (!stage) return false
  const stages = JOURNEY_STAGES[journey]
  if (!stages || stages.length === 0) return false
  return stages[stages.length - 1] === stage
}
