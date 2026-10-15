/**
 * PLAN v3 · V2 · EL PARSER ÚNICO DE CIFRAS (U3 del diseño). Es EL de la oficina financiera (`leerCifra`, F4/F7): el plan no tiene uno propio, así que
 * «1 234,50 dólares», «1.234,50» y «1,234.50» valen lo mismo en la entrada, en el bloque y en los chequeos. Lo que este módulo agrega es solo el sobre
 * (número ya tipado, porcentaje, moneda) — nunca otra regla de separadores.
 * Honestidad: una cifra AMBIGUA («1.500») no se adivina: devuelve `ok:false` y el dato baja a `registro_sin_campos` con ese motivo.
 */
import { leerCifra } from '../../finanzas/preguntas'

export interface Cifra { numero: number; unidad?: string; moneda?: string }
export type LecturaDeCifra = { ok: true; cifra: Cifra } | { ok: false; motivo: string }

const MONEDA_POR_SIGNO: Array<[RegExp, string]> = [[/us\$|\busd\b|d[oó]lares?/i, 'USD'], [/€|\beur\b|euros?/i, 'EUR'], [/\bcop\b|pesos? colombianos?/i, 'COP']]

/** un número ya tipado (lo que trae un campo JSON) o un texto con coma/punto, miles, %, o moneda */
export function leerNumero(x: unknown): LecturaDeCifra {
  if (typeof x === 'number') return Number.isFinite(x) ? { ok: true, cifra: { numero: x } } : { ok: false, motivo: 'número no finito' }
  if (typeof x !== 'string') return { ok: false, motivo: 'no es una cifra' }
  const t = x.trim()
  if (!t) return { ok: false, motivo: 'texto vacío' }
  const pct = /^(.*?)\s*%$/.exec(t)
  if (pct) {
    const r = leerCifra(pct[1])
    return r.ok ? { ok: true, cifra: { numero: r.cifra, unidad: '%' } } : { ok: false, motivo: r.motivo }
  }
  const moneda = MONEDA_POR_SIGNO.find(([re]) => re.test(t))?.[1]
  const r = leerCifra(t)
  return r.ok ? { ok: true, cifra: { numero: r.cifra, ...(moneda ? { moneda } : {}) } } : { ok: false, motivo: r.motivo }
}

/** ¿dos cifras son «la misma» dentro de una tolerancia? (`abs` absoluta o `rel` relativa; sin tolerancia = igualdad exacta) */
export function difiereMasDe(a: number, b: number, tol: { abs?: number; rel?: number } = {}): boolean {
  const d = Math.abs(a - b)
  if (tol.abs !== undefined) return d > tol.abs
  if (tol.rel !== undefined) return d > tol.rel * Math.max(Math.abs(a), Math.abs(b), Number.EPSILON)
  return d > 0
}
