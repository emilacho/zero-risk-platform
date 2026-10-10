/**
 * CORRER EL DIARIO PARA UN CLIENTE (pasos 2, 3 y 5) · TODO CÓDIGO, ningún modelo, US$ 0. Recibe la base por parámetro (se prueba con una base falsa).
 *  · `dry_run` OBLIGATORIO: con true se calcula todo y NO se escribe NADA (ni siquiera el rastro de la corrida);
 *  · una corrida por cliente y día (la fila de `cerebro_diario_corridas` es el candado); `forzar` la repite;
 *  · idempotente: la misma raspada da la misma huella y no escribe nada nuevo;
 *  · escribe SOLO en `cerebro_vigilancia`, `cerebro_diario_corridas`, `cerebro_oportunidades` y, para limpiar, retira filas de `cerebro_fichas` (nunca contenido nuevo, nunca borra);
 *  · el paso 4 (avisar) NO corre aquí: D-5 manda construir antes `output_id` en la cola de revisión;
 *  · un error de lectura se DICE; nunca se lee como «no hay nada».
 */
import { propiosDeFicha } from '../../manual/cliente'
import { decidir, resumirDiferencia, type Decision } from './comparar'
import { codigosDePublicaciones, observar, type FilaCruda, type Observacion } from './observar'
import { planDeLimpieza, type FichaFila, type PlanDeLimpieza } from './ordenar'
import { oportunidadDeComentarios, oportunidadDeResenas, oportunidadesDeCambios, type Oportunidad } from './preparar'
import type { SenalesDeComentarios, SenalesDeResenas } from './resenas'
import { decidirGasto, TOPE_DIARIO_POR_CLIENTE_USD } from './topes'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const MAX_FILAS_DE_RASPADO = 400

export interface EntradaDeCorrida {
  db: Db
  client_id: string
  dry_run: boolean
  ahora?: Date
  forzar?: boolean
  limpiar_fichas?: boolean
  /** lo que la ampliación gastó hoy (lo informa el flujo) y lo que el flujo de la mañana gastó (estimado por la ruta) */
  gasto_ampliacion_usd?: number
  gasto_de_la_manana_usd?: number
  workflow_id?: string
  workflow_execution_id?: string
}
export interface FuenteVista { fuente: string; ref: string; accion: Decision['accion'] | 'renovada'; resumen?: ReturnType<typeof resumirDiferencia>; raw_id: string }
export interface ResultadoDeCorrida {
  ok: boolean
  estado: 'hecha' | 'con_errores' | 'ya_corrio_hoy' | 'cliente_inexistente' | 'lectura_fallida'
  dry_run: boolean
  fuentes: FuenteVista[]
  oportunidades: Oportunidad[]
  limpieza: (PlanDeLimpieza & { aplicada: boolean }) | null
  gasto: { ampliacion_usd: number; manana_usd: number; total_usd: number; tope_usd: number; supero_el_tope: boolean }
  escrituras: { vigilancia_nuevas: number; vigilancia_versiones: number; vigilancia_renovadas: number; oportunidades: number; fichas_retiradas: number; fichas_marcadas: number; corrida: number }
  errores: string[]
  detalle?: string
}

const vacio = (dry_run: boolean): ResultadoDeCorrida => ({
  ok: false, estado: 'lectura_fallida', dry_run, fuentes: [], oportunidades: [], limpieza: null,
  gasto: { ampliacion_usd: 0, manana_usd: 0, total_usd: 0, tope_usd: TOPE_DIARIO_POR_CLIENTE_USD, supero_el_tope: false },
  escrituras: { vigilancia_nuevas: 0, vigilancia_versiones: 0, vigilancia_renovadas: 0, oportunidades: 0, fichas_retiradas: 0, fichas_marcadas: 0, corrida: 0 }, errores: [],
})
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const lineasDe = (contenido: unknown): string[] => {
  const c = (contenido && typeof contenido === 'object' ? contenido : {}) as Fila
  if (Array.isArray(c.lineas)) return c.lineas.filter((l): l is string => typeof l === 'string')
  if (c.campos && typeof c.campos === 'object') return Object.entries(c.campos as Record<string, string>).map(([k, v]) => `${k} ${v}`)
  if (typeof c.biografia === 'string') return [...(c.biografia ? [`bio ${c.biografia}`] : []), ...lista(c.publicaciones).map((p) => `${p.id} ${p.texto}`)]
  return []
}
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

export async function correrDiario(e: EntradaDeCorrida): Promise<ResultadoDeCorrida> {
  const ahora = e.ahora ?? new Date()
  const dia = ahora.toISOString().slice(0, 10)
  const r = vacio(e.dry_run)
  const falla = (que: string, m: string): ResultadoDeCorrida => ({ ...r, estado: 'lectura_fallida', detalle: `${que}: ${m}` })

  const cl = await e.db.from('clients').select('*').eq('id', e.client_id).limit(1)
  if (cl.error) return falla('clients', cl.error.message)
  const cliente = lista(cl.data)[0]
  if (!cliente) return { ...r, estado: 'cliente_inexistente', detalle: 'no existe la ficha del cliente' }

  const ya = await e.db.from('cerebro_diario_corridas').select('id, estado, resumen').eq('client_id', e.client_id).eq('dia', dia).limit(1)
  if (ya.error) return falla('cerebro_diario_corridas', ya.error.message)
  const corridaDeHoy = lista(ya.data)[0]
  if (corridaDeHoy && !e.forzar) return { ...r, ok: true, estado: 'ya_corrio_hoy', detalle: 'ya hay una corrida de hoy para este cliente (forzar la repite)' }

  const rr = await e.db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo, created_at').eq('client_id', e.client_id).eq('ensayo', false).order('created_at', { ascending: false }).limit(MAX_FILAS_DE_RASPADO)
  if (rr.error) return falla('apify_raw', rr.error.message)
  const vg = await e.db.from('cerebro_vigilancia').select('*').eq('client_id', e.client_id).is('retirada_en', null)
  if (vg.error) return falla('cerebro_vigilancia', vg.error.message)
  const vigentes = lista(vg.data)

  const config = (cliente.config ?? {}) as { apify?: { url_reparto?: unknown } }
  const repartoUrls = Array.isArray(config.apify?.url_reparto) ? (config.apify!.url_reparto as unknown[]).filter((u): u is string => typeof u === 'string') : []
  const publicacionesPropias = codigosDePublicaciones(vigentes.filter((v) => v.fuente === 'instagram').map((v) => ({ contenido: v.contenido })))
  const obs: Observacion[] = observar(lista(rr.data) as unknown as FilaCruda[], { propios: propiosDeFicha(cliente as never), hostsDeReparto: repartoUrls.map(hostDe).filter(Boolean), publicacionesPropias })

  // ───── paso 2 · comparar
  const previaDe = (o: Observacion) => vigentes.find((v) => v.fuente === o.fuente && v.ref === o.ref)
  const oportunidades: Oportunidad[] = []
  const operaciones: Array<() => Promise<{ error: { message: string } | null }>> = []
  const cuenta = r.escrituras
  const db = e.db
  for (const o of obs) {
    const prev = previaDe(o)
    const d = decidir(prev ? { id: String(prev.id), huella: String(prev.huella), lineas: lineasDe(prev.contenido) } : null, { huella: o.huella, lineas: o.lineas })
    const vista: FuenteVista = { fuente: o.fuente, ref: o.ref, accion: d.accion, raw_id: o.raw_id }
    const fila = { client_id: e.client_id, fuente: o.fuente, ref: o.ref, huella: o.huella, contenido: o.contenido, observado_en: o.observado_en, reconfirmado_en: o.observado_en, apify_raw_id: o.raw_id, propiedad: 'propia' }
    if (d.accion === 'nuevo') {
      cuenta.vigilancia_nuevas++
      operaciones.push(async () => db.from('cerebro_vigilancia').insert(fila))
      if (o.senales && (o.fuente === 'resenas' || o.fuente === 'comentarios')) { const op = o.fuente === 'resenas' ? oportunidadDeResenas(o.senales as SenalesDeResenas, ahora) : oportunidadDeComentarios(o.senales as SenalesDeComentarios, ahora); if (op) oportunidades.push(op) }
    } else if (d.accion === 'sin_cambio') {
      // renovar solo si la observación es más nueva que lo ya reconfirmado
      const ult = String(prev!.reconfirmado_en ?? prev!.observado_en ?? '')
      if (!ult || o.observado_en > ult) { cuenta.vigilancia_renovadas++; vista.accion = 'renovada'; operaciones.push(async () => db.from('cerebro_vigilancia').update({ reconfirmado_en: o.observado_en }).eq('id', String(prev!.id))) }
    } else {
      cuenta.vigilancia_versiones++
      vista.resumen = resumirDiferencia(d.diferencia)
      operaciones.push(async () => db.from('cerebro_vigilancia').update({ retirada_en: ahora.toISOString(), motivo_retirada: 'reemplazada por una versión nueva' }).eq('id', String(prev!.id)))
      operaciones.push(async () => db.from('cerebro_vigilancia').insert({ ...fila, version_de: String(prev!.id) }))
      if (o.senales && (o.fuente === 'resenas' || o.fuente === 'comentarios')) { const op = o.fuente === 'resenas' ? oportunidadDeResenas(o.senales as SenalesDeResenas, ahora) : oportunidadDeComentarios(o.senales as SenalesDeComentarios, ahora); if (op) oportunidades.push(op) }
      else oportunidades.push(...oportunidadesDeCambios(o.fuente, d.diferencia, ahora))
    }
    r.fuentes.push(vista)
  }

  // ───── paso 3 · limpio y ordenado (solo `cerebro_fichas`; los trozos viejos no se tocan)
  let limpieza: ResultadoDeCorrida['limpieza'] = null
  if (e.limpiar_fichas !== false) {
    const fi = await e.db.from('cerebro_fichas').select('id, huella, creado_en, vigente_hasta, reconfirmado_en, retirada_en, origen, propiedad').eq('client_id', e.client_id)
    if (fi.error) return falla('cerebro_fichas', fi.error.message)
    const plan = planDeLimpieza(lista(fi.data) as unknown as FichaFila[], ahora)
    limpieza = { ...plan, aplicada: false }
    for (const d of plan.duplicados) { cuenta.fichas_retiradas++; operaciones.push(async () => db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: `duplicado de ${d.conservar_id}` }).eq('id', d.id)) }
    for (const v of plan.vencidas) { cuenta.fichas_retiradas++; operaciones.push(async () => db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: 'vencida y no reconfirmada' }).eq('id', v.id)) }
    for (const m of plan.marcar_propias) { cuenta.fichas_marcadas++; operaciones.push(async () => db.from('cerebro_fichas').update({ propiedad: 'propia' }).eq('id', m.id)) }
  }

  // ───── paso 5 · oportunidades como dato (sin repetir)
  r.oportunidades = oportunidades
  for (const op of oportunidades) {
    const ya = await e.db.from('cerebro_oportunidades').select('id').eq('client_id', e.client_id).eq('clase', op.clase).eq('fuente', op.fuente).eq('dato', op.dato).limit(1)
    if (ya.error) return falla('cerebro_oportunidades', ya.error.message)
    if (lista(ya.data)[0]) continue
    cuenta.oportunidades++
    operaciones.push(async () => db.from('cerebro_oportunidades').insert({ client_id: e.client_id, ...op, creada_en: ahora.toISOString() }))
  }

  // ───── el tope se informa (el gasto de la ampliación ya ocurrió: se declara, no se oculta)
  const amp = Math.max(0, e.gasto_ampliacion_usd ?? 0), man = Math.max(0, e.gasto_de_la_manana_usd ?? 0)
  r.gasto = { ampliacion_usd: amp, manana_usd: man, total_usd: Math.round((amp + man) * 1e6) / 1e6, tope_usd: TOPE_DIARIO_POR_CLIENTE_USD, supero_el_tope: !decidirGasto(0, amp + man).permitido }
  if (limpieza) r.limpieza = { ...limpieza, aplicada: !e.dry_run }

  if (e.dry_run) return { ...r, ok: true, estado: 'hecha' }

  // ───── escribir (sin dry_run). Un error de escritura se junta y se DICE; no se esconde.
  for (const op of operaciones) {
    const w = await op()
    if (w.error) r.errores.push(w.error.message)
  }
  const estado = r.errores.length ? 'con_errores' : 'hecha'
  const filaDelRastro = { client_id: e.client_id, dia, estado, resumen: { fuentes: r.fuentes, escrituras: cuenta, errores: r.errores }, gasto_usd: r.gasto.total_usd, workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null }
  const log = corridaDeHoy ? await e.db.from('cerebro_diario_corridas').update(filaDelRastro).eq('id', String(corridaDeHoy.id)) : await e.db.from('cerebro_diario_corridas').insert(filaDelRastro)
  if (log.error) r.errores.push(`rastro: ${log.error.message}`)
  else cuenta.corrida = 1
  return { ...r, ok: r.errores.length === 0, estado: r.errores.length ? 'con_errores' : 'hecha' }
}
