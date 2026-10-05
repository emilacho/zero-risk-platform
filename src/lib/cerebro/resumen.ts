/** Resumen de un sitio: sin los bloques estructurados y sin repetir lo repetido (una cabecera idéntica 8 veces cuenta una vez). */
import { escanearBloques } from './datos-estructurados'

export interface Resumen { resumen: string; caracteres_originales: number; caracteres_resumidos: number }

export function resumirTexto(texto: string, maximo = 600): Resumen {
  const { rangos } = escanearBloques(texto)
  let limpio = ''
  let cursor = 0
  for (const [ini, fin] of rangos) { limpio += texto.slice(cursor, ini) + '\n'; cursor = fin }
  limpio += texto.slice(cursor)
  const vistas = new Set<string>()
  const frases: string[] = []
  for (const linea of limpio.split(/\r?\n/)) {
    for (const frase of linea.trim().split(/(?<=[.!?])\s+/)) {
      const f = frase.trim().replace(/\s+/g, ' ')
      if (!f) continue
      const clave = f.toLowerCase()
      if (vistas.has(clave)) continue
      vistas.add(clave)
      frases.push(f)
    }
  }
  const resumen = frases.join(' ').slice(0, maximo).trim()
  return { resumen, caracteres_originales: texto.length, caracteres_resumidos: resumen.length }
}
