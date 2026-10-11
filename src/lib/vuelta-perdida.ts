/**
 * LA VUELTA QUE SE CORTA NO TIRA EL TRABAJO YA PAGADO · ronda 68.
 *
 * Caso real (repetición del tramo 1 · 11-oct): el redactor del plan se despachó a las 08:16:25; a los 2 min 19 s llegó a n8n una vuelta de ERROR
 * (`terminated`: se cortó la conexión entre Vercel y el corredor) y planeación dio el plan por perdido… pero el agente SIGUIÓ y terminó bien a los
 * 9,6 min (US$ 0,57). La recuperación de la respuesta ya pagada (E92/E96) esperaba sólo 120 s y la fila de 2.000 caracteres nunca podía probar que
 * un plan de 26.000 estuviera entero.
 *
 * Esto es general: vale para TODO agente despachado con vuelta (\`callback_url\`) cuya conexión se corta. Antes de mandar el error al flujo que espera,
 * se vuelve a mirar el libro hasta agotar el presupuesto de la función (la espera del flujo es de 15 min a 1 h) y, si el empleado terminó, la vuelta
 * lleva SU resultado. Si no se puede probar que el texto esté entero, o el empleado falló, o nunca llega: sale el error de siempre («no sé», jamás un valor inventado).
 */
import { recuperarRespuestaPagada, type FilaInvocacion, type RespuestaPagada } from '@/lib/respuesta-pagada'

/** presupuesto de la función (maxDuration 800 s) menos un margen para escribir el libro y mandar la vuelta */
export const PRESUPUESTO_DE_LA_FUNCION_MS = 800_000
export const MARGEN_PARA_ENTREGAR_MS = 25_000
/** menos que esto no vale la pena esperar */
export const ESPERA_MINIMA_UTIL_MS = 10_000
/** sondeo del libro mientras el empleado sigue trabajando */
export const SONDEO_DE_LA_VUELTA_MS = 10_000

const SEÑALES_DE_CONEXION_PERDIDA = /terminated|fetch failed|socket|econnreset|econnrefused|aborted|network|other side closed|und_err|proxy|upstream/i

/** ¿el error de la vuelta es de CONEXIÓN (el empleado pudo seguir trabajando) y no un fallo del propio empleado? */
export function esVueltaPerdidaPorConexion(cuerpo: unknown): boolean {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return false
  const b = cuerpo as Record<string, unknown>
  if (b.success === true) return false
  if (b.error_kind === 'inner_run_threw') return true
  const upstream = Number(b.upstream_status)
  if (b.upstream_status !== undefined && [0, 502, 503, 504].includes(upstream)) return true
  const err = typeof b.error === 'string' ? b.error : ''
  // un fallo del propio empleado (el corredor lo dijo) NO es una conexión perdida
  if (b.error_kind === 'runner_run_failed') return false
  return err.length > 0 && SEÑALES_DE_CONEXION_PERDIDA.test(err)
}

/**
 * El tope de espera de la recuperación DENTRO del trabajo interno: 120 s (E92/E96) salvo que la vuelta por callback haya fijado un plazo (epoch ms) válido y futuro,
 * y entonces es lo que falta hasta ese plazo (nunca menos de 120 s ni más de 790 s). Lo que llegue mal escrito o vencido se ignora: rige el de siempre.
 */
export function topeDeRecuperacionInterna(vence: string | null | undefined, ahoraMs: number): number {
  const base = 120_000
  const v = Number(vence)
  if (!vence || !Number.isFinite(v)) return base
  const queda = v - ahoraMs
  if (queda <= base) return base
  return Math.min(queda, 790_000)
}

/** cuánto se puede esperar todavía · 0 si no queda margen */
export function topeDeEsperaMs(empezoEnMs: number, ahoraMs: number): number {
  const queda = empezoEnMs + PRESUPUESTO_DE_LA_FUNCION_MS - MARGEN_PARA_ENTREGAR_MS - ahoraMs
  return queda >= ESPERA_MINIMA_UTIL_MS ? queda : 0
}

/** el cuerpo de la vuelta con el resultado recuperado · mismos campos que la vuelta cruda del corredor + la marca de que se recuperó */
export function cuerpoDeVueltaRecuperada(r: RespuestaPagada, ctx: { agente: string; dispatchKey: string | null }): Record<string, unknown> {
  return {
    success: true,
    agent: ctx.agente,
    response: r.response,
    session_id: r.sessionId,
    model: r.model,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: r.costUsd,
    duration_ms: r.durationMs,
    recovered_after_connection_lost: true,
    delivered_by: 'recovery',
    dispatch_key: ctx.dispatchKey,
  }
}

export interface EntradaDeRecuperacion {
  cuerpoDelError: unknown
  agente: string
  paso: string | null
  executionId: string | null
  dispatchKey: string | null
  empezoEnMs: number
}

/**
 * Devuelve el cuerpo de vuelta con el resultado del empleado, o null si no hay nada que recuperar (el llamador manda el error de siempre).
 * No hace nada si el error no es de conexión, si no hay corrida que buscar, o si no queda margen.
 */
export async function recuperarVueltaPerdida(
  e: EntradaDeRecuperacion,
  deps: {
    buscarFila: () => Promise<FilaInvocacion | null>
    ahora?: () => number
    esperar?: (ms: number) => Promise<void>
  },
): Promise<Record<string, unknown> | null> {
  if (!esVueltaPerdidaPorConexion(e.cuerpoDelError)) return null
  if (!e.executionId) return null // sin corrida no hay qué buscar sin riesgo de traer la de otro
  const ahora = deps.ahora ?? (() => Date.now())
  const tope = topeDeEsperaMs(e.empezoEnMs, ahora())
  if (tope <= 0) return null
  const r = await recuperarRespuestaPagada(
    { agent: e.agente, step: e.paso, executionId: e.executionId, topeMs: tope, sondeoMs: SONDEO_DE_LA_VUELTA_MS, quien: 'vuelta-perdida' },
    { buscarFila: deps.buscarFila, ahora, ...(deps.esperar ? { esperar: deps.esperar } : {}) },
  )
  return r ? cuerpoDeVueltaRecuperada(r, { agente: e.agente, dispatchKey: e.dispatchKey }) : null
}
