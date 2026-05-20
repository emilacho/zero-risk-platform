/**
 * Journey Orchestrator · L1 Master Dispatcher · public barrel
 *
 * Sprint 1 · 2026-05-20 · CC#1
 *
 * Public surface for code-side callers (e.g. OnboardingOrchestrator hooks,
 * API routes, cron jobs). Internal helpers (state-machine, routes-map,
 * validators) are re-exported for unit tests but should NOT be invoked
 * directly from app code · always go through `dispatchJourney()`.
 */
export { dispatchJourney } from './dispatch.js'
export { validateDispatchRequest } from './validators.js'
export type { ValidationResult } from './validators.js'
export {
  JOURNEY_STAGES,
  resolveNextStage,
  isTerminalStage,
} from './state-machine.js'
export { routeForJourney, _ROUTES_INTERNAL } from './routes-map.js'
export type { L2Route, DispatchMode } from './routes-map.js'
export {
  JOURNEY_TYPES,
  TRIGGER_TYPES,
  JOURNEY_STATUSES,
  type JourneyType,
  type TriggerType,
  type JourneyStatus,
  type DispatchRequest,
  type DispatchResult,
  type JourneyStateRow,
} from './types.js'
