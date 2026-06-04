/**
 * Libreto interpreter · public re-exports · Track G.
 *
 * The router (Track H · CC#3) imports from this module ·
 *   import { resolveStep, createPredicateRegistry } from '@/lib/sala/interpreter'
 */
export * from './types'
export {
  CANONICAL_PREDICATES,
  canonicalPredicateRegistry,
  createPredicateRegistry,
} from './predicates'
export {
  collectPredicateNames,
  evaluateValidationRules,
  getStep,
  indexSteps,
  resolveAction,
  resolveFork,
  resolveGateInvocation,
  resolveGateOutcome,
  resolveJoin,
  resolveNextStepRef,
  resolveStep,
  verifyPredicatesRegistered,
} from './interpreter'
