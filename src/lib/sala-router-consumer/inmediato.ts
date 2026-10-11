/**
 * DESPACHO INMEDIATO · el sobre sale en cuanto entra a la sala; el reloj de 15 min queda SOLO de respaldo.
 *
 * Antes: `/api/sala/intake` escribía el sobre en la libreta y el repartidor (reloj de 15 min) lo recogía: 11–12 min de espera en cada tramo de la repetición.
 * Ahora: justo después de aceptar y escribir el sobre, la misma ruta pide UN tic para ESE sobre (`only_event_id`).
 *
 * NUNCA DOBLE DESPACHO: el tic inmediato usa `claim_before_fire`: antes de disparar escribe un asiento `router.claim.*` con la clave de idempotencia del sobre; si el reloj (u otro tic) ya lo reclamó,
 * el append no inserta y este tic no dispara. Por eso el inmediato SOLO se permite con el paquete del repartidor encendido (reclamo) y se niega sin él: sin reclamo, inmediato + reloj podrían disparar dos veces.
 * Respeta los frenos de siempre (consumidor, dispatcher, tope de gasto por corrida/cliente) porque pasa por el mismo `dispatchOneIntake`. Cadena y oficina apagadas siguen en pasarela (eso vive en los flujos).
 * Nunca lanza: un fallo aquí no puede romper la respuesta de la entrada; lo que no salga queda para el reloj (si no fue reclamado) o declarado como perdido (si fue reclamado).
 */
import type { EventLogStorage } from '@/lib/sala-event-log'
import { consumeIntakeTick, type OrchestratorInput } from './orchestrator'
import type { ConsumerTickResult } from './types'
import { TICK_DEADLINE_MS_DEFAULT } from './types'

/** palanca propia · NACE APAGADA · solo `true` literal la enciende */
export function isInmediatoEnabled(): boolean {
  return process.env.SALA_ROUTER_INMEDIATO_ENABLED === 'true'
}

export type MotivoSinDespachoInmediato = 'palanca_apagada' | 'consumidor_apagado' | 'sin_reclamo_no_es_seguro' | 'sin_sobre' | 'error'
export interface ResultadoInmediato {
  readonly intentado: boolean
  readonly motivo?: MotivoSinDespachoInmediato
  readonly detalle?: string
  readonly tick?: ConsumerTickResult
  readonly ms: number
}

export interface EntradaInmediato extends Pick<OrchestratorInput, 'storage' | 'cap_spend_query' | 'cap_usd_query' | 'cap_alerter' | 'cap_enforce_override' | 'enabled' | 'n8n_base_url' | 'fetcher' | 'now_ms'> {
  readonly tenant_id: string
  readonly event_id: string
  /** pruebas: sustituyen a las palancas de entorno */
  readonly palancas?: { inmediato?: boolean; consumidor?: boolean; paquete?: boolean }
  /** tope de tiempo del tic (ms) · por omisión el mismo del reloj */
  readonly tope_ms?: number
}

export async function despacharAlEntrar(a: EntradaInmediato): Promise<ResultadoInmediato> {
  const t0 = Date.now()
  const ms = () => Date.now() - t0
  try {
    const inm = a.palancas?.inmediato ?? isInmediatoEnabled()
    if (!inm) return { intentado: false, motivo: 'palanca_apagada', ms: ms() }
    const consumidor = a.palancas?.consumidor ?? process.env.SALA_ROUTER_CONSUMER_ENABLED === 'true'
    if (!consumidor) return { intentado: false, motivo: 'consumidor_apagado', ms: ms() }
    const paquete = a.palancas?.paquete ?? process.env.SALA_ROUTER_PAQUETE_ENABLED === 'true'
    if (!paquete) return { intentado: false, motivo: 'sin_reclamo_no_es_seguro', detalle: 'sin SALA_ROUTER_PAQUETE_ENABLED el sobre no se reclama antes de disparar: inmediato + reloj podrían duplicar', ms: ms() }
    if (!a.event_id || !a.tenant_id) return { intentado: false, motivo: 'sin_sobre', ms: ms() }
    const tope = a.tope_ms ?? (Number(process.env.SALA_ROUTER_TICK_DEADLINE_MS) > 0 ? Number(process.env.SALA_ROUTER_TICK_DEADLINE_MS) : TICK_DEADLINE_MS_DEFAULT)
    const ahora = a.now_ms ?? Date.now
    const tick = await consumeIntakeTick({
      storage: a.storage as EventLogStorage,
      tenant_id: a.tenant_id,
      batch_size: 1,
      scan_window: 50,
      only_event_id: a.event_id,
      claim_before_fire: true,
      deadline_at_ms: ahora() + tope,
      ...(a.enabled !== undefined ? { enabled: a.enabled } : {}),
      ...(a.n8n_base_url ? { n8n_base_url: a.n8n_base_url } : {}),
      ...(a.fetcher ? { fetcher: a.fetcher } : {}),
      ...(a.cap_spend_query ? { cap_spend_query: a.cap_spend_query } : {}),
      ...(a.cap_usd_query ? { cap_usd_query: a.cap_usd_query } : {}),
      ...(a.cap_alerter ? { cap_alerter: a.cap_alerter } : {}),
      ...(a.cap_enforce_override !== undefined ? { cap_enforce_override: a.cap_enforce_override } : {}),
      ...(a.now_ms ? { now_ms: a.now_ms } : {}),
    })
    return { intentado: true, tick, ms: ms() }
  } catch (e) {
    return { intentado: false, motivo: 'error', detalle: e instanceof Error ? e.message : String(e), ms: ms() }
  }
}
