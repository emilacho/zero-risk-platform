/**
 * M2 · LO COMÚN DE LAS RUTAS `/api/manual/*` (la lógica vive aquí para probarla con una base falsa; los archivos de ruta son finos).
 *
 * Guardas (en este orden, todas ANTES de leer o escribir nada):
 *   1. llave interna (`x-api-key`) → 401;  2. las rutas que mueven el ciclo (`revisar`, `opinion`, `borrador`) exigen además la llave de despacho (`x-sala-dispatch-key`) → 503 si no está configurada, 401 si no coincide;
 *   3. `dry_run` OBLIGATORIO y booleano → 400 (lección: «el alta no tiene modo seco»);  4. con `dry_run: false`, `workflow_id` y `workflow_execution_id` obligatorios → 403 (canon §150: agentes solo vía workflows).
 * Las rutas puras (`materia`, `hechos`, `recomprobar`) no llaman a ningún modelo y no escriben nada; exigen solo la llave interna.
 */
import { checkInternalKey } from '../internal-auth'
import { checkLlaveDeLaSala } from '../oficina/ruta'
import { llamarRevisorGpt } from '../revisor-gpt'
import { guardarBorrador, type OpinionDeGpt } from './borrador'
import { armarPedidoDelManual } from './pedido-gpt'
import { ordenarMateria } from './materia'
import { cerrarRevision, leerInsumos, prepararRevision, type Db, type Insumos } from './revision'
import { renderManualLimpio } from '../brand-book-render-limpio'

export interface Respuesta { status: number; body: Record<string, unknown> }
export interface EntornoDeRutas {
  openaiKey?: string
  modelo?: string
  precioEntrada?: number
  precioSalida?: number
  f?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  /** tope por llamada al revisor externo, en US$ (alcanza para ≈ 60.000 tokens de material) */
  topePorLlamadaUsd?: number
}
export const TOPE_POR_LLAMADA_AL_REVISOR_USD = 0.25
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

/** las guardas 1 y 2 */
export function autorizar(request: Request, conLlaveDeDespacho: boolean): Respuesta | null {
  const k = checkInternalKey(request)
  if (!k.ok) return err(401, 'unauthorized', k.reason)
  if (conLlaveDeDespacho) {
    const d = checkLlaveDeLaSala(request)
    if (!d.ok) return err(d.status, d.error, d.detalle)
  }
  return null
}

/** las guardas 3 y 4 + el cliente */
export function validarCuerpo(cuerpo: unknown, o: { exigeDryRun: boolean }): Respuesta | { cuerpo: Record<string, unknown>; client_id: string; dry_run: boolean; workflow_id: string; workflow_execution_id: string } {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  let dry_run = true
  if (o.exigeDryRun) {
    if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
    dry_run = cuerpo.dry_run
  }
  const wf = typeof cuerpo.workflow_id === 'string' ? cuerpo.workflow_id.trim() : ''
  const ex = typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id.trim() : ''
  if (o.exigeDryRun && !dry_run && (!wf || !ex)) return err(403, 'workflow_requerido', 'con dry_run=false hacen falta `workflow_id` y `workflow_execution_id`: la revisión solo corre desde un flujo')
  return { cuerpo, client_id: cuerpo.client_id, dry_run, workflow_id: wf, workflow_execution_id: ex }
}

async function insumosOError(db: Db, clientId: string, opciones: { sinManualPrevio?: boolean } = {}): Promise<Insumos | Respuesta> {
  const r = await leerInsumos(db, clientId, opciones)
  return r.ok ? r.insumos : err(r.status, r.error, r.detalle)
}
const esRespuesta = (x: unknown): x is Respuesta => esObjeto(x) && typeof (x as { status?: unknown }).status === 'number' && esObjeto((x as { body?: unknown }).body)
const manualDe = (cuerpo: Record<string, unknown>, ins: Insumos, campo: string): Record<string, unknown> | Respuesta => {
  if (cuerpo[campo] === undefined) return ins.manual
  return esObjeto(cuerpo[campo]) ? (cuerpo[campo] as Record<string, unknown>) : err(400, 'entrada_invalida', `\`${campo}\` debe ser un objeto (el manual)`)
}

// ───────────────────────── ruta pura (US$ 0, sin escribir)
// `/api/manual/materia` y `/api/manual/hechos` NO viven aquí: ya existen en `main` (CC#1, #480) y el alta las llama; esta revisión no las duplica ni las cambia.
export async function rutaRecomprobar(db: Db, cuerpo: unknown): Promise<Respuesta> {
  const v = validarCuerpo(cuerpo, { exigeDryRun: false }); if (esRespuesta(v)) return v
  // r62 · dos opciones del alta, apagadas por omisión: `sin_manual_previo` (el manual aún no se guardó) y `sin_eslogan` (no escribir el eslogan por código)
  const sinManualPrevio = v.cuerpo.sin_manual_previo === true
  if (sinManualPrevio && v.cuerpo.despues === undefined) return err(400, 'entrada_invalida', '`sin_manual_previo` exige `despues`')
  const ins = await insumosOError(db, v.client_id, { sinManualPrevio }); if (esRespuesta(ins)) return ins
  const despues = manualDe(v.cuerpo, ins, 'despues'); if (esRespuesta(despues)) return despues
  if (v.cuerpo.despues === undefined) return err(400, 'entrada_invalida', 'falta `despues` (el manual que devolvió el autor)')
  const r = cerrarRevision(ins, despues, { sinEslogan: v.cuerpo.sin_eslogan === true })
  // `retirados` es el REGISTRO INTERNO: lo recibe el flujo para guardarlo en el borrador; no es para ninguna bandeja ni canal
  return { status: 200, body: { manual: r.manual, limpio: r.limpio, introducidos: r.introducidos.map((h) => ({ ruta: h.ruta, clausula: h.clausula, estado: h.estado })), cambios: r.cambios, retirados: r.retirados, eslogan: r.eslogan } }
}

// ───────────────────────── la puerta del ciclo
/** S0/S1/S3 sobre lo ya raspado + la evidencia FILTRADA para el juez de fidelidad. Nunca llama a un modelo ni escribe, con o sin `dry_run`. */
export async function rutaRevisar(db: Db, cuerpo: unknown): Promise<Respuesta> {
  const v = validarCuerpo(cuerpo, { exigeDryRun: true }); if (esRespuesta(v)) return v
  const ins = await insumosOError(db, v.client_id); if (esRespuesta(ins)) return ins
  const p = prepararRevision(ins)
  return { status: 200, body: { dry_run: v.dry_run, ...p, modelos_llamados: 0 } }
}

/** S6 · la opinión de GPT ciego. Con `dry_run: true` arma el pedido y NO llama (0 llamadas, US$ 0); con false llama con los 3 reintentos del módulo común. */
export async function rutaOpinion(db: Db, cuerpo: unknown, env: EntornoDeRutas): Promise<Respuesta> {
  const v = validarCuerpo(cuerpo, { exigeDryRun: true }); if (esRespuesta(v)) return v
  const ins = await insumosOError(db, v.client_id); if (esRespuesta(ins)) return ins
  const manual = manualDe(v.cuerpo, ins, 'manual'); if (esRespuesta(manual)) return manual
  const limpio = renderManualLimpio({ brand_book: manual, client_name: ins.client_name }).texto
  const pedido = armarPedidoDelManual({ manualEnLimpio: limpio, materia: ordenarMateria(ins.fuentes) })
  if (v.dry_run) return { status: 200, body: { dry_run: true, simulado: true, llamadas: 0, costo_usd: 0, caracteres_del_pedido: pedido.texto.length } }
  const r = await llamarRevisorGpt({ f: env.f ?? fetch, apiKey: env.openaiKey, modelo: env.modelo, precioEntrada: env.precioEntrada, precioSalida: env.precioSalida, texto: pedido.texto, imagenes_urls: pedido.imagenes, esperar: env.esperar })
  const tope = env.topePorLlamadaUsd ?? TOPE_POR_LLAMADA_AL_REVISOR_USD
  const costo = r.costo_usd ?? 0
  // el texto es una OPINIÓN: se rotula como tal; el tope se informa (el gasto ya ocurrió: se declara, no se oculta)
  return { status: 200, body: { dry_run: false, ok: r.ok, ...(r.ok ? { opinion: r.texto, modelo: r.modelo } : { error: r.error, sin_segunda_mirada: true }), costo_usd: costo, supero_el_tope: costo > tope, intentos: r.intentos ?? [] } }
}

/** S8 · el borrador y la tarjeta. `dry_run: true` devuelve la tarjeta sin escribir. */
export async function rutaBorrador(db: Db, cuerpo: unknown): Promise<Respuesta> {
  const v = validarCuerpo(cuerpo, { exigeDryRun: true }); if (esRespuesta(v)) return v
  const ins = await insumosOError(db, v.client_id); if (esRespuesta(ins)) return ins
  const despues = manualDe(v.cuerpo, ins, 'manual'); if (esRespuesta(despues)) return despues
  if (v.cuerpo.manual === undefined) return err(400, 'entrada_invalida', 'falta `manual` (el que devolvió el ciclo)')
  const cierre = cerrarRevision(ins, despues)
  const op = esObjeto(v.cuerpo.opinion) ? (v.cuerpo.opinion as unknown as OpinionDeGpt) : null
  const costo = typeof v.cuerpo.costo_usd === 'number' && Number.isFinite(v.cuerpo.costo_usd) ? v.cuerpo.costo_usd : 0
  const respuesta = Array.isArray(v.cuerpo.respuesta_del_autor) ? (v.cuerpo.respuesta_del_autor as never) : null
  const fid = esObjeto(v.cuerpo.fidelidad) ? (v.cuerpo.fidelidad as never) : null
  const r = await guardarBorrador(db, { insumos: ins, cierre, opinion: op, fidelidad: fid, respuesta_del_autor: respuesta, costo_usd: costo, workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id, dry_run: v.dry_run })
  return { status: r.ok ? 200 : 502, body: { ...r, retirados_en_el_registro_interno: cierre.retirados.length } }
}
