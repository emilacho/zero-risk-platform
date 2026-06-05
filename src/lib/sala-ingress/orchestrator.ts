/**
 * Canon canonical · orchestrator · sala-ingress · emits event to log.
 *
 * Opus VEREDICTO §VEREDICTO · "la entrada NO despacha · solo emite un
 * evento al event-log · el ROUTER despacha". This function does ONLY ·
 *   1. validate envelope shape
 *   2. lookup source (ingress_sources)
 *   3. authenticate per tier
 *   4. enforce intent scope
 *   5. lookup routing rule (routing_rules)
 *   6. mint stream_id + correlation_id (§149 nace en la entrada)
 *   7. append `step_completed` event to sala_event_log via the canon
 *      buildIdempotencyKey path so dedup naturally collapses replays
 *
 * NO worker webhook fire. NO dispatcher call. NO router invocation.
 * The router/dispatcher chain consumes the event log SEPARATELY (canon
 * §148 single dispatcher · ADR-018).
 *
 * §148 honest · this is the SHADOW path · default-OFF via the route's
 * SALA_INTAKE_ENABLED flag. Tests inject mocks · production wires the
 * Supabase adapter + the real INTERNAL_API_KEY env.
 */
import {
  buildIdempotencyKey,
  type EventAppendInput,
  type EventLogStorage,
} from '@/lib/sala-event-log'
import { checkSourceAuth, type AuthDecision } from './auth'
import { checkIntentScope, interpretRoutingRule } from './routing'
import { mintCorrelationId, mintStreamId } from './stream-id'
import type {
  IngressAuthRequest,
  IngressEnvelope,
  IngressResult,
  IngressTablesAdapter,
} from './types'

export interface OrchestratorInput {
  readonly envelope: IngressEnvelope
  readonly auth_request: IngressAuthRequest
  readonly tables: IngressTablesAdapter
  readonly storage: EventLogStorage
  /** Optional · override secret value for tests (auth) */
  readonly auth_secret_override?: string
  /** Optional · clock + window override for tests */
  readonly auth_now_ms?: number
  readonly auth_window_ms?: number
}

/**
 * Canon canonical · the single entrypoint for ingress orchestration.
 * Returns `IngressResult` (accepted | duplicate | refused) · TOTAL
 * function · cero silent drops.
 */
export async function orchestrateIngress(
  input: OrchestratorInput,
): Promise<IngressResult> {
  const env = input.envelope

  // ─── Step 2 · source lookup ───
  const source = await input.tables.getSource(env.source)
  if (!source) {
    return {
      kind: 'refused',
      code: 'unknown_source',
      detail: `source "${env.source}" not in ingress_sources`,
    }
  }
  if (!source.active) {
    return {
      kind: 'refused',
      code: 'source_inactive',
      detail: `source "${env.source}" is inactive`,
    }
  }

  // ─── Step 3 · authenticate per tier ───
  const auth: AuthDecision = checkSourceAuth({
    source,
    request: input.auth_request,
    secret_value: input.auth_secret_override,
    now_ms: input.auth_now_ms,
    window_ms: input.auth_window_ms,
  })
  if (!auth.ok) {
    // Tier C public_gate refuses with a dedicated code so the caller
    // sees the gap explicitly.
    if (auth.reason.startsWith('tier_c_filter_not_implemented')) {
      return {
        kind: 'refused',
        code: 'tier_c_filter_not_implemented',
        detail: auth.reason,
      }
    }
    return {
      kind: 'refused',
      code: 'unauthorized',
      detail: auth.reason,
    }
  }

  // ─── Step 4 · intent scope ───
  const scope = checkIntentScope({ source, intent: env.intent })
  if (!scope.ok) {
    if (scope.reason === 'source_inactive') {
      return {
        kind: 'refused',
        code: 'source_inactive',
        detail: 'source flag flipped between lookups',
      }
    }
    return {
      kind: 'refused',
      code: 'intent_not_in_scope',
      detail: scope.reason,
    }
  }

  // ─── Step 5 · routing rule lookup ───
  const rule = await input.tables.getRoutingRule(env.source, env.intent)
  if (!rule) {
    return {
      kind: 'refused',
      code: 'no_routing_rule',
      detail: `no routing_rule for (source="${env.source}", intent="${env.intent}")`,
    }
  }
  const routing = interpretRoutingRule(rule)
  if (!routing.ok) {
    return {
      kind: 'refused',
      code: 'no_routing_rule',
      detail: routing.reason,
    }
  }

  // ─── Step 6 · mint stream_id + correlation_id (§149 nace en la entrada) ───
  const stream_id =
    env.stream_id ??
    mintStreamId({
      source: env.source,
      intent: env.intent,
      idempotency_key: env.idempotency_key,
      logical_period: env.logical_period,
      tenant_id: env.tenant_id,
      client_id: env.client_id,
    })
  const correlation_id = env.correlation_id ?? mintCorrelationId()

  // ─── Step 7 · append step_completed event at entry step ───
  const operation_type = `${routing.value.journey_type}.intake.${env.source}.${env.intent}`
  const log_idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id: env.client_id,
    logical_period: env.logical_period,
    input_hash: env.idempotency_key,
  })

  const eventInput: EventAppendInput = {
    tenant_id: env.tenant_id,
    client_id: env.client_id,
    stream_id,
    correlation_id,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: routing.value.journey_type,
    operation_type,
    idempotency_key: log_idempotency_key,
    logical_period: env.logical_period,
    step_id: `intake.${env.source}.${env.intent}`,
    step_state: 'done',
    payload: {
      source: 'sala-ingress',
      intake_source: env.source,
      intake_intent: env.intent,
      intake_tier: source.tier,
      intake_auth_method: source.auth_method,
      worker_workflow_id: routing.value.worker_workflow_id,
      envelope_payload: env.payload,
    },
    gate_type: null,
  }

  let event_id: string
  let inserted: boolean
  try {
    const result = await input.storage.insert(eventInput)
    event_id = result.event.event_id
    inserted = result.inserted
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return {
      kind: 'refused',
      code: 'append_failed',
      detail,
    }
  }

  if (!inserted) {
    return {
      kind: 'duplicate',
      event_id,
      stream_id,
      journey_type: routing.value.journey_type,
      worker_workflow_id: routing.value.worker_workflow_id,
    }
  }

  return {
    kind: 'accepted',
    event_id,
    stream_id,
    journey_type: routing.value.journey_type,
    worker_workflow_id: routing.value.worker_workflow_id,
    inserted: true,
  }
}
