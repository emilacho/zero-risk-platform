/**
 * R5 · EL LUGAR DE LA EMPRESA NO ES EL ORIGEN DEL PRODUCTO. PURO.
 * Una frase que afirma ORIGEN con un nombre de lugar solo se sostiene si una fuente primaria dice ese lugar con papel `origen_producto`.
 * El papel lo clasifican patrones DATO (por idioma) sobre la oración de la fuente. Conservador: ante la duda, `sin_papel` (que no sostiene nada).
 */
import { esPrimaria, type Fuente } from './procedencia'
import { contieneLiteral, normalizar, partirEnFrases } from './texto'

export type PapelDeLugar = 'origen_producto' | 'sede' | 'reparto' | 'mercado' | 'sin_papel'

/** la frase del MANUAL pide que algo venga de un lugar (patrones dato) */
export const PATRONES_DE_ORIGEN_ES: RegExp[] = [
  /\b(viene|vienen|proviene|provienen|procede|proceden|llega|llegan|traido|traida|traidos|traidas|directo|directa|directos|directas)\s+(de|desde)\b/,
  /\borige(n|nes)\b/,
  /\bde nuestros (productores|proveedores)\b/,
]
export const frasePideOrigen = (frase: string): boolean => PATRONES_DE_ORIGEN_ES.some((r) => r.test(normalizar(frase)))

/** papeles de un lugar en la oración de una FUENTE (orden = precedencia) */
const PAPELES: Array<[Exclude<PapelDeLugar, 'sin_papel'>, RegExp]> = [
  ['origen_producto', /\b(traemos|traen|proveedor|proveedores|compramos|proviene|provienen|procede|proceden|llega de|llegan de|llega desde|llegan desde|de nuestros (productores|proveedores))\b/],
  ['reparto', /\b(entregamos|delivery|reparto|repartimos|envios?|llevamos a)\b/],
  ['mercado', /\b(clientes|turistas|visitantes|publico|mercado)\s+(de|en)\b/],
  ['sede', /\b(local|sucursal|tienda|oficinas?|ubicad[oa]s?|estamos|visitanos|encuentranos|direccion|sede)\b/],
]

/** nombres propios de lugar en una frase del manual: secuencias con mayúscula que no abren la frase (heurística; lo no capturado simplemente no se chequea como lugar) */
export function lugaresMencionados(frase: string): string[] {
  const out: string[] = []
  const re = /(?<![\p{L}])\p{Lu}[\p{L}]{2,}(?:\s+\p{Lu}[\p{L}]{2,})*/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(frase))) {
    if (m.index === 0 || /^[\s¿¡«"“(]*$/.test(frase.slice(0, m.index))) continue // la primera palabra de la frase no cuenta
    out.push(m[0])
  }
  return [...new Set(out)]
}

/** el papel que tiene `lugar` en esa oración de fuente; null si la oración no lo menciona */
export function papelDelLugar(oracion: string, lugar: string): PapelDeLugar | null {
  if (!contieneLiteral(oracion, lugar)) return null
  const n = normalizar(oracion)
  for (const [papel, re] of PAPELES) if (re.test(n)) return papel
  if (/📍/.test(oracion)) return 'sede'
  return 'sin_papel'
}

export interface RespaldoDeOrigen { papel: PapelDeLugar; lugar: string; oracion: string; fuente: Fuente }
const FUERZA: Record<PapelDeLugar, number> = { origen_producto: 4, reparto: 3, mercado: 2, sede: 1, sin_papel: 0 }

/** el mejor papel con el que las fuentes (de un tipo) mencionan alguno de los lugares */
export function respaldoDeOrigen(lugares: string[], fuentes: Fuente[], soloPrimarias = true): RespaldoDeOrigen | null {
  let mejor: RespaldoDeOrigen | null = null
  for (const f of fuentes) {
    if (soloPrimarias && !esPrimaria(f)) continue
    for (const o of partirEnFrases(f.texto)) {
      for (const l of lugares) {
        const papel = papelDelLugar(o, l)
        if (papel && (!mejor || FUERZA[papel] > FUERZA[mejor.papel])) mejor = { papel, lugar: l, oracion: o, fuente: f }
      }
    }
  }
  return mejor
}
