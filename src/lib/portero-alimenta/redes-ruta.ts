/**
 * Un paso diario de redes de principio a fin: reclamarlo → correrlo → cerrarlo (hecha solo al terminar). Lo usan la ruta POST (un cliente y un paso) y el cron GET (el siguiente pendiente).
 */
import { cerrarPaso, reabrirPaso, reclamarPaso, siguientePaso, type Paso, type PasoAbandonado } from './pasos-diarios'
import { correrPasoDeRedes, tendenciasEncendidas, type EntradaDePasoDeRedes } from './redes-del-cliente'
import { clientesActivos } from './clientes'

type Db = EntradaDePasoDeRedes['db']
export interface DepsDePaso { db: Db; ahora: Date; /** el aviso a #alertas cuando un paso queda abandonado (un incidente, un aviso) */ alAbandonar?: (p: PasoAbandonado) => Promise<unknown>; env?: Record<string, string | undefined>; fetch?: EntradaDePasoDeRedes['fetch']; llamarModelo?: (clientId: string, workflowId: string, ejecucionId: string) => EntradaDePasoDeRedes['llamarModelo']; registro?: (workflowId: string, ejecucionId: string) => EntradaDePasoDeRedes['registro'] }

export type RespuestaDePaso =
  | { ok: true; estado: 'apagado' | 'seco' | 'no_hay_pendientes' | 'no_se_reclamo'; paso?: Paso; client_id?: string; motivo?: string; pendientes?: number }
  | { ok: boolean; estado: 'hecha' | 'con_errores'; paso: Paso; client_id: string; intento: number; gasto_usd: number; errores: string[]; resumen: Record<string, unknown>; rastro_cerrado: boolean }
  | { ok: false; estado: 'error'; detalle: string }

export async function correrUnPaso(d: DepsDePaso, a: { clientId: string; paso: Paso; workflowId: string; ejecucionId: string; dry_run: boolean; /** reabre antes un paso ABANDONADO de hoy */ reintentar?: boolean }): Promise<RespuestaDePaso> {
  if (!tendenciasEncendidas(d.env)) return { ok: true, estado: 'apagado', paso: a.paso, client_id: a.clientId, motivo: 'PORTERO_TENDENCIAS está apagado: no se hizo nada' }
  const dia = d.ahora.toISOString().slice(0, 10)
  if (a.dry_run) return { ok: true, estado: 'seco', paso: a.paso, client_id: a.clientId, motivo: 'en seco no se reclama ni se escribe nada' }
  if (a.reintentar) { const ab = await reabrirPaso(d.db, { clientId: a.clientId, dia, paso: a.paso }); if (!ab.ok) return { ok: false, estado: 'error', detalle: ab.detalle ?? 'no se pudo reabrir el paso' } }
  const rec = await reclamarPaso(d.db, { clientId: a.clientId, dia, paso: a.paso, ahora: d.ahora, workflowId: a.workflowId, ejecucionId: a.ejecucionId, alAbandonar: d.alAbandonar })
  if (!rec.ok) return rec.motivo === 'error' ? { ok: false, estado: 'error', detalle: rec.detalle ?? 'no se pudo reclamar el paso' } : { ok: true, estado: 'no_se_reclamo', paso: a.paso, client_id: a.clientId, motivo: rec.motivo }
  const r = await correrPasoDeRedes({ db: d.db, clientId: a.clientId, paso: a.paso, ahora: d.ahora, env: d.env, fetch: d.fetch, llamarModelo: d.llamarModelo?.(a.clientId, a.workflowId, a.ejecucionId), registro: d.registro?.(a.workflowId, a.ejecucionId) })
  const delPaso = r.estado === 'cliente_inexistente' ? ['el cliente no existe'] : r.errores
  const cierre = await cerrarPaso(d.db, { id: rec.id, ahora: d.ahora, errores: delPaso, resumen: r.resumen, gastoUsd: r.gasto_usd })
  const errores = [...delPaso, ...(cierre.ok ? [] : [`rastro del paso: ${cierre.detalle}`])]
  return { ok: errores.length === 0, estado: errores.length ? 'con_errores' : 'hecha', paso: a.paso, client_id: a.clientId, intento: rec.intento, gasto_usd: r.gasto_usd, errores, resumen: r.resumen, rastro_cerrado: cierre.ok }
}

/** el cron: un paso pendiente de hoy por llamada */
export async function correrElSiguientePaso(d: DepsDePaso & { clientes?: string[] }, a: { workflowId: string; ejecucionId: string }): Promise<RespuestaDePaso> {
  if (!tendenciasEncendidas(d.env)) return { ok: true, estado: 'apagado', motivo: 'PORTERO_TENDENCIAS está apagado: no se hizo nada' }
  let clientes = d.clientes
  if (!clientes) {
    const act = await clientesActivos(d.db as never)
    if (!act.ok) return { ok: false, estado: 'error', detalle: `clientes: ${act.detalle}`.slice(0, 200) }
    clientes = act.datos.clientes.map((c) => c.client_id)
  }
  const sig = await siguientePaso(d.db, { clientes, dia: d.ahora.toISOString().slice(0, 10), ahora: d.ahora })
  if (!sig.ok) return { ok: false, estado: 'error', detalle: sig.detalle }
  if (!sig.siguiente) return { ok: true, estado: 'no_hay_pendientes', pendientes: 0 }
  return correrUnPaso(d, { clientId: sig.siguiente.clientId, paso: sig.siguiente.paso, workflowId: a.workflowId, ejecucionId: a.ejecucionId, dry_run: false })
}
