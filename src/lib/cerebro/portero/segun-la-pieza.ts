/**
 * EL CEREBRO ENTREGA SEGÚN LA PIEZA (encargo 9 · 18-nov · firma de Emilio vía Lenovo 16:53 Zúrich).
 * Contrato acordado con CC2 al pie de `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md` (16:05–16:06Z, y la nota de 16:5xZ):
 *  · índice: `base_de_la_pieza` (lo fijo + todo lo de la sede de la pieza, completo); cada línea con `sede`, `de_la_pieza` y, si es de OTRA
 *    sede, `marca: "otra oferta: <sede>"`; las de la pieza primero; los NÚMEROS no cambian (son los de la lista completa); `consulta_id`;
 *  · entrega: por número con la `huella`, el original completo, y `no_consta` por número (no existe, retirado o lista vieja); `consulta_id`;
 *  · rastro en `cerebro_consultas` (agente, pieza, turno, fichas entregadas, números que no constan).
 * Comparar la sede de la ficha con la de la pieza es exacto (campo contra campo), sin modelo.
 */
import type { Ficha } from '../tipos'
import { lineaParaElModelo, type LineaNumerada } from './lista-numerada'

export const AVISO_SIN_SEDE = 'la pieza no dijo su sede: todo va como de la pieza'

export interface Pieza {
  sede: string | null
  oferta: string | null
  canal: string | null
  tema: string | null
  encargo_id: string
  fila: string | null
  turno: string | null
  agente: string
  para_que: string | null
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** cómo se comparan dos sedes: minúsculas, sin tildes y sin espacios de más (exacto, no parecido) */
export const normal = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** ¿el pedido viene de una pieza? (trae `pieza`). Sin `pieza`, las rutas responden como antes */
export const vieneConPieza = (cuerpo: Record<string, unknown>): boolean => cuerpo.pieza !== undefined

export function leerPieza(cuerpo: Record<string, unknown>): { ok: true; pieza: Pieza } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const p = cuerpo.pieza
  if (!esObjeto(p)) return { ok: false, errores: ['`pieza` debe ser un objeto { encargo_id, fila }'] }
  const encargo = txt(p.encargo_id)
  if (!encargo) errores.push('falta `pieza.encargo_id`')
  if (p.fila !== undefined && p.fila !== null && typeof p.fila !== 'string') errores.push('`pieza.fila` debe ser texto')
  const agente = txt(cuerpo.agente)
  if (!agente) errores.push('falta `agente` (quién pide: va al rastro)')
  for (const k of ['sede', 'oferta', 'canal', 'tema', 'turno', 'para_que'] as const) {
    if (cuerpo[k] !== undefined && cuerpo[k] !== null && typeof cuerpo[k] !== 'string') errores.push(`\`${k}\` debe ser texto`)
  }
  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    pieza: {
      sede: txt(cuerpo.sede), oferta: txt(cuerpo.oferta), canal: txt(cuerpo.canal), tema: txt(cuerpo.tema),
      encargo_id: encargo as string, fila: txt(p.fila), turno: txt(cuerpo.turno), agente: agente as string, para_que: txt(cuerpo.para_que),
    },
  }
}

/** de quién es una línea para la pieza: misma sede → de la pieza; otra sede → marcada; sin sede → no es de la pieza y no se marca. Sin sede en la pieza: todo es de la pieza */
export function deLaPieza(f: Ficha, sedeDeLaPieza: string | null): { de_la_pieza: boolean; marca: string | null } {
  if (!sedeDeLaPieza) return { de_la_pieza: true, marca: null }
  const s = txt(f.sede)
  if (!s) return { de_la_pieza: false, marca: null }
  return normal(s) === normal(sedeDeLaPieza) ? { de_la_pieza: true, marca: null } : { de_la_pieza: false, marca: `otra oferta: ${s}` }
}

export interface LineaDeLaPieza extends LineaNumerada { de_la_pieza: boolean; marca: string | null }

/** las de la pieza primero, el resto después, cada parte en el orden de la lista; los números NO cambian */
export function ordenarParaLaPieza(lineas: LineaNumerada[], sedeDeLaPieza: string | null): LineaDeLaPieza[] {
  const con = lineas.map((l) => ({ ...l, ...deLaPieza(l.ficha, sedeDeLaPieza) }))
  return [...con.filter((l) => l.de_la_pieza), ...con.filter((l) => !l.de_la_pieza)]
}

/** la línea del índice para el empleado: la de siempre y, si es de otra sede, la marca al final */
export const lineaDeLaPieza = (l: LineaDeLaPieza): string => `${lineaParaElModelo(l.numero, l.ficha)}${l.marca ? ` · ${l.marca.toUpperCase()}` : ''}`

/** la fila del rastro en `cerebro_consultas` (columnas de hoy + las de la migración 202611181800) */
export function filaDeRastro(o: { cliente: string; pieza: Pieza; ruta: 'indice' | 'entregar'; entregadas: string[]; noConstan: unknown[]; ms: number }): Record<string, unknown> {
  return {
    client_id: o.cliente, oficina: 'mesa', agente: o.pieza.agente, que: o.pieza.tema ?? o.pieza.para_que, atributo: null, sede_clave: o.pieza.sede,
    resultados: o.entregadas.length, sin_dato: o.entregadas.length === 0, ms: Math.max(0, Math.round(o.ms)),
    ruta: o.ruta, encargo_id: o.pieza.encargo_id, fila: o.pieza.fila, turno: o.pieza.turno, oferta: o.pieza.oferta, canal: o.pieza.canal,
    fichas_entregadas: o.entregadas, numeros_no_consta: o.noConstan,
  }
}

export type Registrar = (fila: Record<string, unknown>) => Promise<{ id?: string | null; error?: string | null }>
/** escribe el rastro y nunca rompe la respuesta: si falla, la respuesta lo DICE (`rastro.registrado: false` + el error) */
export async function dejarRastro(registrar: Registrar | undefined, fila: Record<string, unknown>): Promise<{ registrado: boolean; consulta_id: string | null; error?: string }> {
  if (!registrar) return { registrado: false, consulta_id: null, error: 'la ruta no recibió dónde escribir el rastro' }
  try {
    const r = await registrar(fila)
    return r.error ? { registrado: false, consulta_id: null, error: r.error } : { registrado: true, consulta_id: r.id ?? null }
  } catch (e) { return { registrado: false, consulta_id: null, error: e instanceof Error ? e.message : String(e) } }
}
