/**
 * Inngest wire · public re-exports · Escalón 2 SHADOW.
 *
 * Consumers (smoke scripts, future router wire) import from here so
 * the internal module layout can move without touching callers.
 */
export {
  INNGEST_APP_ID,
  inngestClient,
  getSalaInngestMode,
  type SalaInngestMode,
} from './client'
export {
  SYNTHETIC_DURABILITY_EVENT,
  SYNTHETIC_FUNCTIONS,
  syntheticDurabilityTest,
} from './synthetic-functions'
export { LIVE_FUNCTIONS } from './live-functions'
export {
  EDITORIAL_GATE_REQUESTED_EVENT,
  EDITORIAL_DECISION_RESOLVED_EVENT,
  EDITORIAL_GATE_TIMEOUT,
  editorialGateFn,
  decideEditorialOutcome,
  type EditorialGateRequest,
  type EditorialResolution,
  type EditorialGateOutcome,
} from './editorial-gate'
export {
  getResumeHookMode,
  emitEditorialResolution,
  buildEditorialResolutionFromReviewRow,
  type ResumeHookMode,
  type CaminoReviewRow,
  type EmitEditorialResolutionResult,
} from './resume-emitter'
