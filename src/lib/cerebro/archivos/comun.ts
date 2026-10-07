/** Piezas comunes de los lectores: la huella, el molde de la lectura y el corte del texto de salida. Sin red, sin disco. */
import { createHash } from 'node:crypto'
import { TOPES } from './topes'
import type { EstadoDeLecturaDeArchivo, LecturaDeArchivo, TipoDeArchivo } from './tipos'

export const huellaDe = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')

export function lectura(tipo: TipoDeArchivo | null, nombre: string, buf: Buffer, estado: EstadoDeLecturaDeArchivo, extra: Partial<LecturaDeArchivo> = {}): LecturaDeArchivo {
  return { estado, tipo, nombre, huella: huellaDe(buf), bytes: buf.length, texto: '', avisos: [], ...extra }
}

/** corta el texto al tope de salida y lo dice */
export function cortarSalida(texto: string, avisos: string[]): string {
  if (texto.length <= TOPES.texto_salida_chars) return texto
  avisos.push(`El texto se cortó a ${TOPES.texto_salida_chars} caracteres; lo que sigue NO se leyó.`)
  return texto.slice(0, TOPES.texto_salida_chars)
}
