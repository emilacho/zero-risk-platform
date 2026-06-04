/**
 * Canon canonical · public surface of `src/lib/sala-router/` ·
 * Sprint 12 Fase 0 Ronda 3 Track H · CC#3.
 *
 * The `decide` function is the heart of the sala router (the
 * "una sola cosa despacha" canon per ADR-018). It is STATELESS:
 * given an event + the journey-state projection, it returns one or
 * more decisions · cero estado propio, replayable, function TOTAL.
 *
 * It is also SHADOW · the router does NOT execute decisions in
 * this PR. The Mitad 2 wire-up (§144-gated) feeds dispatches to the
 * executor (PR #142) and writes the decisions back to the event log.
 *
 * See `decide.ts` for the algorithm + `types.ts` for the contracts.
 */

export { decide } from './decide'
export type {
  Decision,
  DispatchDecision,
  GatePendingDecision,
  TerminalDecision,
  NeedsJudgmentDecision,
  BudgetBlockedDecision,
  NeedsJudgmentReason,
  DecideInput,
  LibretoLookup,
  ResolveNextStepFn,
  NextStepResolution,
  BudgetCheckFn,
  BudgetCheckInput,
  BudgetCheckResult,
  IdempotencyInputs,
} from './types'

export {
  interpreterStub,
  allowAllBudgetStub,
  denyByKeyBudgetStub,
} from './stubs'
