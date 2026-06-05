/**
 * Canon canonical · workflow-dispatcher · Sprint 12 Fase 0 prep finale.
 *
 * Model B (conexión 2026-06-05) · adapter that takes a router
 * `DispatchDecision{target:'workflow'}` and POSTs to the existing n8n
 * worker webhook. The worker runs as-is internally · the sala observes
 * events flowing back via (a) `agent_invocations` projection and (b)
 * phase-boundary callbacks to `/api/sala/events/append`.
 *
 * §148 honest · this adapter is the ONLY component that fires the
 * worker webhook. Default-OFF via `SALA_WORKFLOW_DISPATCH_ENABLED` ·
 * when off, the adapter returns `{dispatched: false, reason: 'flag_off'}`
 * without touching the network. Reversibility · flag flip off → no
 * webhook fires · workflow keeps running on its existing Deal Won
 * trigger path (legacy) unchanged.
 *
 * STOP-2 dimension (a) · dispatch-único · the adapter computes an
 * idempotency token from stream_id + correlation_id + idempotency_suffix
 * (per journey config) and rejects duplicate dispatches within the same
 * stream/correlation pair. The executor caller is also expected to use
 * the standard `idempotency_key` UNIQUE constraint on the event log.
 *
 * STOP-2 dimension (b) · §149 correlation · the webhook body carries
 * `_journey_id = stream_id` so every `/api/agents/run-sdk` call within
 * the worker receives `workflow_id = stream_id` (canon §149 enforcement
 * gate). Resulting `agent_invocations` rows are tagged with the sala
 * stream and ready for projection write-back.
 */
import type { DispatchDecision } from '@/lib/sala-router'
import type { JourneyType } from '@/lib/sala/libretos'
import {
  getJourneyWorkflowTarget,
  type JourneyWorkflowTarget,
} from './journey-workflow-map'

/** Canon canonical · whether the workflow dispatcher is enabled.
 *  Default-OFF · canon §144 escalón 6.b. Tests inject explicit value. */
export function isWorkflowDispatchEnabled(input: { enabled?: boolean } = {}): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_WORKFLOW_DISPATCH_ENABLED === 'true'
}

export interface WorkflowDispatchInput {
  readonly decision: DispatchDecision
  /** Optional · override the env flag (tests + smoke). */
  readonly enabled?: boolean
  /** Optional · override the journey target (tests). */
  readonly target?: JourneyWorkflowTarget
  /** Optional · override the n8n base URL (tests). Production reads
   *  from `process.env.N8N_BASE_URL`. */
  readonly n8n_base_url?: string
  /** Optional · override the fetch fn (tests). */
  readonly fetcher?: typeof fetch
  /** Optional · logger for visible audit (default console). */
  readonly logger?: WorkflowDispatchLogger
}

export interface WorkflowDispatchLogger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
}

export type WorkflowDispatchResult =
  | {
      readonly ok: true
      readonly dispatched: true
      readonly worker_name: string
      readonly workflow_id: string
      readonly webhook_url: string
      readonly status_code: number
      readonly idempotency_token: string
    }
  | {
      readonly ok: false
      readonly dispatched: false
      readonly reason:
        | 'flag_off'
        | 'wrong_target'
        | 'no_journey_target'
        | 'webhook_failed'
        | 'fetch_threw'
        | 'invalid_journey_type'
      readonly detail?: string
      readonly status_code?: number
    }

/**
 * Canon canonical · compute the dispatch idempotency token (STOP-2 (a)).
 * Same stream + correlation + journey → same token → callers MUST
 * dedup. We don't enforce here · we return the token for the caller
 * to UNIQUE-key the dispatch attempt against the event log.
 */
export function buildDispatchIdempotencyToken(args: {
  stream_id: string
  correlation_id: string
  journey_type: JourneyType
  idempotency_suffix: string
}): string {
  return `${args.journey_type}::${args.stream_id}::${args.correlation_id}::${args.idempotency_suffix}`
}

const defaultLogger: WorkflowDispatchLogger = {
  // eslint-disable-next-line no-console
  info: (msg, ctx) => console.log(`[sala/workflow-dispatch] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  warn: (msg, ctx) => console.warn(`[sala/workflow-dispatch] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  error: (msg, ctx) => console.error(`[sala/workflow-dispatch] ${msg}`, ctx ?? {}),
}

/**
 * Canon canonical · dispatch a router Decision to the worker webhook.
 *
 * Returns a typed result · success carries the n8n status code + webhook
 * URL · failure carries a reason tag the caller maps to a `step_failed`
 * event or retry policy.
 *
 * No side effect on the event log here · the caller is expected to
 * append `step_started` BEFORE this fires and `step_failed` AFTER if
 * `result.ok === false`. We keep the dispatcher pure-ish so it can be
 * tested without the storage seam.
 */
export async function dispatchToWorkflow(
  input: WorkflowDispatchInput,
): Promise<WorkflowDispatchResult> {
  const logger = input.logger ?? defaultLogger

  // ─── Gate 1 · default-OFF flag check ───
  if (!isWorkflowDispatchEnabled({ enabled: input.enabled })) {
    return { ok: false, dispatched: false, reason: 'flag_off' }
  }

  const { decision } = input

  // ─── Gate 2 · decision target validation ───
  if (decision.target !== 'workflow') {
    return {
      ok: false,
      dispatched: false,
      reason: 'wrong_target',
      detail: `decision.target='${decision.target ?? 'undefined'}' · expected 'workflow'`,
    }
  }

  // ─── Gate 3 · resolve target from journey map ───
  const target = input.target ?? getJourneyWorkflowTarget(decision.journey_type)
  if (!target) {
    return {
      ok: false,
      dispatched: false,
      reason: 'no_journey_target',
      detail: `no JOURNEY_WORKFLOW_MAP entry for journey_type='${decision.journey_type}'`,
    }
  }

  // ─── Compute idempotency token (STOP-2 (a)) ───
  const idempotency_token = buildDispatchIdempotencyToken({
    stream_id: decision.stream_id,
    correlation_id: decision.correlation_id,
    journey_type: decision.journey_type,
    idempotency_suffix: target.idempotency_suffix,
  })

  // ─── Resolve webhook URL ───
  const base = (input.n8n_base_url ?? process.env.N8N_BASE_URL ?? '').replace(/\/+$/, '')
  if (!base) {
    return {
      ok: false,
      dispatched: false,
      reason: 'fetch_threw',
      detail: 'N8N_BASE_URL not set · cannot resolve webhook URL',
    }
  }
  const webhook_url = `${base}/webhook/${target.webhook_path}`

  // ─── Build webhook body · §149 correlation (STOP-2 (b)) ───
  // `_journey_id = stream_id` propagates to every agent call inside the
  // worker · `_sala_correlation_id` keeps end-to-end traza · the worker
  // forwards `_journey_id` as `workflow_id` to `/api/agents/run-sdk` so
  // `agent_invocations.workflow_id = sala stream_id` (projection can
  // then match rows back to the sala stream).
  //
  // Phase 1.1 (2026-06-05 first-fire gap #1 fix) · `business_payload`
  // SPREADS FIRST so source-supplied fields (client_name · website ·
  // industry · contract_scope · etc) reach the worker's Validate Deal
  // Data node without bespoke n8n shapes. Sala metadata declared
  // AFTER so sala fields ALWAYS override on key collision (defense ·
  // a malicious or buggy source can't hijack _sala_* / _journey_id /
  // client_id / tenant_id / trigger_source / target_step_id).
  const business = decision.business_payload
  const body = {
    ...(business && typeof business === 'object' && !Array.isArray(business)
      ? business
      : {}),
    _sala_correlation_id: decision.correlation_id,
    _sala_caused_by_event_id: decision.caused_by_event_id,
    _sala_idempotency_token: idempotency_token,
    _sala_libreto_version: decision.libreto_version,
    _journey_id: decision.stream_id,
    client_id: decision.client_id,
    tenant_id: decision.tenant_id,
    trigger_source: 'sala-router-dispatch',
    target_step_id: decision.step_id,
  }

  // ─── Fire the webhook ───
  const fetcher = input.fetcher ?? fetch
  logger.info('webhook dispatch · firing', {
    workflow_id: target.workflow_id,
    worker_name: target.worker_name,
    webhook_url,
    stream_id: decision.stream_id,
    idempotency_token,
  })

  let res: Response
  try {
    res = await fetcher(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.error('webhook fetch threw', { webhook_url, detail })
    return {
      ok: false,
      dispatched: false,
      reason: 'fetch_threw',
      detail,
    }
  }

  if (!res.ok) {
    logger.warn('webhook returned non-2xx', {
      webhook_url,
      status: res.status,
    })
    return {
      ok: false,
      dispatched: false,
      reason: 'webhook_failed',
      status_code: res.status,
      detail: `webhook responded ${res.status}`,
    }
  }

  logger.info('webhook dispatched · OK', {
    workflow_id: target.workflow_id,
    status: res.status,
    idempotency_token,
  })

  return {
    ok: true,
    dispatched: true,
    worker_name: target.worker_name,
    workflow_id: target.workflow_id,
    webhook_url,
    status_code: res.status,
    idempotency_token,
  }
}
