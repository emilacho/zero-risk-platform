/**
 * LA FIRMA ES UN ACTO DE CÓDIGO (F2 · diseño v2 §3 y §6b.4): una huella estable del bloque y la decisión «firmado / sin_firma».
 * Ningún agente firma por identidad: el `chief-financial-officer` emite la SALIDA (sale / sale ajustada / sale con alerta); el código sella.
 */
import crypto from 'node:crypto'
import type { Bloque } from './tipos'

/** JSON canónico: claves ordenadas, sin `undefined`; mismo valor ⇒ misma huella */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v)
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonico(o[k])).join(',') + '}'
}
export const huellaDe = (v: unknown): string => crypto.createHash('sha256').update(canonico(v)).digest('hex')

export type SalidaDelJefe = 'sale' | 'sale_ajustada' | 'sale_con_alerta'
export interface Hallazgo { severidad: 'critico' | 'alto' | 'medio' | 'bajo'; que: string }

/** firmado = sin hallazgos críticos; con críticos tras la ÚNICA corrección permitida → sin_firma (el plan sigue) */
export function decidirFirma(h: { hallazgos: Hallazgo[]; correcciones_hechas: number }): { estado: 'firmado' | 'sin_firma' | 'requiere_correccion'; criticos: number } {
  const criticos = h.hallazgos.filter((x) => x.severidad === 'critico').length
  if (criticos === 0) return { estado: 'firmado', criticos }
  if (h.correcciones_hechas < 1) return { estado: 'requiere_correccion', criticos }
  return { estado: 'sin_firma', criticos }
}

export interface FilaDeNumero {
  clave: string; valor: number | null; minimo: number | null; maximo: number | null
  unidad: string | null; tipo: 'dato' | 'supuesto' | 'sin_base'; fuente: string; fecha: string | null; formula: string | null; motivo: string | null
}
/** una fila por cifra: la TRAZA de cada número del plan (`finanzas_numeros`). Nunca una celda vacía: sin valor solo si es sin_base con motivo. */
export function numerosDelBloque(b: Bloque): FilaDeNumero[] {
  return Object.entries(b.cifras).map(([clave, c]) => ({
    clave, valor: c.valor, minimo: c.min ?? null, maximo: c.max ?? null, unidad: null, tipo: c.tipo, fuente: c.fuente,
    fecha: c.fecha ?? null, formula: c.formula ?? null, motivo: c.valor == null ? (c.motivo ?? 'sin base') : (c.motivo ?? null),
  }))
}
