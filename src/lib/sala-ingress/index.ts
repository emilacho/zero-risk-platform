/**
 * Public surface · `src/lib/sala-ingress/` · Phase 1 prep · Opus VEREDICTO 2026-06-05.
 *
 * Mechanism canon · POST /api/sala/intake → emits event to sala_event_log
 * → router consumes separately. NEVER `intake → dispatch` (would be 2
 * dispatchers · violates ADR-018).
 *
 * §148 honest · default-OFF via the route's SALA_INTAKE_ENABLED flag.
 */

export type {
  AuthMethod,
  IngressAuthRequest,
  IngressEnvelope,
  IngressResult,
  IngressSource,
  IngressTablesAdapter,
  RefuseCode,
  RoutingRule,
  SourceTier,
} from './types'

export { parseIngressEnvelope, type ParseResult } from './validation'

export {
  checkSourceAuth,
  computeHmac,
  type AuthCheckInput,
  type AuthDecision,
} from './auth'

export {
  checkIntentScope,
  interpretRoutingRule,
  type RoutingDecision,
  type ScopeDecision,
} from './routing'

export {
  mintCorrelationId,
  mintStreamId,
  type MintStreamIdInput,
} from './stream-id'

export { InMemoryIngressTables } from './in-memory-adapter'
export { SupabaseIngressTables } from './supabase-adapter'

export {
  orchestrateIngress,
  type OrchestratorInput,
} from './orchestrator'

/** Canon canonical · whether the intake endpoint is enabled. Default-OFF.
 *  Tests inject explicit value. Production reads SALA_INTAKE_ENABLED. */
export function isIntakeEnabled(input: { enabled?: boolean } = {}): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_INTAKE_ENABLED === 'true'
}
