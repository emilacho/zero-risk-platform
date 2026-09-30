/**
 * Canon canonical · consumer tick orchestrator · sala-router-consumer.
 *
 * One tick =
 *   1. SELECT recent events from sala_event_log (tenant-scoped)
 *   2. Filter to pending intake events (no marker yet) · cap by batch_size
 *   3. For each · parse → dispatch → write marker
 *   4. Return per-event outcomes + tick summary
 *
 * §148 honest · cero infinite loop · cero implicit cron · the
 * orchestrator runs ONE tick when called. Callers (endpoint · future
 * Inngest cron · admin smoke) decide cadence. Default-OFF via
 * `isConsumerEnabled()`.
 */
import { randomUUID } from 'node:crypto'
import {
  append,
  type EventLogStorage,
  type ReadFilters,
} from '@/lib/sala-event-log'
import { dispatchOneIntake, type CapAlerter, type CapSpendQuery } from './dispatch'
import { avisarSobrePerdido, type AlertaDeSobrePerdido } from './aviso-de-sobre-perdido'
import { buildDispatchMarkerEvent, type MarkerClass } from './marker'
import { parseIntakeEvent } from './parsing'
import { countAttemptsByStream, findLostClaims, selectPendingIntakeEvents } from './query'
import {
  DISPATCHED_KIND,
  MAX_DISPATCH_ATTEMPTS,
} from './types'
import type {
  ConsumerTickInput,
  ConsumerTickResult,
  DispatchOutcome,
  LostClaim,
} from './types'

export interface OrchestratorInput extends ConsumerTickInput {
  readonly storage: EventLogStorage
  /** Canon canonical · max events SELECTed from the log per tick scan
   *  window · default 200 · the FILTER then keeps only un-processed
   *  intake events bounded by batch_size. */
  readonly scan_window?: number
  /**
   * Canon canonical · cap-wire (SPEC lazo agentico 2026-06-05) ·
   * forwarded to `dispatchOneIntake` so the §150 cap call-site can query
   * cumulative spend before dispatch. Production injects
   * `wireCapSpendQuerySupabase(supabase)` · tests inject in-memory stubs.
   * When omitted, the cap evaluates with `spent_usd=0` (under_cap pass).
   */
  readonly cap_spend_query?: CapSpendQuery
  /** Canon canonical · forwarded to dispatch · tests force cap enforce
   *  without flipping the env. Production reads
   *  `SALA_NAUFRAGO_RUN_CAP_ENFORCE` via `isNaufragoCapEnforced()`. */
  readonly cap_enforce_override?: boolean
  /** Canon canonical · forwarded to dispatch · §150 #5 cap-breach alerter.
   *  Production omits (defaults to Slack via dispatchCostMonitorAlert) ·
   *  tests inject a spy. Fired ONLY on a cap BLOCK · best-effort. */
  readonly cap_alerter?: CapAlerter
  /**
   * PAQUETE del repartidor · palanca APAGADA por defecto (la ruta la enciende con SALA_ROUTER_PAQUETE_ENABLED).
   * true ⇒ (③) el sobre se RECLAMA antes de disparar: fallo o muerte del tic = sobre perdido y VISIBLE, nunca duplicado · (⑤) se avisa de reclamos sin desenlace.
   * false/ausente ⇒ el comportamiento de siempre, byte a byte.
   */
  readonly claim_before_fire?: boolean
  /** PAQUETE (②) · instante (ms) después del cual el tic NO toma más sobres · ausente ⇒ sin tope (como siempre) */
  readonly deadline_at_ms?: number
  /** PAQUETE · reloj inyectable (pruebas) */
  readonly now_ms?: () => number
  /** PAQUETE (⑤) · el aviso de sobre perdido · default: campana de #equipo (best-effort) */
  readonly lost_alerter?: AlertaDeSobrePerdido
}

/** Canon canonical · runs one tick · TOTAL · cero silent drops. */
export async function consumeIntakeTick(
  input: OrchestratorInput,
): Promise<ConsumerTickResult> {
  const tick_id = randomUUID()
  const started_at = new Date().toISOString()
  const batch_size = Math.max(1, Math.min(input.batch_size ?? 10, 100))

  // ─── 1 · SELECT recent events from the log (tenant-scoped) ───
  // Canon canonical · tenant_id IS REQUIRED per Supabase RLS. When the
  // caller omits it, return an empty tick (cero scanned · cero processed)
  // so the admin endpoint can probe behavior without erroring out.
  if (!input.tenant_id) {
    return {
      tick_id,
      started_at,
      finished_at: new Date().toISOString(),
      scanned: 0,
      processed: 0,
      outcomes: [],
    }
  }
  const scan_window = Math.max(1, Math.min(input.scan_window ?? 200, 1000))
  const filters: ReadFilters = {
    tenant_id: input.tenant_id,
    event_type: 'step_completed',
    limit: scan_window,
    order: 'sequence_desc',
  }
  const events = await input.storage.select(filters)

  // ─── 2 · filter pending intake events ───
  // Regla de Lenovo 2026-09-07 · cuántos intentos lleva cada hilo
  const attempts_by_stream = countAttemptsByStream(events)
  const pending = selectPendingIntakeEvents({
    events,
    limit: batch_size,
  })

  const outcomes: DispatchOutcome[] = []
  const ahora = input.now_ms ?? Date.now
  let stopped_by_deadline = false

  // ─── 3 · process each ───
  for (const event of pending) {
    // PAQUETE (②) · pasado el tope de tiempo NO se toma otro sobre: lo que queda se recoge en el próximo tic
    if (input.deadline_at_ms !== undefined && ahora() >= input.deadline_at_ms) {
      stopped_by_deadline = true
      break
    }
    const parsed = parseIntakeEvent(event)
    if (!parsed.ok) {
      outcomes.push({
        intake_event_id: event.event_id,
        stream_id: event.stream_id,
        kind: 'skipped_parse_error',
        marker_event_id: null,
        detail: `parse_error · ${parsed.reason}`,
      })
      continue
    }

    // PAQUETE (③) · el reclamo: un asiento `router.claim.*` escrito ANTES de disparar · la clave de idempotencia es la del sobre ⇒ si otro tic ya lo reclamó,
    // el append NO inserta y este tic NO dispara (dos tics no pueden disparar el mismo sobre)
    const claim = input.claim_before_fire
      ? async () => {
          const reclamo = buildDispatchMarkerEvent({
            intake: parsed.value,
            kind: 'claimed',
            marker_class: 'claim',
            detail: 'sobre reclamado antes de disparar · sin desenlace todavía',
          })
          return (await append(input.storage, reclamo)).inserted
        }
      : undefined

    const result = await dispatchOneIntake({
      intake: parsed.value,
      ...(claim ? { claim } : {}),
      enabled: input.enabled,
      n8n_base_url: input.n8n_base_url,
      fetcher: input.fetcher,
      ...(input.cap_spend_query ? { cap_spend_query: input.cap_spend_query } : {}),
      ...(input.cap_alerter ? { cap_alerter: input.cap_alerter } : {}),
      ...(input.cap_enforce_override !== undefined
        ? { cap_enforce_override: input.cap_enforce_override }
        : {}),
    })

    // PAQUETE · otro tic ya reclamó el sobre: no hay nada que marcar ni que disparar
    if (result.kind === 'skipped_already_claimed') {
      outcomes.push({
        intake_event_id: parsed.value.event_id,
        stream_id: parsed.value.stream_id,
        kind: result.kind,
        marker_event_id: null,
        detail: result.detail,
      })
      continue
    }

    // ─── 4 · write marker event ───
    // 🔴 Regla de Lenovo 2026-09-07 · SÓLO SE MARCA LO QUE SE DESPACHÓ.
    // Antes esto escribía la marca de despacho para cinco de los seis
    // desenlaces —incluido `dispatched_failed`— y esa marca excluye el hilo
    // para siempre: un disparo fallido quedaba escrito como hecho.
    // Ahora: éxito → dispatch · fallo → attempt (vuelve a la fila) ·
    // fallo con el tope agotado → giveup (excluye, pero DECLARA el motivo).
    const fue_despachado = result.kind === DISPATCHED_KIND
    const intentos_previos = attempts_by_stream.get(parsed.value.stream_id) ?? 0
    const attempt_no = intentos_previos + 1
    // PAQUETE (③) · un disparo que FALLA tras el reclamo no vuelve a la fila (podría haber salido a medias): se declara PERDIDO (giveup) en vez de re-dispararse
    const perdido_tras_reclamo = !fue_despachado && result.claimed === true
    const tope_agotado = !fue_despachado && (perdido_tras_reclamo || attempt_no >= MAX_DISPATCH_ATTEMPTS)
    const marker_class: MarkerClass = fue_despachado
      ? 'dispatch'
      : tope_agotado
        ? 'giveup'
        : 'attempt'
    const marker_input = buildDispatchMarkerEvent({
      intake: parsed.value,
      kind: result.kind,
      marker_class,
      attempt_no,
      ...(perdido_tras_reclamo ? { after_claim: true } : {}),
      detail: perdido_tras_reclamo
        ? `NO PUDE DESPACHAR · el sobre se reclamó y el disparo falló · se PIERDE a propósito (no se duplica) · motivo: ${result.detail}`
        : tope_agotado
          ? `NO PUDE DESPACHAR · tope de ${MAX_DISPATCH_ATTEMPTS} intentos agotado · último motivo: ${result.detail}`
          : result.detail,
      dispatch_result: result.workflow_dispatch_result as
        | Record<string, unknown>
        | undefined,
      ...(result.cap_evaluation
        ? { cap_evaluation: result.cap_evaluation as unknown as Record<string, unknown> }
        : {}),
    })
    let marker_event_id: string | null = null
    try {
      const marker_result = await append(input.storage, marker_input)
      marker_event_id = marker_result.event.event_id
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      outcomes.push({
        intake_event_id: parsed.value.event_id,
        stream_id: parsed.value.stream_id,
        kind: 'marker_write_failed',
        marker_event_id: null,
        detail: `marker_write_failed · ${detail} · dispatch was: ${result.kind}`,
        dispatch_result: result.workflow_dispatch_result,
      })
      continue
    }

    outcomes.push({
      intake_event_id: parsed.value.event_id,
      stream_id: parsed.value.stream_id,
      kind: result.kind,
      marker_event_id,
      detail: result.detail,
      dispatch_result: result.workflow_dispatch_result,
    })
  }

  // ─── 5 · PAQUETE (⑤) · el vigilante: sobres reclamados que no llegaron a desenlace ───
  // Sólo mira lo que el tic YA leyó (cero consultas nuevas) · avisa UNA vez por sobre (deja un asiento `router.lostalert.*`) · NUNCA rompe el tic.
  let lost_claims: ReadonlyArray<LostClaim> = []
  if (input.claim_before_fire) {
    try {
      lost_claims = findLostClaims({ events, now_ms: ahora() })
      const alerta = input.lost_alerter ?? avisarSobrePerdido
      for (const perdido of lost_claims) {
        try {
          const reclamo = events.find((e) => e.event_id === perdido.claim_event_id)
          if (!reclamo) continue
          await alerta(perdido)
          await append(
            input.storage,
            buildDispatchMarkerEvent({
              intake: {
                event_id: perdido.intake_event_id ?? perdido.claim_event_id,
                stream_id: perdido.stream_id,
                correlation_id: reclamo.correlation_id,
                tenant_id: perdido.tenant_id,
                client_id: perdido.client_id,
                journey_type: perdido.journey_type,
                intake_source: 'vigilante',
                intake_intent: 'sobre-perdido',
                worker_workflow_id: '',
                source_event: reclamo,
              } as never,
              kind: 'claimed',
              marker_class: 'lostalert',
              detail: `sobre perdido · reclamado ${perdido.claimed_at} · sin desenlace tras ${Math.round(perdido.age_ms / 1000)} s`,
              extra: { sobre_perdido: true, claim_event_id: perdido.claim_event_id },
            }),
          )
        } catch {
          // best-effort · si el aviso o su asiento fallan, el próximo tic lo reintenta (mejor avisar dos veces que ninguna)
        }
      }
    } catch {
      lost_claims = []
    }
  }

  return {
    tick_id,
    started_at,
    finished_at: new Date().toISOString(),
    scanned: events.length,
    processed: outcomes.length,
    outcomes,
    ...(stopped_by_deadline ? { stopped_by_deadline } : {}),
    ...(input.claim_before_fire ? { lost_claims } : {}),
  }
}
