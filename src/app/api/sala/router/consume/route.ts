/**
 * POST /api/sala/router/consume · admin endpoint · runs one consumer tick.
 *
 * Cierra el chain de la sala · canon ADR-018 (un dispatcher único) ·
 *   ingress endpoint (PR #176) → sala_event_log
 *     → THIS consumer → workflow-dispatcher Model B (PR #172) → worker
 *
 * §148 honest · default-OFF via `SALA_ROUTER_CONSUMER_ENABLED`. Auth ·
 * `checkInternalKey` (matches the legacy admin pattern). One tick per
 * call · cero cron · cero polling loops · cadence is the caller's
 * decision (admin smoke · future Inngest cron).
 *
 * Body (optional) ·
 *   {
 *     tenant_id?: string,
 *     batch_size?: number (default 10 · cap 100),
 *     scan_window?: number (default 200 · cap 1000)
 *   }
 *
 * Response · 200 always (except 503 flag off · 401 unauth · 400 body) ·
 *   {
 *     ok: true,
 *     tick: ConsumerTickResult { tick_id, scanned, processed, outcomes: [...] }
 *   }
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { SupabaseEventLogStorage } from '@/lib/sala-event-log'
import {
  candadoEnSupabase,
  consumeIntakeTick,
  isConsumerEnabled,
  isPaqueteEnabled,
  wireCapSpendQuerySupabase,
  type CandadoDelTic,
} from '@/lib/sala-router-consumer'
import { TICK_DEADLINE_MS_DEFAULT, TICK_LOCK_TTL_MS } from '@/lib/sala-router-consumer/types'

function fail(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ ok: false, code, detail }, { status })
}

export async function POST(request: Request) {
  // ─── 1 · feature flag (default-OFF) ───
  if (!isConsumerEnabled()) {
    return fail(503, 'flag_disabled', 'SALA_ROUTER_CONSUMER_ENABLED!=true · default-OFF')
  }

  // ─── 2 · auth (internal key) ───
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return fail(401, 'unauthorized', auth.reason)
  }

  // ─── 3 · parse + validate body (all fields optional) ───
  let raw: Record<string, unknown> = {}
  try {
    const text = await request.text()
    raw = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return fail(400, 'invalid_body', 'body must be valid JSON or empty')
  }

  const tenant_id =
    typeof raw.tenant_id === 'string' && raw.tenant_id.length > 0
      ? raw.tenant_id
      : undefined
  const batch_size =
    typeof raw.batch_size === 'number' && Number.isFinite(raw.batch_size)
      ? raw.batch_size
      : undefined
  const scan_window =
    typeof raw.scan_window === 'number' && Number.isFinite(raw.scan_window)
      ? raw.scan_window
      : undefined

  // ─── 4 · compose storage + cap-wire (SPEC lazo agentico §gap §150) ───
  let storage: SupabaseEventLogStorage
  let cap_spend_query
  let candado: CandadoDelTic | null = null
  try {
    const supabase = getSupabaseAdmin()
    if (isPaqueteEnabled()) candado = candadoEnSupabase(supabase as never)
    storage = new SupabaseEventLogStorage(supabase)
    // Canon canonical · production wires the Supabase-backed spend query ·
    // dispatch evaluates per-stream cumulative cost vs §150 cap before
    // dispatching to the worker.
    //
    // §150 fix (CC#3 2026-06-28) · Strategy B (`tenant_window`) · sums
    // cost_usd by client_id + wall-clock window (started_at). Strategy A
    // (`correlation`) summed by journey_id, but agent_invocations.journey_id
    // is NEVER populated (the §149 correlation lands in workflow_id) → A
    // always returned $0 → the cap was blind to real spend (~$2.29 Náufrago
    // invisible). B does not depend on journey_id · it reflects real cost.
    cap_spend_query = wireCapSpendQuerySupabase(supabase, { strategy: 'tenant_window' })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail(503, 'supabase_unavailable', detail)
  }

  // ─── 5 · run one tick ───
  // PAQUETE del repartidor (palanca SALA_ROUTER_PAQUETE_ENABLED · NACE APAGADA · apagada = el camino de siempre, byte a byte)
  if (candado) return await correrTicConPaquete({ candado, storage, tenant_id, batch_size, scan_window, cap_spend_query })
  try {
    const tick = await consumeIntakeTick({
      storage,
      tenant_id,
      batch_size,
      scan_window,
      cap_spend_query,
    })
    return NextResponse.json({ ok: true, tick }, { status: 200 })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return fail(500, 'tick_failed', detail)
  }
}

/**
 * ① candado (un solo tic a la vez) + ② tope de tiempo (el tic que no termina, muere dentro de su ciclo) · el tope cubre TODO, también la espera de la base al tomar el candado
 * (con la base caída esa espera era la que apilaba tics). ③ y ⑤ viven en el orquestador (`claim_before_fire`).
 */
async function correrTicConPaquete(a: {
  candado: CandadoDelTic
  storage: SupabaseEventLogStorage
  tenant_id: string | undefined
  batch_size: number | undefined
  scan_window: number | undefined
  cap_spend_query: Parameters<typeof consumeIntakeTick>[0]['cap_spend_query']
}): Promise<NextResponse> {
  const deadlineMs = Number(process.env.SALA_ROUTER_TICK_DEADLINE_MS) > 0 ? Number(process.env.SALA_ROUTER_TICK_DEADLINE_MS) : TICK_DEADLINE_MS_DEFAULT
  const inicio = Date.now()
  const deadline_at_ms = inicio + deadlineMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const vencio = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deadlineMs)
  })
  const trabajo = (async () => {
    const toma = await a.candado.tomar(TICK_LOCK_TTL_MS)
    if (!toma.ok) return { kind: 'sin_candado' as const, motivo: toma.motivo }
    try {
      const tick = await consumeIntakeTick({
        storage: a.storage,
        tenant_id: a.tenant_id,
        batch_size: a.batch_size,
        scan_window: a.scan_window,
        cap_spend_query: a.cap_spend_query,
        claim_before_fire: true,
        deadline_at_ms,
      })
      return { kind: 'tick' as const, tick }
    } finally {
      // el candado se suelta cuando el TRABAJO termina (no cuando la respuesta sale): si el tope corta la respuesta pero el tic sigue vivo, el candado sigue tomado hasta su vencimiento (TTL)
      await a.candado.soltar(toma.holder)
    }
  })()
  // si el tope gana la carrera, `trabajo` puede seguir vivo un rato: su error tardío no puede tirar la función
  trabajo.catch(() => undefined)
  try {
    const r = await Promise.race([trabajo, vencio])
    if (r === 'timeout') return fail(504, 'tick_timeout', `el tic superó su tope de tiempo (${deadlineMs} ms) y se cortó · lo que no se tomó queda para el próximo tic`)
    if (r.kind === 'sin_candado') {
      // no es un error: otro tic está corriendo (o la base no dio el candado) · salir rápido es justo lo que evita la pila
      return NextResponse.json({ ok: true, skipped: r.motivo, tick: null }, { status: 200 })
    }
    return NextResponse.json({ ok: true, tick: r.tick, took_ms: Date.now() - inicio }, { status: 200 })
  } catch (e) {
    return fail(500, 'tick_failed', e instanceof Error ? e.message : String(e))
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sala/router/consume',
    method: 'POST',
    description:
      'Consumer tick · reads pending intake events from sala_event_log · routes via JOURNEY_WORKFLOW_MAP · invokes workflow-dispatcher Model B · writes marker event · ADR-018 single dispatcher',
    canon:
      'ESCALADA-Opus-arquitectura-entradas-sala-multidepto-2026-06-05.md §BUILD SPEC · "router despacha (NUNCA entrada→dispatch)"',
    chain: 'ingress (#176) → sala_event_log → THIS consumer → workflow-dispatcher Model B (#172) → worker n8n',
    feature_flag: 'SALA_ROUTER_CONSUMER_ENABLED · default-OFF',
    auth: 'x-api-key matched against INTERNAL_API_KEY',
    body_shape: {
      tenant_id: 'string · optional · scope the SELECT',
      batch_size: 'number · optional · default 10 · cap 100',
      scan_window: 'number · optional · default 200 · cap 1000',
    },
    response_kinds: {
      ok: '{ok:true, tick:{tick_id, scanned, processed, outcomes:[{kind, detail, ...}]}}',
      refused: '{ok:false, code, detail} · 503 flag · 401 auth · 400 body · 500 tick',
    },
    outcome_kinds: [
      'dispatched_ok',
      'dispatched_failed',
      'skipped_parse_error',
      'skipped_unknown_journey',
      'skipped_dispatcher_off',
      'skipped_cap_blocked',
      'marker_write_failed',
    ],
  })
}
