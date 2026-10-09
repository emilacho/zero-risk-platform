/**
 * Núcleo compartido de los manejadores: esperas con reloj, corridas idempotentes con plazo, presupuesto, `necesita_humano`.
 * Todo contra la interfaz `Almacen` (nada de base aquí).
 */
import { createHash } from 'node:crypto'
import type { Almacen, Campana, Corrida, EsperaFila } from './almacen'
import { calcularReloj, type ContextoPlazo } from './esperas'
import { MAXIMO_DE_INTENTOS, plazoDeLlamadaMinutos, topeDelPaso, type Paso } from './constantes'

export const sello = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12)
export const semanaDeId = (id: string): number => Number(/^s(\d+)-/.exec(id)?.[1] ?? 0)

/** Abre una espera con su reloj (idempotente por `dedupKey`). Sin plazo configurado para el tipo, falla fuerte: no se crea una espera sin reloj. */
export async function abrirEsperaDe(
  al: Almacen, campana: Pick<Campana, 'id' | 'seco'>, tipo: string, objetoId: string, motivo: string, ahora: string, ctx: ContextoPlazo = {}, dedupKey?: string,
): Promise<EsperaFila> {
  const plazo = (await al.plazos()).find((p) => p.tipo === tipo)
  if (!plazo) throw new Error(`no hay plazo configurado para ${tipo}: no se crea una espera sin reloj`)
  const reloj = calcularReloj(plazo, ahora, ctx)
  const r = await al.abrirEspera({
    campana_id: campana.id, objeto_tipo: tipo, objeto_id: objetoId, motivo, desde: ahora,
    recordatorio_en: reloj.recordatorio_en, alerta_en: reloj.alerta_en, vence_en: reloj.vence_en, estado: 'viva', rung_enviado: 0,
    dedup_key: dedupKey ?? `${campana.id}:${tipo}:${objetoId}`, accion_al_vencer: reloj.accion_al_vencer, seco: campana.seco,
  })
  return r.espera
}

export async function resolverEsperas(al: Almacen, campanaId: string, tipo: string, objetoId?: string): Promise<void> {
  for (const e of await al.esperasVivas()) {
    if (e.campana_id === campanaId && e.objeto_tipo === tipo && (objetoId === undefined || e.objeto_id === objetoId)) await al.actualizarEspera(e.id, { estado: 'resuelta' })
  }
}

/** Una campaña que necesita a Emilio: queda en `necesita_humano` CON su reloj (aviso inmediato, a las 48 h, y a los 7 días pasa a pausada). */
export async function ponerNecesitaHumano(al: Almacen, campana: Campana, motivo: string, ahora: string): Promise<{ campana: Campana; alerta: string }> {
  const c = await al.actualizarCampana(campana.id, { estado: 'necesita_humano', estado_motivo: motivo.slice(0, 500) })
  await abrirEsperaDe(al, c, 'necesita_humano', c.id, motivo.slice(0, 200), ahora, {}, `nh:${c.id}:${sello(motivo)}`)
  return { campana: c, alerta: `La campaña ${c.id} necesita a Emilio: ${motivo.slice(0, 300)}` }
}

export function costoEfectivo(c: Pick<Corrida, 'costo_usd' | 'estado' | 'paso'>): number {
  if (typeof c.costo_usd === 'number' && c.costo_usd > 0) return c.costo_usd
  // el libro puede registrar 0 en un corte con tope diminuto (hallazgo de CC#1, relevo 29): si la llamada no terminó bien, se cuenta el tope como cota pesimista
  if (c.estado === 'fallida' || c.estado === 'vencida' || c.estado === 'cerrada_por_tope') return topeDelPaso(c.paso as Paso)
  return 0
}

export async function gastoDeCampana(al: Almacen, campanaId: string): Promise<number> {
  return (await al.corridasDeCampana(campanaId)).reduce((s, c) => s + costoEfectivo(c), 0)
}

export type ResultadoDePreparar =
  | { tipo: 'lista'; corrida: Corrida }
  | { tipo: 'ya_hecha'; corrida: Corrida }
  | { tipo: 'en_curso'; corrida: Corrida }
  | { tipo: 'intentos_agotados' }
  | { tipo: 'presupuesto_agotado'; gastado: number; presupuesto: number }

/**
 * Abre la corrida de un paso con su plazo (condición 2 de CC#3: una llamada en curso sin plazo es una espera sin reloj).
 * Idempotente: la misma `clave` con una corrida ok → `ya_hecha`; con una en curso dentro de plazo → `en_curso`; vencida o fallida → siguiente intento (máx. 3).
 */
export async function prepararCorrida(
  al: Almacen, campana: Campana, paso: Paso, clave: string, workflowId: string, workflowExecutionId: string, ahora: string, modelo: string, esquemaHash: string | null,
): Promise<ResultadoDePreparar> {
  const previas = (await al.corridasDeCampana(campana.id)).filter((c) => c.paso === paso && c.clave_idempotencia === clave)
  const ok = previas.find((c) => c.estado === 'ok')
  if (ok) return { tipo: 'ya_hecha', corrida: ok }
  for (const c of previas.filter((x) => x.estado === 'en_curso')) {
    if (c.plazo_en && Date.parse(ahora) > Date.parse(c.plazo_en)) await al.cerrarCorrida(c.id, { estado: 'vencida', error: 'la llamada pasó su plazo sin volver', plazo_en: c.plazo_en })
    else return { tipo: 'en_curso', corrida: c }
  }
  const fallidas = (await al.corridasDeCampana(campana.id)).filter((c) => c.paso === paso && c.clave_idempotencia === clave).length
  const intento = fallidas + 1
  if (intento > MAXIMO_DE_INTENTOS) return { tipo: 'intentos_agotados' }
  const gastado = await gastoDeCampana(al, campana.id)
  if (gastado + topeDelPaso(paso) > campana.presupuesto_planificacion_usd) return { tipo: 'presupuesto_agotado', gastado, presupuesto: campana.presupuesto_planificacion_usd }
  const plazoMin = await plazoDeLlamadaMinutos(al)
  const { corrida } = await al.abrirCorrida({
    campana_id: campana.id, paso, clave_idempotencia: clave, intento, workflow_id: workflowId, workflow_execution_id: workflowExecutionId,
    modelo, costo_usd: null, estado: 'en_curso', plazo_en: new Date(Date.parse(ahora) + plazoMin * 60_000).toISOString(), error: null,
    revision_editor: paso === 'brief' ? 'conservada' : 'saltada_por_diseno', salida_estructurada: esquemaHash !== null, esquema_hash: esquemaHash, seco: campana.seco,
  })
  return { tipo: 'lista', corrida }
}
