/**
 * ARQ 2026-09-30 · el trabajo en segundo plano del corredor cuando la vuelta la entrega ÉL (`callback_mode: "runner"`).
 * Corre el empleado, arma la vuelta, la entrega a `callback_url` (ya validada) y cierra el libro de despachos.
 *
 * Regla del libro: el despacho se cierra SÓLO si la vuelta llegó (completed | error entregado). Si el trabajo terminó pero la
 * vuelta NO se pudo entregar, el despacho queda `running` a propósito: es exactamente la huella «terminó y no entregó» que
 * el reconciliador de despachos huérfanos (PR #398) detecta y avisa. Nunca se cierra en verde algo que nadie recibió.
 */
import {
  cuerpoDeLaVuelta,
  eventoDeCorridaCompleta,
  entregarLaVuelta,
  esperaForzadaMs,
  type IntentoDeEntrega,
  type ResultadoDeEntrega,
} from './entrega-de-la-vuelta.js'

export interface DepsDeEntrega {
  ejecutar: () => Promise<{
    success?: boolean
    response?: string
    sessionId?: string | null
    model?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    durationMs?: number
    brainEnrichment?: unknown
    cacheMetrics?: unknown
    error?: string
    partial?: boolean
    partialReason?: string
  }>
  entregar?: (url: URL, cuerpo: unknown, alIntentar: (i: IntentoDeEntrega) => void) => Promise<ResultadoDeEntrega>
  registrarIntento: (i: IntentoDeEntrega) => void
  cerrarDespacho: (estado: 'completed' | 'error') => Promise<void>
  avisarFallo: (mensaje: string, extra: Record<string, unknown>) => void
  /** analítica · simetría con Vercel · nunca lanza · opcional (sin ella no se emite) */
  emitirEvento?: (ev: ReturnType<typeof eventoDeCorridaCompleta>) => Promise<unknown>
  dormir?: (ms: number) => Promise<void>
}

export async function correrYEntregar(
  p: { url: URL; agentName: string; dispatchKey: string | null; clientId?: string | null; dryRun: boolean; esperaForzada?: unknown },
  deps: DepsDeEntrega,
): Promise<{ entregada: boolean; estadoCerrado: 'completed' | 'error' | null }> {
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const entregar = deps.entregar ?? ((url, cuerpo, alIntentar) => entregarLaVuelta({ url, cuerpo, alIntentar }))
  let result: Awaited<ReturnType<DepsDeEntrega['ejecutar']>>
  try {
    const espera = esperaForzadaMs(p.dryRun, p.esperaForzada)
    if (espera > 0) await dormir(espera)
    result = await deps.ejecutar()
  } catch (e) {
    result = { success: false, error: e instanceof Error ? e.message : String(e) }
  }
  // el evento de analítica sale ANTES de entregar y pase lo que pase con la entrega (Vercel lo emite antes de mirar el éxito)
  try {
    await deps.emitirEvento?.(eventoDeCorridaCompleta(result, { agentName: p.agentName, clientId: p.clientId ?? null }))
  } catch {
    /* la analítica nunca frena la vuelta */
  }
  const cuerpo = cuerpoDeLaVuelta(result, { agentName: p.agentName, dispatchKey: p.dispatchKey })
  const r = await entregar(p.url, cuerpo, deps.registrarIntento)
  if (!r.ok) {
    // el trabajo terminó (y se cobró) pero nadie lo recibió · el libro NO se cierra · el reconciliador lo verá
    deps.avisarFallo('runner_callback_all_retries_failed', {
      agent: p.agentName,
      dispatch_key: p.dispatchKey,
      attempts: r.intentos.length,
      last: r.intentos[r.intentos.length - 1] ?? null,
      run_success: !!result.success,
    })
    return { entregada: false, estadoCerrado: null }
  }
  const estado = result.success ? 'completed' : 'error'
  await deps.cerrarDespacho(estado)
  return { entregada: true, estadoCerrado: estado }
}
