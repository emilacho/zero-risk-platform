/**
 * Canon canonical · OBSERVE-mode reconciliation · Sprint 12 Fase 0 prep finale.
 *
 * Model B (conexión 2026-06-05) · the worker (n8n workflow) emits an
 * event at each PHASE BOUNDARY (coarse-grain libreto) · the sala
 * receives it via `/api/sala/events/append` · this module reconciles
 * the emitted phase vs the libreto's expected next phase. Mismatch
 * (skipped · backwards · unknown phase) emits a VISIBLE alert (log +
 * Slack #equipo) but **does NOT halt** the worker · the worker is the
 * source of truth · the sala only observes + flags.
 *
 * §148 honest · this is NEVER a control gate. The reconciliation
 * logic only DESCRIBES discrepancies. The caller decides what to do
 * (always · append the event AND fire the alert · NEVER block).
 *
 * Inputs ·
 *   - emitted_phase_step_id · what the worker just emitted
 *   - last_phase_step_id · what the sala last recorded (from journey_state)
 *   - phase_boundaries · the ordered list from JOURNEY_WORKFLOW_MAP
 *     for this journey
 *
 * Outputs (pure) ·
 *   - `match` · emitted phase is the expected next OR the same as last
 *   - `skipped_ahead` · emitted phase is N steps further than expected
 *     (worker may have raced ahead OR an earlier boundary was lost)
 *   - `backwards` · emitted phase is before the last recorded · likely
 *     replay or a worker-side bug
 *   - `unknown_phase` · emitted phase is NOT in the boundary list at all
 *
 * Slack alert (separate side-effect helper) · matches the DLQ-handler
 * shape (canon pattern · `[OBSERVE]` prefix · best-effort · fail-open).
 */

export type ReconcileMismatchKind =
  | 'match'
  | 'skipped_ahead'
  | 'backwards'
  | 'unknown_phase'
  | 'no_baseline'

export interface ReconcileInput {
  readonly emitted_phase_step_id: string
  readonly last_phase_step_id: string | null
  readonly phase_boundaries: ReadonlyArray<string>
}

export interface ReconcileResult {
  readonly kind: ReconcileMismatchKind
  /** Canon canonical · expected next phase (or null when no baseline). */
  readonly expected_next: string | null
  /** Canon canonical · how many phases the emitted is ahead of expected.
   *  Negative when backwards · 0 when match · NaN when unknown_phase. */
  readonly delta: number
  /** Canon canonical · human-readable summary suitable for log + alert. */
  readonly summary: string
}

/**
 * Canon canonical · pure reconciliation · no IO · no side effects.
 *
 * Algorithm ·
 *   1. If emitted not in boundaries → unknown_phase
 *   2. If no last baseline (first phase) → either match (if emitted is
 *      index 0) or skipped_ahead (delta > 0)
 *   3. Otherwise compare emitted index vs last index:
 *      - emitted == last + 1 → match
 *      - emitted < last       → backwards
 *      - emitted > last + 1   → skipped_ahead (delta = emitted - last - 1)
 *      - emitted == last      → match (idempotent re-emit)
 */
export function reconcileObserved(input: ReconcileInput): ReconcileResult {
  const { emitted_phase_step_id, last_phase_step_id, phase_boundaries } = input

  const emittedIdx = phase_boundaries.indexOf(emitted_phase_step_id)
  if (emittedIdx < 0) {
    return {
      kind: 'unknown_phase',
      expected_next: null,
      delta: Number.NaN,
      summary: `emitted "${emitted_phase_step_id}" is NOT in the libreto phase_boundaries`,
    }
  }

  if (last_phase_step_id === null) {
    if (emittedIdx === 0) {
      return {
        kind: 'match',
        expected_next: phase_boundaries[1] ?? null,
        delta: 0,
        summary: `first phase emitted: "${emitted_phase_step_id}"`,
      }
    }
    return {
      kind: 'skipped_ahead',
      expected_next: phase_boundaries[0] ?? null,
      delta: emittedIdx,
      summary: `first phase observed is "${emitted_phase_step_id}" (boundary #${emittedIdx}) · expected to start at "${phase_boundaries[0] ?? '?'}" (#0) · delta=${emittedIdx}`,
    }
  }

  const lastIdx = phase_boundaries.indexOf(last_phase_step_id)
  if (lastIdx < 0) {
    return {
      kind: 'no_baseline',
      expected_next: phase_boundaries[0] ?? null,
      delta: 0,
      summary: `last recorded "${last_phase_step_id}" is NOT in the libreto phase_boundaries · cannot reconcile vs current emit "${emitted_phase_step_id}"`,
    }
  }

  if (emittedIdx === lastIdx) {
    return {
      kind: 'match',
      expected_next: phase_boundaries[lastIdx + 1] ?? null,
      delta: 0,
      summary: `idempotent re-emit of "${emitted_phase_step_id}"`,
    }
  }
  if (emittedIdx === lastIdx + 1) {
    return {
      kind: 'match',
      expected_next: phase_boundaries[lastIdx + 2] ?? null,
      delta: 0,
      summary: `emitted "${emitted_phase_step_id}" matches expected next from "${last_phase_step_id}"`,
    }
  }
  if (emittedIdx < lastIdx) {
    return {
      kind: 'backwards',
      expected_next: phase_boundaries[lastIdx + 1] ?? null,
      delta: emittedIdx - lastIdx,
      summary: `emitted "${emitted_phase_step_id}" (#${emittedIdx}) is BEFORE last recorded "${last_phase_step_id}" (#${lastIdx}) · delta=${emittedIdx - lastIdx} · likely replay or worker bug`,
    }
  }
  return {
    kind: 'skipped_ahead',
    expected_next: phase_boundaries[lastIdx + 1] ?? null,
    delta: emittedIdx - lastIdx - 1,
    summary: `emitted "${emitted_phase_step_id}" (#${emittedIdx}) skipped past expected "${phase_boundaries[lastIdx + 1] ?? '?'}" (#${lastIdx + 1}) · ${emittedIdx - lastIdx - 1} boundary(ies) missed`,
  }
}

// =====================================================================
// Slack alert helper · canon pattern from dead-letter-handler
// =====================================================================

export interface AlertLogger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
}

export interface PostReconciliationAlertInput {
  readonly result: ReconcileResult
  readonly journey_type: string
  readonly stream_id: string
  readonly emitted_phase_step_id: string
  readonly last_phase_step_id: string | null
  readonly slack_webhook_url?: string
  readonly fetch_impl?: typeof fetch
  readonly logger?: AlertLogger
}

const defaultAlertLogger: AlertLogger = {
  // eslint-disable-next-line no-console
  info: (msg, ctx) => console.log(`[sala/observe-alert] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  warn: (msg, ctx) => console.warn(`[sala/observe-alert] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  error: (msg, ctx) => console.error(`[sala/observe-alert] ${msg}`, ctx ?? {}),
}

/**
 * Canon canonical · post a VISIBLE alert when reconciliation finds a
 * non-match. Match results NEVER alert · they only log info. Fail-open
 * pattern · Slack webhook errors NEVER throw out of this helper.
 */
export async function postReconciliationAlert(
  input: PostReconciliationAlertInput,
): Promise<void> {
  const logger = input.logger ?? defaultAlertLogger

  // Match · log only · no Slack noise
  if (input.result.kind === 'match') {
    logger.info('reconciled · match', {
      journey_type: input.journey_type,
      stream_id: input.stream_id,
      emitted: input.emitted_phase_step_id,
      last: input.last_phase_step_id,
    })
    return
  }

  // Mismatch · log warn + Slack
  logger.warn('reconciliation mismatch', {
    journey_type: input.journey_type,
    stream_id: input.stream_id,
    kind: input.result.kind,
    delta: input.result.delta,
    emitted: input.emitted_phase_step_id,
    last: input.last_phase_step_id,
    expected_next: input.result.expected_next,
    summary: input.result.summary,
  })

  const url =
    input.slack_webhook_url ??
    process.env.SLACK_WEBHOOK_URL_EQUIPO ??
    process.env.SLACK_WEBHOOK_URL
  if (!url) {
    logger.info('Slack webhook unset · alert skipped', {
      stream_id: input.stream_id,
    })
    return
  }

  const streamLabel = input.stream_id.length > 40
    ? `${input.stream_id.slice(0, 37)}...`
    : input.stream_id
  const text = `[OBSERVE] ${input.journey_type} · stream=${streamLabel} · ${input.result.kind} · ${input.result.summary}`

  try {
    const fetchImpl = input.fetch_impl ?? fetch
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      logger.warn('Slack webhook non-2xx', { status: res.status })
    } else {
      logger.info('Slack [OBSERVE] alert dispatched', {
        kind: input.result.kind,
        stream_id: input.stream_id,
      })
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.warn('Slack alert threw · fail_open', { detail })
  }
}
