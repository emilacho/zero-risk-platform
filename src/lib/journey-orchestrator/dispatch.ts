/**
 * Journey Orchestrator · L1 · main dispatcher
 *
 * Sprint 1 · 2026-05-20 · CC#1
 *
 * The single entry point that ties validate → state-machine → routes-map
 * → Supabase persist → L2 invocation together.
 *
 * Per dispatch line 70-79 architectural decision (Opción B · Vercel-
 * resident library) chosen over n8n workflow option for testability,
 * deploy speed, and integration parity with OnboardingOrchestrator.
 *
 * Flow ·
 *   1. validateDispatchRequest()         → reject on shape errors (400)
 *   2. resolveNextStage()                → compute target stage
 *   3. upsertJourneyState()              → persist to client_journey_state
 *   4. routeForJourney() + invokeL2()    → fire L2 (http/n8n/stub)
 *   5. return DispatchResult             → caller surfaces journey_id
 *
 * NO long-running work happens here · L2 calls are timeout-bounded ·
 * fire-and-forget for n8n webhooks · awaited with 30s ceiling for HTTP
 * platform routes (`/api/onboarding` etc).
 */
import { getSupabaseAdmin } from '../supabase'
import { capture } from '../posthog'
import { resolveNextStage } from './state-machine'
import { routeForJourney, type DispatchMode } from './routes-map'
import {
  type DispatchRequest,
  type DispatchResult,
  type JourneyType,
  type JourneyStateRow,
  type TriggerType,
} from './types'

/**
 * DB-level enum `trigger_type` only accepts {webhook · manual · cron}.
 * Our richer L1 trigger taxonomy gets MAPPED here · original is preserved
 * in `metadata.trigger_type_original` so we never lose the operational
 * context. Follow-up migration would extend the enum to drop the mapping
 * (sprint posterior · NOT blocking this build).
 */
const DB_TRIGGER_MAP: Record<TriggerType, 'webhook' | 'manual' | 'cron'> = {
  manual: 'manual',
  webhook: 'webhook',
  cron: 'cron',
  cascade_done: 'webhook', // L2 callback comes as a webhook
  anomaly_detected: 'cron', // cron supervisors detect anomalies
  hitl_resolved: 'webhook', // Mission Control posts webhook on approval
  resume_stuck: 'manual', // operator-initiated unstick
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

interface DispatchOptions {
  /** Override Supabase client for tests. */
  supabase?: SupabaseAdmin
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch
}

/**
 * Main entry · invoked by `POST /api/journey/dispatch` route OR by
 * server-side callers (e.g. OnboardingOrchestrator post-Phase-1 hook).
 */
export async function dispatchJourney(
  req: DispatchRequest,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const supabase = opts.supabase ?? getSupabaseAdmin()
  const fetchFn = opts.fetchImpl ?? fetch
  const { journey, trigger_type, params = {}, client_id, parent_journey_id, trigger_source } = req

  // 1. Compute target stage based on existing state
  let existingRow: JourneyStateRow | null = null
  if (client_id) {
    const { data } = await supabase
      .from('client_journey_state')
      .select('*')
      .eq('client_id', client_id)
      .eq('journey', journey)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<JourneyStateRow>()
    existingRow = data ?? null
  }
  const nextStage = req.stage ?? resolveNextStage(journey, existingRow?.current_stage ?? null, trigger_type)

  // 2. Persist / upsert client_journey_state row
  const persisted = await upsertJourneyState(supabase, {
    existingRow,
    client_id: client_id ?? null,
    journey,
    next_stage: nextStage,
    trigger_type,
    trigger_source: trigger_source ?? null,
    trigger_payload: { params, original_request: { stage: req.stage } },
    parent_journey_id: parent_journey_id ?? null,
  })

  // 3. Resolve L2 route + invoke
  const route = routeForJourney(journey)
  let dispatchStatus: DispatchResult['dispatch_status'] = 'stubbed'
  let l2Target: string | null = null
  let l2Error: string | undefined
  let details: Record<string, unknown> = { mode: route.mode }

  if (route.mode === 'stub') {
    dispatchStatus = 'stubbed'
    l2Target = `stub:${journey}`
    details = { ...details, reason: route.doc ?? 'L2 stub · sprint posterior' }
  } else {
    const invoked = await invokeL2({
      mode: route.mode,
      url: route.url!,
      authHeader: route.authHeader ?? 'none',
      timeoutMs: route.timeoutMs ?? 30_000,
      payload: {
        journey_id: persisted.id,
        client_id,
        journey,
        stage: nextStage,
        trigger_type,
        params,
      },
      fetchFn,
    })
    if (invoked.ok) {
      dispatchStatus = 'dispatched'
      l2Target = route.url ?? null
      details = { ...details, status: invoked.status, response_preview: invoked.bodyPreview }
    } else {
      dispatchStatus = 'failed'
      l2Target = route.url ?? null
      l2Error = invoked.error
      details = { ...details, status: invoked.status, error: invoked.error }
      // Bump error count on the journey row · NOT terminal (L1 doesn't fail journeys, L2 does)
      await supabase
        .from('client_journey_state')
        .update({
          error_count: (existingRow?.error_count ?? 0) + 1,
          last_error: invoked.error.slice(0, 500),
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', persisted.id)
    }
  }

  // Sprint 4 D5 · canonical reporting event. Fires on every L1 dispatch
  // regardless of L2 outcome · the `dispatch_status` property surfaces
  // whether the L2 actually ran. `client_id` may be null for triggers
  // not tied to a row · fall back to journey_id so PostHog still groups
  // sensibly.
  capture('journey_transition', client_id ?? persisted.id, {
    journey_id: persisted.id,
    journey,
    next_stage: nextStage,
    previous_stage: existingRow?.current_stage ?? null,
    trigger_type,
    trigger_source: trigger_source ?? null,
    dispatch_status: dispatchStatus,
    l2_mode: route.mode,
  })

  return {
    ok: dispatchStatus !== 'failed',
    journey_id: persisted.id,
    journey,
    dispatch_status: dispatchStatus,
    l2_target: l2Target,
    next_check_at: computeNextCheck(route.mode, journey),
    error: l2Error,
    details,
  }
}

// ── Internals ───────────────────────────────────────────────────────────

interface UpsertArgs {
  existingRow: JourneyStateRow | null
  client_id: string | null
  journey: JourneyType
  next_stage: string | null
  trigger_type: TriggerType
  trigger_source: string | null
  trigger_payload: Record<string, unknown>
  parent_journey_id: string | null
}

async function upsertJourneyState(
  supabase: SupabaseAdmin,
  args: UpsertArgs,
): Promise<{ id: string }> {
  const now = new Date().toISOString()
  const dbTrigger = DB_TRIGGER_MAP[args.trigger_type] ?? 'manual'
  const triggerMetaPatch = {
    trigger_type_original: args.trigger_type,
    last_dispatched_at: now,
  }
  if (args.existingRow) {
    const { data, error } = await supabase
      .from('client_journey_state')
      .update({
        current_stage: args.next_stage,
        trigger_type: dbTrigger,
        trigger_source: args.trigger_source,
        trigger_payload: args.trigger_payload,
        metadata: triggerMetaPatch,
        updated_at: now,
      })
      .eq('id', args.existingRow.id)
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`client_journey_state update failed · ${error.message}`)
    return data
  }
  const { data, error } = await supabase
    .from('client_journey_state')
    .insert({
      client_id: args.client_id,
      journey: args.journey,
      current_stage: args.next_stage,
      status: 'active',
      trigger_type: dbTrigger,
      trigger_source: args.trigger_source,
      trigger_payload: args.trigger_payload,
      metadata: triggerMetaPatch,
      parent_journey_id: args.parent_journey_id,
      started_at: now,
      updated_at: now,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`client_journey_state insert failed · ${error.message}`)
  return data
}

interface InvokeArgs {
  mode: DispatchMode
  url: string
  authHeader: 'x-api-key' | 'none'
  timeoutMs: number
  payload: Record<string, unknown>
  fetchFn: typeof fetch
}

interface InvokeResult {
  ok: boolean
  status: number
  bodyPreview?: string
  error: string
}

async function invokeL2(args: InvokeArgs): Promise<InvokeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (args.authHeader === 'x-api-key') {
      headers['x-api-key'] = process.env.INTERNAL_API_KEY || ''
    }
    const res = await args.fetchFn(args.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(args.payload),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    return {
      ok: res.ok,
      status: res.status,
      bodyPreview: text.slice(0, 300),
      error: res.ok ? '' : `HTTP ${res.status} · ${text.slice(0, 200)}`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    return { ok: false, status: 0, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

function computeNextCheck(mode: DispatchMode, journey: JourneyType): string | null {
  if (mode === 'stub') return null
  // n8n long-running · check in 5 minutes · HTTP synchronous needs no poll
  if (mode === 'n8n_webhook') {
    return new Date(Date.now() + 5 * 60 * 1000).toISOString()
  }
  // ALWAYS_ON is cron-driven · check daily
  if (journey === 'ALWAYS_ON') {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
  return null
}
