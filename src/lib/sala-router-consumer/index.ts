/**
 * Public surface · `src/lib/sala-router-consumer/` · Phase 1 prep.
 *
 * The CONSUMER side · cierra el chain ingress → log → consumer →
 * workflow-dispatcher Model B → worker. Canon ADR-018 single
 * dispatcher · this is the ONLY place that invokes `dispatchToWorkflow`
 * for journey dispatches.
 *
 * §148 honest · default-OFF via `SALA_ROUTER_CONSUMER_ENABLED`. With
 * the flag off, the orchestrator can still RUN (e.g. for testing the
 * tick shape) but the endpoint won't accept requests. Tests inject
 * explicit values.
 */

export {
  DISPATCH_MARKER_PREFIX,
  INTAKE_STEP_PREFIX,
  type ConsumerTickInput,
  type ConsumerTickResult,
  type DispatchOutcome,
  type DispatchOutcomeKind,
  type ParseResult,
  type ParsedIntakeEvent,
} from './types'

export { isIntakeEvent, parseIntakeEvent } from './parsing'

export { selectPendingIntakeEvents } from './query'
export type { PendingIntakeQueryInput } from './query'

export { buildDispatchMarkerEvent } from './marker'
export type { BuildMarkerInput } from './marker'

export { dispatchOneIntake } from './dispatch'
export type { DispatchOneInput, DispatchOneResult } from './dispatch'

export { consumeIntakeTick } from './orchestrator'
export type { OrchestratorInput } from './orchestrator'

/** Canon canonical · whether the consumer endpoint is enabled.
 *  Default-OFF · canon §144 escalón 6 sibling. Tests inject explicit. */
export function isConsumerEnabled(input: { enabled?: boolean } = {}): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_ROUTER_CONSUMER_ENABLED === 'true'
}
