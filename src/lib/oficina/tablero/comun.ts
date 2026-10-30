/**
 * LAS ACCIONES DEL TABLERO (30-oct · contrato CC1→CC2): Emilio maneja el sistema desde el dashboard; cada botón llega a `POST /api/tablero/{accion}` con la llave interna.
 * Reglas comunes: cuerpo validado, el reviewer es quien firma, todo intento (salga bien o mal) deja su fila en `eventos_de_emilio` (accion `tablero`), y ninguna acción que gasta corre sin
 * `confirmo_gasto: true` y un `tope_usd` que el sistema respeta (nunca más que el de la plantilla). Una acción que no existe todavía responde 404 y el tablero dice «todavía no está disponible».
 */
import crypto from 'node:crypto'
import type { Puertos } from '../puertos'

export type Db = { from(tabla: string): any }
export type Fila = Record<string, unknown>
export const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Contexto { db: Db; puertos: () => Puertos; ahora: () => Date }
export interface Entrada { cuerpo: Fila; reviewer: string }
export interface Salida {
  status: number
  cuerpo: Fila
  /** a qué cliente / pieza / encargo toca (para el rastro) */
  toca?: { client_id?: string | null; hitl_id?: string | null; encargo_id?: string | null; comentario?: string | null }
  /** el primer turno de un agente: la ruta despierta al flujo de la oficina */
  despertar?: { encargo_id: string; turno: Fila }
}
export type Manejador = (c: Contexto, e: Entrada) => Promise<Salida>

export const rechazo = (status: number, error: string, detalle: string, toca?: Salida['toca']): Salida => ({ status, cuerpo: { ok: false, error, detalle }, ...(toca ? { toca } : {}) })

/** texto con largo entre min y max (recortado de espacios) o null */
export const textoEntre = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null)

/** la confirmación del gasto: sin ella nada se gasta; el tope pedido nunca pasa de `maximo` */
export function confirmarGasto(cuerpo: Fila, maximo: number): { ok: true; tope: number } | { ok: false; salida: Salida } {
  if (cuerpo.confirmo_gasto !== true) return { ok: false, salida: rechazo(400, 'falta_confirmar_el_gasto', 'esta acción gasta dinero: el tablero debe mostrar el tope y mandar `confirmo_gasto: true`') }
  const t = cuerpo.tope_usd
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return { ok: false, salida: rechazo(400, 'falta_el_tope', 'manda `tope_usd` (el que se le mostró a Emilio)') }
  if (t > maximo) return { ok: false, salida: rechazo(400, 'tope_demasiado_alto', `el tope máximo de esta acción es US$ ${maximo}`) }
  return { ok: true, tope: t }
}

// ───────────────────────── el rastro (nunca lanza)
export interface Rastro { accion: string; autor: string; toca?: Salida['toca']; resultado: Fila; crudo: Fila; ahora: Date }
export async function rastroDelTablero(db: Db, r: Rastro): Promise<void> {
  try {
    const huella = crypto.createHash('sha256').update(JSON.stringify([r.autor, r.crudo])).digest('hex').slice(0, 24)
    await db.from('eventos_de_emilio').insert({
      canal: 'dashboard', accion: 'tablero', autor: r.autor, client_id: r.toca?.client_id ?? null, hitl_id: r.toca?.hitl_id ?? null, encargo_id: r.toca?.encargo_id ?? null,
      comentario: r.toca?.comentario ?? null, decision: r.accion, resultado: r.resultado, crudo: r.crudo,
      clave_unica: `dashboard:tablero:${r.accion}:${huella}:${r.ahora.toISOString().slice(0, 16)}`,
    })
  } catch { /* el rastro nunca frena la acción */ }
}

/** el cuerpo sin llaves ni secretos, para el rastro */
export const cuerpoSeguro = (c: Fila): Fila => Object.fromEntries(Object.entries(c).filter(([k]) => !/key|token|secret|llave|password/i.test(k)))
