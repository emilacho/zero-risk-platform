/**
 * Inngest onFailure → dead_letter event-log writer · DLQ Option A.
 *
 * Sprint 12 Fase 0 co-req #3 pre-flip escalón 5 · 2026-06-04.
 * Spec · DLQ-confirmacion-pre-flip-2026-06-04.md §5 Option A
 *
 * Single source of truth for "what happens when an Inngest function
 * exhausts its retry budget". Every Inngest function in this codebase
 * imports `buildDeadLetterFailureHandler()` and wires it as
 * `onFailure` so terminal failures land observable + persistent ·
 * NEVER silent.
 *
 * Behavior · two best-effort side-effects, isolated so one failing
 * does not cascade ·
 *   1. INSERT a `dead_letter` event row into `sala_event_log`. The
 *      row is the canonical record · queryable from Supabase Studio
 *      or PostgREST. Payload carries function_id + original event
 *      reference + final_error + attempts_made + inngest_run_id +
 *      dead_lettered_at (ISO).
 *   2. POST a [DLQ] alert to `#equipo` via SLACK_WEBHOOK_URL_EQUIPO
 *      (env var · same as cost-monitor-alert.ts). Best-effort · a
 *      webhook 5xx does NOT throw out of the handler.
 *
 * §148 honest · the handler NEVER throws. Inngest treats an onFailure
 * exception as "the dead-letter writer itself failed" · we want the
 * primary failure trace preserved. So both side-effects log + swallow
 * their own errors.
 *
 * The migration that adds `dead_letter` to `sala_event_type_enum`
 * lives in `supabase/migrations/202606050001_sala_event_log_add_dead_letter_value.sql`
 * · single-file · NOT applied in this PR (CC#1 apply post-merge).
 * Until the migration applies, the INSERT will fail with `invalid
 * input value for enum sala_event_type_enum: "dead_letter"` · the
 * handler logs + swallows · Slack still fires · zero crash.
 */
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import type { EventLogStorage } from '@/lib/sala-event-log'

export interface DeadLetterContext {
  /** The Inngest function id (e.g. 'synthetic-durability-test'). */
  readonly function_id: string
  /** The event payload that triggered the function. */
  readonly trigger_event: {
    readonly id?: string
    readonly name?: string
    readonly data?: Record<string, unknown> | null
    readonly ts?: number
  }
  /** The terminal error that exhausted the retry budget. */
  readonly error: unknown
  /** The Inngest run id (if available · from event ctx). */
  readonly inngest_run_id?: string
  /** Total attempts made (initial + retries). */
  readonly attempts_made?: number
}

export interface DeadLetterHandlerDeps {
  /** Storage adapter to write the dead_letter event into. Defaults to
   *  a lazy-imported Supabase admin client when omitted (production
   *  path · the storage is constructed inside Inngest function so
   *  cold-starts don't pay the import unless a failure fires). */
  readonly storage?: EventLogStorage
  /** Slack webhook URL · defaults to `process.env.SLACK_WEBHOOK_URL_EQUIPO`
   *  to match `cost-monitor-alert.ts` convention. */
  readonly slackWebhookUrl?: string
  /** Test-only · injectable now() for deterministic timestamps. */
  readonly now?: () => number
  /** Test-only · injectable fetch (default · global fetch). */
  readonly fetchImpl?: typeof fetch
  /** Test-only · injectable logger. Default · console. */
  readonly logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void
    info(msg: string, ctx?: Record<string, unknown>): void
  }
}

const defaultLogger = {
  warn(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[sala/dlq] ${msg}`, ctx ?? {})
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.log(`[sala/dlq] ${msg}`, ctx ?? {})
  },
}

/** Construct the onFailure handler bound to a function id. The
 *  returned function is the value passed to Inngest's
 *  `createFunction({ ..., onFailure })`. */
export function buildDeadLetterFailureHandler(
  function_id: string,
  deps: DeadLetterHandlerDeps = {},
) {
  return async (input: {
    readonly event: DeadLetterContext['trigger_event']
    readonly error: unknown
    readonly attempt?: number
    readonly run_id?: string
  }): Promise<void> => {
    const ctx: DeadLetterContext = {
      function_id,
      trigger_event: input.event,
      error: input.error,
      inngest_run_id: input.run_id,
      attempts_made: input.attempt,
    }
    await writeDeadLetter(ctx, deps)
  }
}

/** Direct entry point · testable · the onFailure binder is just a
 *  thin wrapper. */
export async function writeDeadLetter(
  ctx: DeadLetterContext,
  deps: DeadLetterHandlerDeps = {},
): Promise<void> {
  const logger = deps.logger ?? defaultLogger
  const now = deps.now ?? Date.now
  const dead_lettered_at = new Date(now()).toISOString()
  const final_error =
    ctx.error instanceof Error
      ? ctx.error.message
      : typeof ctx.error === 'string'
        ? ctx.error
        : (() => {
            try {
              return JSON.stringify(ctx.error)
            } catch {
              return String(ctx.error)
            }
          })()

  // ─── Side-effect #1 · INSERT dead_letter event ──────────────────
  // Best-effort · swallow errors · never throws.
  try {
    const storage = deps.storage ?? (await lazyImportProductionStorage())
    if (storage) {
      const triggerData = (ctx.trigger_event.data ?? {}) as Record<
        string,
        unknown
      >
      const tenant_id = (triggerData.tenant_id as string) ?? 'unknown'
      const client_id = (triggerData.client_id as string) ?? 'unknown'
      const stream_id =
        (triggerData.stream_id as string) ??
        `dlq/${ctx.function_id}/${ctx.inngest_run_id ?? 'no-run'}`
      const correlation_id =
        (triggerData.correlation_id as string) ??
        `dlq-${ctx.function_id}-${now()}`
      const operation_type = ctx.function_id
      const journey_type = (triggerData.journey_type as string) ?? 'SYNTHETIC'
      const logical_period =
        (triggerData.logical_period as string) ?? 'dlq:no-period'

      // Build idempotency key · function_id + run_id + ts ensures
      // each dead_letter write is unique (NO dedup collapse · we WANT
      // every terminal failure tracked).
      const idempotency_key = buildIdempotencyKey({
        operation_type,
        client_id,
        logical_period,
        input_hash:
          ctx.inngest_run_id ??
          (ctx.trigger_event.id as string | undefined) ??
          `${ctx.function_id}-${now()}`,
      })

      await storage.insert({
        tenant_id,
        client_id,
        stream_id,
        correlation_id,
        event_type: 'dead_letter',
        journey_type,
        operation_type,
        idempotency_key,
        logical_period,
        workflow_run_id: ctx.inngest_run_id ?? null,
        payload: {
          function_id: ctx.function_id,
          original_event_id: ctx.trigger_event.id ?? null,
          original_event_name: ctx.trigger_event.name ?? null,
          final_error,
          attempts_made: ctx.attempts_made ?? null,
          inngest_run_id: ctx.inngest_run_id ?? null,
          dead_lettered_at,
          trigger_payload: triggerData,
        },
      })
      logger.info('dead_letter event written', {
        function_id: ctx.function_id,
        tenant_id,
        client_id,
        inngest_run_id: ctx.inngest_run_id,
      })
    } else {
      logger.warn('dead_letter storage unavailable · INSERT skipped', {
        function_id: ctx.function_id,
      })
    }
  } catch (err) {
    // Swallow · §148 cap is safety net · NEVER block Inngest.
    logger.warn('dead_letter INSERT failed · fail_open', {
      function_id: ctx.function_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ─── Side-effect #2 · Slack alert · best-effort ─────────────────
  try {
    const webhookUrl =
      deps.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL_EQUIPO
    if (!webhookUrl) {
      logger.info('SLACK_WEBHOOK_URL_EQUIPO unset · alert skipped', {
        function_id: ctx.function_id,
      })
      return
    }
    const triggerData = (ctx.trigger_event.data ?? {}) as Record<
      string,
      unknown
    >
    const clientLabel =
      (triggerData.client_id as string) ?? (triggerData.tenant_id as string) ?? '?'
    const text = `[DLQ] ${clientLabel} · ${ctx.function_id} · ${final_error.slice(0, 200)}`
    const fetchImpl = deps.fetchImpl ?? fetch
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      logger.warn('Slack webhook non-2xx · alert may not have been received', {
        function_id: ctx.function_id,
        status: res.status,
      })
    } else {
      logger.info('Slack [DLQ] alert dispatched', {
        function_id: ctx.function_id,
      })
    }
  } catch (err) {
    // Swallow · never propagate Slack failures out of the handler.
    logger.warn('Slack alert dispatch failed · fail_open', {
      function_id: ctx.function_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Lazy-import the production Supabase storage adapter. Kept out of
 *  the module top-level so cold starts that never hit a failure do
 *  not pay the Supabase client construction. */
async function lazyImportProductionStorage(): Promise<EventLogStorage | null> {
  try {
    const [{ getSupabaseAdmin }, { SupabaseEventLogStorage }] =
      await Promise.all([
        import('@/lib/supabase'),
        import('@/lib/sala-event-log'),
      ])
    const supabase = getSupabaseAdmin()
    return new SupabaseEventLogStorage(supabase)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sala/dlq] lazyImportProductionStorage failed', err)
    return null
  }
}
