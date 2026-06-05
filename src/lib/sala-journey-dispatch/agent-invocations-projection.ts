/**
 * Canon canonical · agent-invocations → sala_event_log projection.
 *
 * Sprint 12 Fase 0 prep finale · Model B (conexión 2026-06-05).
 *
 * When a worker (n8n workflow) invokes an agent via `/api/agents/run-sdk`,
 * the existing §149 enforcement writes a row to `agent_invocations` with
 * `workflow_id` + `workflow_execution_id` + cost + duration + brain
 * markers. This projection consumes those rows and synthesizes
 * `step_completed` events on `sala_event_log` so the sala can observe
 * the worker's per-step progress without the worker calling sala
 * directly.
 *
 * Design ·
 *   - PURE function `projectAgentInvocation()` converts one row to one
 *     `EventAppendInput` · idempotent via `agent_invocations.id` ·
 *     replay-safe through the log's UNIQUE constraint
 *   - SUBSCRIBE function `runAgentInvocationsProjection()` wires the
 *     pure projector to Supabase Realtime · default-OFF via env flag
 *   - Tests cover the pure projector + the subscription wiring
 *
 * §148 honest · this projection ASSUMES the worker's `/api/agents/run-sdk`
 * call carries the sala `stream_id` as `workflow_id` (via the worker
 * workflow's body template using `{{ $json.body._journey_id }}` instead
 * of `{{ $workflow.id }}`). CC#4 owns the worker-side modification
 * (one of the 2 n8n nodes). Without that, this projection would NOT
 * match rows to streams correctly · the projection's
 * `is_workflow_id_a_sala_stream` filter discards rows where workflow_id
 * is the legacy n8n id (LyVoK, RwUo, RT1t...) and accepts only UUID-
 * shaped or sala-prefixed workflow_ids.
 */
import {
  buildIdempotencyKey,
  type EventAppendInput,
  type EventLogStorage,
  type EventType,
} from '@/lib/sala-event-log'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Canon canonical · the subset of `agent_invocations` columns the
 *  projection needs · the actual table has many more but we only read
 *  what we strictly need. */
export interface AgentInvocationRow {
  readonly id: string
  readonly workflow_id: string | null
  readonly workflow_execution_id: string | null
  readonly client_id: string | null
  readonly tenant_id?: string | null
  readonly agent_id?: string | null
  readonly agent_name?: string | null
  readonly status?: string | null
  readonly cost_usd?: number | null
  readonly duration_ms?: number | null
  readonly tokens_input?: number | null
  readonly tokens_output?: number | null
  readonly created_at?: string | null
  readonly response_text?: string | null
  readonly metadata?: Record<string, unknown> | null
}

/** Canon canonical · whether the projection is enabled · default-OFF
 *  per canon §144 escalón 6.e. Tests inject explicit value. */
export function isAgentInvocationsProjectionEnabled(
  input: { enabled?: boolean } = {},
): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED === 'true'
}

/**
 * Canon canonical · UUID + sala-prefix matcher · used to filter out
 * legacy n8n workflow_ids (LyVoK..., RwUo..., RT1t...) that are NOT
 * sala stream ids.
 *
 * - UUIDs (xxxxxxxx-xxxx-...) → sala stream candidate
 * - Strings starting with `sala/` or `sala::` → explicit sala stream
 * - Anything else (alphanumeric short strings · legacy n8n ids) → NOT sala
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isWorkflowIdASalaStream(workflow_id: string | null): boolean {
  if (!workflow_id) return false
  if (UUID_RE.test(workflow_id)) return true
  if (workflow_id.startsWith('sala/') || workflow_id.startsWith('sala::')) return true
  return false
}

export interface ProjectAgentInvocationOptions {
  /** Canon canonical · journey_type to tag the event · defaults to
   *  'UNKNOWN' when the projection cannot infer it. Caller can pass
   *  an explicit value derived from JOURNEY_WORKFLOW_MAP lookups. */
  readonly journey_type?: string
  /** Canon canonical · the projection's event_type · default
   *  `step_completed` (the canonical "agent did work" signal). The
   *  router treats `step_completed` as the trigger to decide next. */
  readonly event_type?: EventType
  /** Canon canonical · the projection's `operation_type` prefix ·
   *  default 'sala-projection.agent-invocation'. */
  readonly operation_type_prefix?: string
  /** Canon canonical · logical_period for the projection's idempotency
   *  key · defaults to the row's created_at date. */
  readonly logical_period?: string
}

/**
 * Canon canonical · pure projector · convert one agent_invocations row
 * to one EventAppendInput. Returns `null` when the row is NOT a sala
 * stream candidate (filter heuristic above).
 *
 * Idempotency · the projection's idempotency_key derives from
 * `agent_invocations.id` so the same row projects to the same key ·
 * the sala_event_log's UNIQUE constraint dedupes naturally on replay.
 *
 * §148 honest · we do NOT mutate or read state · we just shape the
 * data. The caller (subscription handler) appends via storage.
 */
export function projectAgentInvocation(
  row: AgentInvocationRow,
  options: ProjectAgentInvocationOptions = {},
): EventAppendInput | null {
  if (!isWorkflowIdASalaStream(row.workflow_id)) return null
  if (!row.workflow_id) return null
  if (!row.client_id) return null

  const tenant_id = row.tenant_id ?? ''
  if (!tenant_id) return null

  const journey_type = options.journey_type ?? 'UNKNOWN'
  const event_type = options.event_type ?? 'step_completed'
  const prefix = options.operation_type_prefix ?? 'sala-projection.agent-invocation'
  const operation_type = `${prefix}.${row.id}`
  const logical_period =
    options.logical_period ?? (row.created_at ? row.created_at.slice(0, 10) : 'unknown-period')

  const idempotency_key = buildIdempotencyKey({
    operation_type,
    client_id: row.client_id,
    logical_period,
  })

  const step_id = row.agent_id ?? row.agent_name ?? 'unknown-step'

  return {
    tenant_id,
    client_id: row.client_id,
    stream_id: row.workflow_id, // canon · sala stream_id rides as workflow_id
    correlation_id: row.workflow_execution_id ?? row.id,
    causation_id: row.id, // canon · trace back to the source agent_invocations row
    event_type,
    journey_type,
    operation_type,
    idempotency_key,
    logical_period,
    step_id,
    step_state: 'done',
    payload: {
      source: 'agent-invocations-projection',
      agent_invocation_id: row.id,
      agent_name: row.agent_name ?? row.agent_id ?? null,
      cost_usd: row.cost_usd ?? null,
      duration_ms: row.duration_ms ?? null,
      tokens_input: row.tokens_input ?? null,
      tokens_output: row.tokens_output ?? null,
      status: row.status ?? null,
      response_excerpt:
        typeof row.response_text === 'string' && row.response_text.length > 0
          ? row.response_text.slice(0, 240)
          : null,
    },
    agent_invocation_ref: row.id,
    gate_type: null,
  }
}

// =====================================================================
// Subscription wiring · Supabase realtime · default-OFF
// =====================================================================

export interface ProjectionLogger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
}

export interface RunAgentInvocationsProjectionInput {
  readonly supabase: SupabaseClient
  readonly storage: EventLogStorage
  readonly enabled?: boolean
  readonly journey_type_resolver?: (row: AgentInvocationRow) => string | undefined
  readonly logger?: ProjectionLogger
  /** Optional · override `agent_invocations` table name (tests). */
  readonly table?: string
}

export interface RunAgentInvocationsProjectionHandle {
  /** Canon canonical · stop the subscription · idempotent. */
  readonly stop: () => Promise<void>
  /** Canon canonical · the subscription channel name (audit + tests). */
  readonly channel_name: string
}

const defaultLogger: ProjectionLogger = {
  // eslint-disable-next-line no-console
  info: (msg, ctx) => console.log(`[sala/projection] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  warn: (msg, ctx) => console.warn(`[sala/projection] ${msg}`, ctx ?? {}),
  // eslint-disable-next-line no-console
  error: (msg, ctx) => console.error(`[sala/projection] ${msg}`, ctx ?? {}),
}

/**
 * Canon canonical · start the realtime projection subscription. Returns
 * a handle the caller can use to stop. When the flag is OFF, returns
 * a no-op handle and logs the disabled state.
 *
 * §148 honest · the subscription itself is REALTIME network IO · the
 * test suite verifies the wiring SHAPE (channel name + filter + handler
 * registration) without spinning up a real Realtime connection.
 */
export async function runAgentInvocationsProjection(
  input: RunAgentInvocationsProjectionInput,
): Promise<RunAgentInvocationsProjectionHandle> {
  const logger = input.logger ?? defaultLogger
  const enabled = isAgentInvocationsProjectionEnabled({ enabled: input.enabled })

  if (!enabled) {
    logger.info('projection disabled · skipping subscription')
    return {
      stop: async () => {},
      channel_name: 'sala/projection · disabled',
    }
  }

  const table = input.table ?? 'agent_invocations'
  const channel_name = `sala/projection/${table}`

  // Supabase Realtime channel wiring · the actual subscription target.
  // We narrow to INSERT events on the table.
  const channel = (input.supabase as unknown as {
    channel?: (name: string) => unknown
  }).channel?.(channel_name) as
    | {
        on: (
          event: string,
          filter: unknown,
          handler: (payload: { new: AgentInvocationRow }) => Promise<void>,
        ) => { subscribe: () => void }
      }
    | undefined
  if (!channel) {
    logger.error('supabase.channel() unavailable · projection NOT started')
    return {
      stop: async () => {},
      channel_name: 'sala/projection · no-channel',
    }
  }

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table },
      async (payload: { new: AgentInvocationRow }) => {
        const row = payload.new
        try {
          const journey_type = input.journey_type_resolver?.(row)
          const eventInput = projectAgentInvocation(row, { journey_type })
          if (!eventInput) {
            logger.info('row skipped · not a sala stream', {
              row_id: row.id,
              workflow_id: row.workflow_id,
            })
            return
          }
          await input.storage.insert(eventInput)
          logger.info('row projected · step_completed appended', {
            row_id: row.id,
            stream_id: eventInput.stream_id,
            step_id: eventInput.step_id,
          })
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e)
          logger.error('projection failed for row', { row_id: row.id, detail })
        }
      },
    )
    .subscribe()

  logger.info('projection started · subscribed to INSERTs', { channel_name, table })

  return {
    stop: async () => {
      try {
        await (input.supabase as unknown as {
          removeChannel?: (channel: unknown) => Promise<unknown> | unknown
        }).removeChannel?.(channel)
        logger.info('projection stopped', { channel_name })
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e)
        logger.warn('projection stop threw', { channel_name, detail })
      }
    },
    channel_name,
  }
}
