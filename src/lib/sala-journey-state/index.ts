/**
 * Public surface · `src/lib/sala-journey-state/`
 *
 * Sprint 12 Fase 0 Ronda 3 Track F · CC#1.
 *
 * Pure projection sobre `sala_event_log` que canon canonical-deriva el journey
 * state de un stream (journey · current_step · status · pending gates/judgments).
 * Lo que el router lee para saber "dónde está" cada cosa.
 *
 * Built on top of canon canonical `src/lib/sala-event-log/` (Track A · PR #143).
 */

export type {
  JourneyStatus,
  JourneyState,
  PendingGate,
  PendingJudgment,
  ReadJourneyStateInput,
} from './types'

export { JOURNEY_STATUSES } from './types'

export { projectJourneyState } from './projection'
export type { ProjectJourneyStateOptions } from './projection'

export { readJourneyState } from './read'
