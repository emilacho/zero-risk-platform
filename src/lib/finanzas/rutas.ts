/**
 * Las puertas del módulo financiero (ronda 79). Ninguna llama a un modelo: el FLUJO de n8n invoca al agente financiero entre `preparar` y `aplicar` (los agentes solo se invocan por flujos).
 *  · preparar → lo que el negocio ya dio (datos), lo que falta y el pedido al agente
 *  · aplicar  → lee lo que contestó el agente, valida cada supuesto, CALCULA y (si no es ensayo) guarda el bloque financiero
 *  · bloque   → el último bloque guardado de un cliente (lo lee la planeación antes de escribir el plan)
 */
import { monedaDelCliente } from '../moneda/por-pais'
import type { Db } from '../manual/revision'
import { bloqueFinanciero, cifrasObligatorias, type SalidaFinanciera } from './calculadora'
import { AGENTE_FINANCIERO, armarPedidoFinanciero, calcularDelNegocio, datosDelNegocio, leerSupuestos, type DatosDelNegocio } from './supuestos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Resp = { status: number; body: Record<string, unknown> }
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)
export const TIPO_DE_BLOQUE = 'bloque_financiero'

async function leerDatos(db: Db, clientId: string): Promise<{ ok: true; datos: DatosDelNegocio } | { ok: false; status: number; error: string; detail: string }> {
  const c = await db.from('clients').select('id, name, industry, country, market, config').eq('id', clientId).limit(1)
  if (c.error) return { ok: false, status: 502, error: 'lectura_fallida', detail: 'clients: ' + String(c.error.message ?? c.error) }
  const ficha = (Array.isArray(c.data) ? c.data[0] : null) as Record<string, unknown> | null
  if (!ficha) return { ok: false, status: 404, error: 'cliente_inexistente', detail: 'no existe la ficha del cliente' }
  const r = await db.from('apify_raw').select('id, apify_function, respuesta, ensayo').eq('client_id', clientId).eq('ensayo', false).order('created_at', { ascending: false }).limit(300)
  if (r.error) return { ok: false, status: 502, error: 'lectura_fallida', detail: 'apify_raw: ' + String(r.error.message ?? r.error) }
  const filas = (Array.isArray(r.data) ? r.data : []) as Array<{ apify_function: string; respuesta: unknown; ensayo: boolean | null }>
  return { ok: true, datos: datosDelNegocio({ ficha, moneda: monedaDelCliente(ficha as { country?: unknown; config?: unknown }), filas }) }
}

export async function rutaPrepararFinanzas(db: Db, cuerpo: unknown): Promise<Resp> {
  const c = obj(cuerpo)
  if (!c || typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return { status: 400, body: { error: 'invalid_client_id', detail: 'client_id debe ser un uuid' } }
  const r = await leerDatos(db, c.client_id)
  if (!r.ok) return { status: r.status, body: { error: r.error, detail: r.detail } }
  const p = armarPedidoFinanciero(r.datos)
  return { status: 200, body: { ok: true, client_id: c.client_id, moneda: r.datos.moneda, moneda_fuente: r.datos.moneda_fuente, fijos: r.datos.fijos, faltantes: p.campos, sin_moneda: !r.datos.moneda, pedido: p.campos.length ? { agente: AGENTE_FINANCIERO, campos: p.campos, task: p.task } : null } }
}

export async function rutaAplicarFinanzas(db: Db, cuerpo: unknown): Promise<Resp> {
  const c = obj(cuerpo)
  if (!c || typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return { status: 400, body: { error: 'invalid_client_id', detail: 'client_id debe ser un uuid' } }
  if (typeof c.dry_run !== 'boolean') return { status: 400, body: { error: 'dry_run_obligatorio', detail: 'dry_run debe ser true o false' } }
  const r = await leerDatos(db, c.client_id)
  if (!r.ok) return { status: r.status, body: { error: r.error, detail: r.detail } }
  if (!r.datos.moneda) return { status: 200, body: { ok: true, aplicado: false, motivo: 'no se sabe la moneda del negocio (ni declarada ni por su país): no se calcula', rechazados: [] } }
  const p = armarPedidoFinanciero(r.datos)
  const lectura = p.campos.length ? leerSupuestos(c.response, p.campos) : { ok: true, supuestos: {}, rechazados: [], notas: null as string | null }
  const calc = calcularDelNegocio(r.datos, lectura.supuestos)
  if (!calc.ok) return { status: 200, body: { ok: true, aplicado: false, motivo: 'faltan o no son razonables entradas de la calculadora: no se guarda nada', faltan: calc.faltan, rechazados: lectura.rechazados } }
  const salida: SalidaFinanciera = calc
  const bloque_texto = bloqueFinanciero(salida).join('\n')
  const cifras = cifrasObligatorias(salida)
  const resumen = { ok: true, aplicado: !c.dry_run, dry_run: c.dry_run, moneda: salida.moneda, supuestos_puestos_por_el_agente: Object.keys(lectura.supuestos), rechazados: lectura.rechazados, notas_del_agente: lectura.notas, cifras }
  if (c.dry_run) return { status: 200, body: { ...resumen, salida, bloque_texto } }
  const fila = {
    client_id: c.client_id, title: `Bloque financiero · ${new Date().toISOString().slice(0, 10)}`, output_type: TIPO_DE_BLOQUE, producing_agent: AGENTE_FINANCIERO, status: 'approved',
    content: { salida, cifras, rechazados: lectura.rechazados, notas_del_agente: lectura.notas }, content_text: bloque_texto,
    provenance_tag: { type: 'evidence', trust_level: 'system_trusted', fuente: 'modulo_financiero', supuestos_del_agente: Object.keys(lectura.supuestos) },
  }
  const w = await db.from('client_historical_outputs').insert(fila).select('id')
  if (w.error) return { status: 502, body: { error: 'no_se_guardo', detail: String(w.error.message ?? w.error), ...resumen, aplicado: false } }
  return { status: 200, body: { ...resumen, bloque_id: Array.isArray(w.data) ? (w.data[0] as Record<string, unknown> | undefined)?.id ?? null : null, salida, bloque_texto } }
}

export async function rutaBloqueFinanciero(db: Db, cuerpo: unknown): Promise<Resp> {
  const c = obj(cuerpo)
  if (!c || typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return { status: 400, body: { error: 'invalid_client_id', detail: 'client_id debe ser un uuid' } }
  const r = await db.from('client_historical_outputs').select('id, content, content_text, created_at').eq('client_id', c.client_id).eq('output_type', TIPO_DE_BLOQUE).order('created_at', { ascending: false }).limit(1)
  // un fallo de lectura NO es «no hay bloque»: se devuelve el error
  if (r.error) return { status: 502, body: { ok: false, error: 'lectura_fallida', detail: String(r.error.message ?? r.error) } }
  const fila = (Array.isArray(r.data) ? r.data[0] : null) as Record<string, unknown> | null
  if (!fila) return { status: 200, body: { ok: true, bloque: null } }
  const contenido = obj(typeof fila.content === 'string' ? safeJson(fila.content) : fila.content)
  const salida = obj(contenido?.salida)
  if (!salida || !Array.isArray(contenido?.cifras)) return { status: 200, body: { ok: false, error: 'bloque_ilegible', detail: 'el último bloque guardado no se puede leer' } }
  const dias = Math.max(0, Math.floor((Date.now() - Date.parse(String(fila.created_at))) / 86400000))
  return { status: 200, body: { ok: true, bloque: { id: fila.id, creado_en: fila.created_at, dias, moneda: salida.moneda, texto: String(fila.content_text ?? ''), cifras: contenido!.cifras } } }
}
const safeJson = (s: string): unknown => { try { return JSON.parse(s) } catch { return null } }
