/**
 * Canon canonical · per-intake dispatch · sala-router-consumer.
 *
 * Takes a parsed intake event · constructs a DispatchDecision with
 * target='workflow' · invokes the Model B workflow-dispatcher · returns
 * the outcome. ADR-018 single dispatcher · this is the only call-site
 * for `dispatchToWorkflow` in the journey-dispatch chain.
 *
 * §148 honest · the workflow-dispatcher is default-OFF via
 * `SALA_WORKFLOW_DISPATCH_ENABLED` (PR #172). When off, the dispatcher
 * returns `flag_off` and this consumer surfaces it as the
 * `skipped_dispatcher_off` outcome.
 */
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import {
  dispatchToWorkflow,
  getJourneyWorkflowTarget,
  type WorkflowDispatchResult,
} from '@/lib/sala-journey-dispatch'
import type { DispatchDecision } from '@/lib/sala-router'
import type {
  DispatchOutcomeKind,
  ParsedIntakeEvent,
} from './types'

export interface DispatchOneInput {
  readonly intake: ParsedIntakeEvent
  readonly enabled?: boolean
  readonly n8n_base_url?: string
  readonly fetcher?: typeof fetch
}

export interface DispatchOneResult {
  readonly kind: DispatchOutcomeKind
  readonly detail: string
  readonly workflow_dispatch_result?: WorkflowDispatchResult
}

/**
 * Canon canonical · dispatch one intake event to the worker · Model B.
 * Returns a typed outcome the orchestrator maps to a marker payload.
 */
export async function dispatchOneIntake(
  input: DispatchOneInput,
): Promise<DispatchOneResult> {
  const { intake } = input

  // ─── 1 · resolve workflow target from JOURNEY_WORKFLOW_MAP ───
  // Trust-but-verify · intake event embeds worker_workflow_id at
  // ingress time · we cross-reference with JOURNEY_WORKFLOW_MAP to
  // get the webhook_path. If the journey is not mapped, skip with a
  // typed outcome (router can't dispatch journeys without map entry).
  const map_target = getJourneyWorkflowTarget(intake.journey_type)
  if (!map_target) {
    return {
      kind: 'skipped_unknown_journey',
      detail: `journey_type "${intake.journey_type}" not in JOURNEY_WORKFLOW_MAP · agent path or pending §144`,
    }
  }
  // §148 honest · if the embedded worker_workflow_id doesn't match the
  // map (drift), prefer the map (canonical) and flag.
  const workflow_id =
    intake.worker_workflow_id === map_target.workflow_id
      ? intake.worker_workflow_id
      : map_target.workflow_id

  // ─── 2 · build DispatchDecision shape ───
  const decision_step_id = `router.dispatch.${intake.intake_source}.${intake.intake_intent}`
  const operation_type = `${intake.journey_type}.${decision_step_id}`
  const logical_period = intake.source_event.logical_period
  const idempotency_inputs = {
    operation_type,
    client_id: intake.client_id,
    logical_period,
    input_hash: intake.event_id,
  }
  const idempotency_key = buildIdempotencyKey(idempotency_inputs)

  const decision: DispatchDecision = {
    kind: 'dispatch',
    stream_id: intake.stream_id,
    correlation_id: intake.correlation_id,
    tenant_id: intake.tenant_id,
    client_id: intake.client_id,
    journey_type: intake.journey_type,
    step_id: decision_step_id,
    agent_id: 'sala-router-consumer',
    attempt: 1,
    idempotency_key,
    idempotency_inputs,
    libreto_version: 1,
    caused_by_event_id: intake.event_id,
    target: 'workflow',
    workflow_target: {
      workflow_id,
      webhook_path: map_target.webhook_path,
      webhook_url: '', // dispatcher derives from n8n_base_url + webhook_path
    },
  }

  // ─── 3 · fire via workflow-dispatcher · Model B (#172) ───
  const result = await dispatchToWorkflow({
    decision,
    enabled: input.enabled,
    n8n_base_url: input.n8n_base_url,
    fetcher: input.fetcher,
  })

  // ─── 4 · map result to outcome kind ───
  if (result.ok) {
    return {
      kind: 'dispatched_ok',
      detail: `webhook ${result.webhook_url} responded ${result.status_code}`,
      workflow_dispatch_result: result,
    }
  }
  if (result.reason === 'flag_off') {
    return {
      kind: 'skipped_dispatcher_off',
      detail: 'SALA_WORKFLOW_DISPATCH_ENABLED!=true · shadow path',
      workflow_dispatch_result: result,
    }
  }
  return {
    kind: 'dispatched_failed',
    detail: `dispatcher reason=${result.reason} · ${result.detail ?? ''}`,
    workflow_dispatch_result: result,
  }
}
