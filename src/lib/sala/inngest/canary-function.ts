/**
 * Synthetic canary · Inngest function · Track S finale prep.
 *
 * Triggered by `synthetic/canary.run` events. Runs ONE full E2E loop
 * through the wired `RealSalaIntegration` (cap + storage + router +
 * interpreter) and returns a trace. The whole loop is SYNTHETIC ·
 * tenant `synthetic`, client `c-canary`, journey `ONBOARD` (default),
 * in-memory storage · NOT persisted, NO real dispatch.
 *
 * §148 honest · the function proves the wire SHAPE works end-to-end
 * (Inngest event → handler → buildSalaIntegration → runUntilHalt →
 * trace). It does NOT execute real agents · the router's
 * `dispatch_requested` decisions live in the in-memory event log
 * only · they go NOWHERE downstream from the canary.
 *
 * Default OFF · the function is registered with the serve handler
 * ONLY when `SALA_CANARY_ENABLED=true`. The env flag gates Inngest
 * cloud auto-sync · keeps the canary out of production traffic
 * until explicitly enabled.
 */
import type { JourneyType } from '../libretos/types'
import { buildSalaIntegration } from '../integration-wire'
import { inngestClient } from './client'

export const SYNTHETIC_CANARY_EVENT = 'synthetic/canary.run'

interface CanaryEventData {
  /** Optional tenant override · default 'synthetic'. */
  tenant_id?: string
  /** Optional client override · default 'c-canary'. */
  client_id?: string
  /** Optional journey override · default 'ONBOARD'. */
  journey_type?: JourneyType
  /** Optional logical period override · default current ISO week. */
  logical_period?: string
  /** Optional max ticks · default 50 (RealSalaIntegration default). */
  max_ticks?: number
  /** Optional correlation id · default randomUUID at runtime. */
  correlation_id?: string
}

interface CanaryTrace {
  readonly halted_by: string
  readonly ticks: number
  readonly total_events: number
  readonly events: ReadonlyArray<{
    sequence: number
    event_type: string
    journey_type?: string
    step_id?: string
  }>
  readonly last_decisions_count: number
  readonly elapsed_ms: number
}

function currentIsoWeek(): string {
  const d = new Date()
  // Crude ISO week derivation · matches Sala canon for synthetic runs.
  const year = d.getUTCFullYear()
  const firstJan = new Date(Date.UTC(year, 0, 1))
  const day = Math.floor((d.getTime() - firstJan.getTime()) / 86_400_000)
  const week = Math.ceil((day + firstJan.getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** The canary handler · pure function · the Inngest SDK wraps it
 *  via `createFunction`. Exposed so unit tests can call it directly
 *  without spinning up the Inngest runtime. */
export async function runSyntheticCanary(
  eventData: CanaryEventData = {},
): Promise<CanaryTrace> {
  const start = Date.now()
  const tenant_id = eventData.tenant_id ?? 'synthetic'
  const client_id = eventData.client_id ?? 'c-canary'
  const journey_type = (eventData.journey_type ?? 'ONBOARD') as JourneyType
  const logical_period = eventData.logical_period ?? currentIsoWeek()
  const stream_id = `synthetic/${tenant_id}/${client_id}/${journey_type}/${logical_period}`
  const max_ticks = eventData.max_ticks ?? 50

  // Build the wired integration. SALA_G6_HOOK_ENABLED env decides
  // whether the G6 adapter actually fetches from Supabase · the
  // canary tolerates either mode (in shadow the cap never blocks,
  // in live the synthetic bucket per-bucket shadow_mode_db=true
  // also fail-opens · §148 cap is safety net).
  const { integration, storage } = buildSalaIntegration({
    // No supabase by default · the canary stays self-contained.
    // Future · pass `getSupabaseAdmin()` when the integration is
    // ready to write to the real event-log table.
  })

  const result = await integration.runUntilHalt({
    tenant_id,
    client_id,
    stream_id,
    journey_type,
    logical_period,
    correlation_id: eventData.correlation_id,
    max_ticks,
  })

  // Derive the trace from in-memory storage.
  const events = await storage.select({
    tenant_id,
    stream_id,
  })

  const elapsed_ms = Date.now() - start

  return {
    halted_by: result.halted_by,
    ticks: result.ticks,
    total_events: result.total_events,
    events: events.map((e: { sequence: number; event_type: string; payload?: unknown }) => {
      const payload = (e.payload as Record<string, unknown> | undefined) ?? {}
      return {
        sequence: e.sequence,
        event_type: e.event_type,
        journey_type: payload['journey_type'] as string | undefined,
        step_id: payload['step_id'] as string | undefined,
      }
    }),
    last_decisions_count: result.last_decisions.length,
    elapsed_ms,
  }
}

/** The Inngest function definition. Triggers on
 *  `synthetic/canary.run`. Idempotent per `event.data.correlation_id`
 *  (24h TTL) so duplicate canary triggers collapse to one run · same
 *  pattern as the durability test. */
export const syntheticCanaryFn = inngestClient.createFunction(
  {
    id: 'synthetic-canary-run',
    name: 'Synthetic E2E Canary · Track S finale prep',
    idempotency: 'event.data.correlation_id',
    retries: 0,
    triggers: [{ event: SYNTHETIC_CANARY_EVENT }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as CanaryEventData
    return await step.run('canary-loop', async () => runSyntheticCanary(data))
  },
)

/** Whether the canary should register with serve(). Default OFF ·
 *  prevents auto-sync from picking it up until the env flag flips. */
export function isSyntheticCanaryEnabled(): boolean {
  return process.env.SALA_CANARY_ENABLED === 'true'
}
