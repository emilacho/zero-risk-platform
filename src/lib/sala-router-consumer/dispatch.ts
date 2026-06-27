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
import { dispatchCostMonitorAlert } from '@/lib/cost-monitor-alert'
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import {
  dispatchToWorkflow,
  evaluateNaufragoRunCap,
  getJourneyWorkflowTarget,
  isNaufragoCapEnforced,
  NAUFRAGO_TENANT_IDS,
  type NaufragoCostCapResult,
  type WorkflowDispatchResult,
} from '@/lib/sala-journey-dispatch'
import type { DispatchDecision } from '@/lib/sala-router'
import type {
  DispatchOutcomeKind,
  ParsedIntakeEvent,
} from './types'

/**
 * Canon canonical · cap-wire query surface · the consumer needs to know
 * how much the tenant has spent in the current run/window before deciding
 * to dispatch (SPEC lazo agentico 2026-06-05 §gap §150). Implementations ·
 * tests pass an in-memory stub · production wires to Supabase
 * `agent_invocations.cost_usd SUM` per tenant since the stream start (or
 * a configurable window).
 */
export type CapSpendQuery = (input: {
  readonly tenant_id: string
  readonly stream_id: string
  readonly correlation_id: string
}) => Promise<number>

/**
 * Canon canonical · §150 #5 cap-breach alert context · the real-time nudge
 * fired when the per-run cap BLOCKS a dispatch. The durable audit record is
 * the marker event (orchestrator) · this alert is the human-facing signal.
 */
export interface CapAlertContext {
  readonly tenant_id: string
  readonly stream_id: string
  readonly correlation_id: string
  readonly workflow_id: string
  readonly cap_usd: number
  readonly spent_usd: number
}

/**
 * Canon canonical · injected alert sink · fired ONLY on a cap BLOCK. Best-
 * effort · the dispatcher swallows any throw (canon §148 · never block the
 * safety-net path on a Slack/alert outage). Tests inject a spy · production
 * defaults to `defaultCapAlerter` (Slack via `dispatchCostMonitorAlert`).
 */
export type CapAlerter = (ctx: CapAlertContext) => Promise<void>

/**
 * Canon canonical · default cap-breach alerter · routes through the §150 G5
 * Slack dispatcher (`SLACK_WEBHOOK_URL_EQUIPO`). Maps the per-run cap breach
 * to a `per_run_cap` CostMonitorBreach so the existing alert formatter +
 * run_id forensics line are reused (single Slack path · canon §150 #5).
 */
async function defaultCapAlerter(ctx: CapAlertContext): Promise<void> {
  await dispatchCostMonitorAlert({
    breaches: [
      {
        type: 'per_run_cap',
        workflow_id: ctx.workflow_id,
        spend_usd: ctx.spent_usd,
        threshold: ctx.cap_usd,
      },
    ],
    aggregate_24h_usd: ctx.spent_usd,
    aggregate_1h_usd: ctx.spent_usd,
    invocations_24h: 0,
    invocations_1h: 0,
    run_id: ctx.correlation_id,
    ran_at: new Date().toISOString(),
  })
}

export interface DispatchOneInput {
  readonly intake: ParsedIntakeEvent
  readonly enabled?: boolean
  readonly n8n_base_url?: string
  readonly fetcher?: typeof fetch
  /**
   * Canon canonical · optional · forces the §150 cap enforce path (tests).
   * Production defers to `SALA_NAUFRAGO_RUN_CAP_ENFORCE` env var via
   * `isNaufragoCapEnforced()`.
   */
  readonly cap_enforce_override?: boolean
  /**
   * Canon canonical · injected spend query · defaults to a noop returning 0
   * (cap effectively pass for non-Náufrago tenants OR when no caller wires
   * a real query). Production wraps Supabase RPC / select sum (see
   * `wireCapSpendQuerySupabase` in orchestrator).
   */
  readonly cap_spend_query?: CapSpendQuery
  /**
   * Canon canonical · injected cap-breach alerter · fired ONLY when the
   * §150 #5 per-run cap BLOCKS. Defaults to `defaultCapAlerter` (Slack via
   * `dispatchCostMonitorAlert`). Best-effort · a throw here NEVER changes the
   * `skipped_cap_blocked` outcome. Tests inject a spy to assert it fired.
   */
  readonly cap_alerter?: CapAlerter
}

export interface DispatchOneResult {
  readonly kind: DispatchOutcomeKind
  readonly detail: string
  readonly workflow_dispatch_result?: WorkflowDispatchResult
  /** Canon canonical · the cap evaluation outcome · always populated when
   *  the cap was evaluated (Náufrago tenant + enforce on) · for surface
   *  + marker payload + observability. */
  readonly cap_evaluation?: NaufragoCostCapResult
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

  // Phase 1.1 (2026-06-05 first-fire gap #1 fix) · forward the
  // envelope_payload from the intake event to the dispatcher as
  // `business_payload`. The dispatcher spreads it INTO the webhook
  // body BEFORE the sala metadata (sala fields always win on
  // collision). Without this, source-supplied business fields like
  // `client_name · website · industry · contract_scope` never reach
  // the worker's Validate Deal Data node.
  const intake_payload = (intake.source_event.payload ?? {}) as Record<
    string,
    unknown
  >
  const raw_envelope_payload = intake_payload.envelope_payload
  const business_payload =
    raw_envelope_payload &&
    typeof raw_envelope_payload === 'object' &&
    !Array.isArray(raw_envelope_payload)
      ? (raw_envelope_payload as Record<string, unknown>)
      : undefined

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
    ...(business_payload ? { business_payload } : {}),
  }

  // ─── 2.5 · cap-wire (SPEC lazo agentico 2026-06-05 · gap §150) ───
  // Before dispatching · evaluate the Náufrago per-run cap. The cap function
  // exists since Phase 1.1 (gap #2 fix · UUID engagement verified) · this
  // is the FIRST call-site that wires it into the dispatch flow. Behavior ·
  //   - cap NOT enforced (`SALA_NAUFRAGO_RUN_CAP_ENFORCE!=true`) → noop pass
  //   - cap enforced + tenant NOT Náufrago (UUID or alias) → pass (other_tenant)
  //   - cap enforced + Náufrago + spend < cap → pass (under_cap)
  //   - cap enforced + Náufrago + spend >= cap → BLOCK (skipped_cap_blocked)
  //
  // The spend query is INJECTED so this lib stays pure · the orchestrator
  // wires the production Supabase impl. When no query provided, default to
  // 0 spend (safe · pass through · matches behavior before this PR).
  let cap_evaluation: NaufragoCostCapResult | undefined
  const cap_enforced = isNaufragoCapEnforced({ enforce: input.cap_enforce_override })
  const is_naufrago_tenant = NAUFRAGO_TENANT_IDS.has(intake.tenant_id)
  if (cap_enforced && is_naufrago_tenant) {
    const spent_usd = input.cap_spend_query
      ? await input.cap_spend_query({
          tenant_id: intake.tenant_id,
          stream_id: intake.stream_id,
          correlation_id: intake.correlation_id,
        })
      : 0
    cap_evaluation = evaluateNaufragoRunCap({
      tenant_id: intake.tenant_id,
      spent_usd,
      enforce: true,
    })
    if (cap_evaluation.verdict === 'block') {
      // §150 #5 · real-time alert on cap-block · best-effort. The marker
      // event (orchestrator) is the durable audit record · this is the
      // human-facing nudge. NEVER throws · a Slack/alert outage must not
      // change the skipped_cap_blocked outcome (canon §148 safety-net).
      // Reached ONLY when enforce ON + Náufrago tenant + over cap → stays
      // inert in shadow (NO flag flipped by this wire).
      const alerter = input.cap_alerter ?? defaultCapAlerter
      try {
        await alerter({
          tenant_id: intake.tenant_id,
          stream_id: intake.stream_id,
          correlation_id: intake.correlation_id,
          workflow_id,
          cap_usd: cap_evaluation.cap_usd,
          spent_usd: cap_evaluation.spent_usd,
        })
      } catch {
        // swallow · alert is best-effort · the block + audit trail stand.
      }
      return {
        kind: 'skipped_cap_blocked',
        detail: `cap §150 blocked · spent=$${cap_evaluation.spent_usd.toFixed(2)} >= cap=$${cap_evaluation.cap_usd.toFixed(2)} · tenant=${intake.tenant_id.slice(0, 8)}`,
        cap_evaluation,
      }
    }
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
      ...(cap_evaluation ? { cap_evaluation } : {}),
    }
  }
  if (result.reason === 'flag_off') {
    return {
      kind: 'skipped_dispatcher_off',
      detail: 'SALA_WORKFLOW_DISPATCH_ENABLED!=true · shadow path',
      workflow_dispatch_result: result,
      ...(cap_evaluation ? { cap_evaluation } : {}),
    }
  }
  return {
    kind: 'dispatched_failed',
    detail: `dispatcher reason=${result.reason} · ${result.detail ?? ''}`,
    workflow_dispatch_result: result,
    ...(cap_evaluation ? { cap_evaluation } : {}),
  }
}
