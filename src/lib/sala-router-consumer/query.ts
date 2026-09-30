/**
 * Canon canonical · pending intake selection · sala-router-consumer.
 *
 * Pure function over a list of `PersistedEvent` · returns the intake
 * events that DO NOT yet have a matching `router.dispatch.*` marker
 * for the same stream_id. Caller fetches a wider window from the log
 * (e.g. last 1000 rows) and this function picks the un-processed ones.
 *
 * §148 honest · O(N) two-pass · first builds a set of (stream_id) that
 * already have a dispatch marker · second pass filters intake events
 * by exclusion. The orchestrator then bounds the result by batch_size.
 */
import type { PersistedEvent } from '@/lib/sala-event-log'
import {
  ATTEMPT_MARKER_PREFIX,
  CLAIM_MARKER_PREFIX,
  CLAIM_STALE_MS,
  DISPATCH_MARKER_PREFIX,
  GIVEUP_MARKER_PREFIX,
  INTAKE_STEP_PREFIX,
  LOST_ALERT_MARKER_PREFIX,
  type LostClaim,
} from './types'

/**
 * Canon canonical · cuántos intentos fallidos lleva cada hilo.
 * Regla de Lenovo 2026-09-07 · lo que NO se despachó vuelve a la fila,
 * pero con contador: un reintento sin límite es otro problema.
 */
export function countAttemptsByStream(
  events: ReadonlyArray<PersistedEvent>,
): ReadonlyMap<string, number> {
  const n = new Map<string, number>()
  for (const e of events) {
    if (
      e.event_type === 'step_completed' &&
      typeof e.step_id === 'string' &&
      e.step_id.startsWith(ATTEMPT_MARKER_PREFIX)
    ) {
      n.set(e.stream_id, (n.get(e.stream_id) ?? 0) + 1)
    }
  }
  return n
}

export interface PendingIntakeQueryInput {
  readonly events: ReadonlyArray<PersistedEvent>
  /** Canon canonical · max returned rows (orchestrator bounds further). */
  readonly limit?: number
}

/** Canon canonical · returns intake events whose stream has no matching
 *  marker yet. Sorted by sequence ascending (FIFO order). */
export function selectPendingIntakeEvents(
  input: PendingIntakeQueryInput,
): ReadonlyArray<PersistedEvent> {
  // Regla de Lenovo 2026-09-07 · SÓLO excluyen dos cosas:
  //   · router.dispatch.* → se despachó de verdad (terminal correcto)
  //   · router.giveup.*   → se agotó el tope y quedó declarado el motivo
  // El intento fallido (router.attempt.*) YA NO excluye: vuelve a la fila.
  const dispatched_streams = new Set<string>()
  for (const e of input.events) {
    if (
      e.event_type === 'step_completed' &&
      typeof e.step_id === 'string' &&
      (e.step_id.startsWith(DISPATCH_MARKER_PREFIX) ||
        e.step_id.startsWith(GIVEUP_MARKER_PREFIX) ||
        // PAQUETE · un sobre RECLAMADO no vuelve a la fila (si el disparo no volvió, se pierde; NO se duplica)
        e.step_id.startsWith(CLAIM_MARKER_PREFIX))
    ) {
      dispatched_streams.add(e.stream_id)
    }
  }

  const pending: PersistedEvent[] = []
  for (const e of input.events) {
    if (
      e.event_type === 'step_completed' &&
      typeof e.step_id === 'string' &&
      e.step_id.startsWith(INTAKE_STEP_PREFIX) &&
      !dispatched_streams.has(e.stream_id)
    ) {
      pending.push(e)
    }
  }

  pending.sort((a, b) => a.sequence - b.sequence)
  const limit = Math.max(1, Math.min(input.limit ?? 10, 100))
  return pending.slice(0, limit)
}

/**
 * EL VIGILANTE · sobres RECLAMADOS sin desenlace (pieza ⑤) · pura sobre la misma ventana que ya leyó el tic.
 * Un hilo cuenta como PERDIDO si tiene un reclamo más viejo que `stale_ms`, ningún despacho ni abandono, y ningún aviso previo (así se avisa UNA sola vez).
 */
export function findLostClaims(input: {
  readonly events: ReadonlyArray<PersistedEvent>
  readonly now_ms: number
  readonly stale_ms?: number
}): ReadonlyArray<LostClaim> {
  const stale = input.stale_ms ?? CLAIM_STALE_MS
  const conDesenlace = new Set<string>()
  const yaAvisados = new Set<string>()
  for (const e of input.events) {
    if (e.event_type !== 'step_completed' || typeof e.step_id !== 'string') continue
    if (e.step_id.startsWith(DISPATCH_MARKER_PREFIX) || e.step_id.startsWith(GIVEUP_MARKER_PREFIX)) conDesenlace.add(e.stream_id)
    if (e.step_id.startsWith(LOST_ALERT_MARKER_PREFIX)) yaAvisados.add(e.stream_id)
  }
  const perdidos: LostClaim[] = []
  const vistos = new Set<string>()
  for (const e of input.events) {
    if (e.event_type !== 'step_completed' || typeof e.step_id !== 'string' || !e.step_id.startsWith(CLAIM_MARKER_PREFIX)) continue
    if (conDesenlace.has(e.stream_id) || yaAvisados.has(e.stream_id) || vistos.has(e.stream_id)) continue
    const claimed_ms = Date.parse(e.created_at)
    if (!Number.isFinite(claimed_ms)) continue
    const age_ms = input.now_ms - claimed_ms
    if (age_ms < stale) continue
    vistos.add(e.stream_id)
    const causa = (e.payload as Record<string, unknown> | null)?.caused_by_intake_event_id
    perdidos.push({
      stream_id: e.stream_id,
      claim_event_id: e.event_id,
      claimed_at: e.created_at,
      age_ms,
      tenant_id: e.tenant_id,
      client_id: e.client_id,
      journey_type: String(e.journey_type),
      intake_event_id: typeof causa === 'string' ? causa : null,
    })
  }
  return perdidos
}
