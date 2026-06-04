/**
 * Public surface · `src/lib/sala-integration/`
 *
 * Sprint 12 Fase 0 Ronda 3 Track K · CC#1 · convergencia substrate.
 *
 * Composes the 4 CC#1 libs + motor (CC#4) + libretos (CC#4) en un
 * loop E2E shadow · Router/Interpreter STUB hasta que Tracks G/H
 * aterricen.
 *
 * Built on top of:
 *   - sala-event-log (Track A · PR #143) + Supabase adapter (Track J · PR #147)
 *   - sala-blackboard (Track D · PR #144)
 *   - sala-journey-state (Track F · PR #146)
 *   - sala/executor-contract + InngestExecutor (Track B · PR #142 CC#4)
 *   - sala/libretos (Track E · PR #145 CC#4)
 */

export type {
  DispatchDecision,
  StubRouter,
  RouterContext,
  StubInterpreter,
  NextStepResolution,
  SalaIntegrationConfig,
  RunStepInput,
  RunStepResult,
} from './types'

export {
  DefaultStubInterpreter,
  defaultStubInterpreter,
  evaluateStubPredicate,
} from './stub-interpreter'

export {
  DefaultStubRouter,
  defaultStubRouter,
} from './stub-router'

export type { DefaultStubRouterOptions } from './stub-router'

export { SalaIntegration } from './harness'

// canon canonical · Track L · convergencia · real wired-up integration
export { RealSalaIntegration } from './real-harness'
export type {
  RealSalaIntegrationConfig,
  KickstartInput,
  ProcessEventResult,
  RunUntilHaltResult,
} from './real-harness'

export { createInterpreterAdapter } from './interpreter-adapter'
export type { InterpreterAdapterOptions } from './interpreter-adapter'
