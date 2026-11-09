/**
 * 06-nov · DALE (a) de Emilio tras la corrida r4 de Náufrago (`7caa29ed`, ejecución 220399): la vuelta que se recoge del PUNTO DE CONTROL mira la fecha de ACTUALIZACIÓN.
 * Causa medida: el corredor guarda el punto de control con un upsert por (workflow_id, client_id, step_name). La fila se REESCRIBE en cada corrida, incluido
 * `workflow_execution_id`, pero `created_at` queda de la primera vez (03-nov). El redactor escribió el plan entero (45.159 caracteres, US$ 2,32) a las 23:35:23. La vuelta
 * comparaba `created_at >= ack - 10 s`, así que lo descartó tres veces y la corrida cerró «fallida» sin plan.
 * Qué cambia (y SOLO esto), en la planeación `X9F0zp6LQ2xGEYVS` y en el turno de la jefatura `o8qaF7bI0PKv2XGZ`:
 *   · la lectura trae `updated_at` y ordena por ella;
 *   · el corte «¿es de ESTE pedido?» usa `updated_at` (si faltara, `created_at`, que nunca es posterior: más estricto, nunca más laxo).
 * Lo demás queda igual: completed, no truncado, con texto, en ensayo no se recoge, y nunca se inventa un plan.
 * Idempotente: sobre un flujo ya arreglado (o construido con los constructores ya corregidos) no cambia nada.
 * No limita a ningún agente: no toca lo que proponen ni sus topes.
 */
import { nodo, cambiarCodigo } from './lib.mjs'

export const CORTE_VIEJO = 'const creado = new Date(f.created_at).getTime()'
export const CORTE_NUEVO = '// 06-nov · el punto de control se reescribe por upsert y conserva la creación de la primera vez: lo que dice si es de ESTE pedido es la actualización\nconst creado = new Date(f.updated_at || f.created_at).getTime()'
const SELECT_VIEJO = 'select=step_status,created_at,'
const SELECT_NUEVO = 'select=step_status,created_at,updated_at,'
const ORDEN_VIEJO = 'order=created_at.desc'
const ORDEN_NUEVO = 'order=updated_at.desc'

function arreglarLectura(f, nombre) {
  const p = nodo(f, nombre).parameters
  if (p.url.includes(SELECT_NUEVO) && p.url.includes(ORDEN_NUEVO)) return false
  if (!p.url.includes(SELECT_VIEJO) || !p.url.includes(ORDEN_VIEJO)) throw new Error(`«${nombre}»: la lectura no tiene la forma esperada (¿cambió el vivo?)`)
  p.url = p.url.replace(SELECT_VIEJO, SELECT_NUEVO).replace(ORDEN_VIEJO, ORDEN_NUEVO)
  return true
}

function arreglarCorte(f, nombre) {
  const c = nodo(f, nombre).parameters.jsCode
  if (c.includes('f.updated_at || f.created_at')) return false
  cambiarCodigo(f, nombre, CORTE_VIEJO, CORTE_NUEVO)
  return true
}

/** planeación `X9F0zp6LQ2xGEYVS` · devuelve cuántos nodos cambió (0 si ya estaba arreglado) */
export function construirVueltaMiraLaActualizacion(f) {
  return Number(arreglarLectura(f, 'Vuelta · leer el punto de control')) + Number(arreglarCorte(f, 'Vuelta · completar'))
}

/** turno de la jefatura `o8qaF7bI0PKv2XGZ` · devuelve cuántos nodos cambió (0 si ya estaba arreglado) */
export function construirTurnoMiraLaActualizacion(f) {
  return Number(arreglarLectura(f, '② Vuelta · leer el punto de control')) + Number(arreglarCorte(f, '② Vuelta · completar'))
}
