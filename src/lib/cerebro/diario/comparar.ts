/**
 * COMPARAR (paso 2) · lo nuevo contra lo vigente. PURO, sin modelo, US$ 0.
 *  · mismo contenido (misma huella) ⇒ SOLO se renueva `reconfirmado_en`: no hay versión nueva;
 *  · contenido distinto ⇒ versión nueva enlazada, y se dice QUÉ cambió con la línea literal de ambos lados;
 *  · lo transitorio (avisos de estado) no genera versión ni cambio;
 *  · nada se escribe sin la línea que lo respalda.
 * Clases de cambio detectadas por código: precio · horario · texto. (Producto, frase propia y queja repetida: ver `resenas.ts` y el diseño.)
 */
import { esTransitoria, TRANSITORIOS_ES } from './huella'

export type ClaseDeLinea = 'transitorio' | 'precio' | 'horario' | 'texto'
export interface LineaClasificada { linea: string; clase: ClaseDeLinea }

const RE_PRECIO = /\$\s?\d|\b(precio|costo|dolares|usd)\b|\bdesde \d/
const RE_HORARIO = /\b\d{1,2} ?(am|pm|h|hrs)\b|\b(horario|horarios|atencion|abrimos|abierto)\b|\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b.*\d/

/** clasifica una línea YA NORMALIZADA */
export function clasificarLinea(n: string, patrones: RegExp[] = TRANSITORIOS_ES): ClaseDeLinea {
  if (esTransitoria(n, patrones)) return 'transitorio'
  if (RE_PRECIO.test(n)) return 'precio'
  if (RE_HORARIO.test(n)) return 'horario'
  return 'texto'
}

export interface Diferencia { nuevas: LineaClasificada[]; quitadas: LineaClasificada[] }
/** líneas que aparecen / desaparecen entre dos juegos de líneas normalizadas (conjuntos, sin orden) */
export function compararLineas(antes: string[], despues: string[], patrones: RegExp[] = TRANSITORIOS_ES): Diferencia {
  const a = new Set(antes), d = new Set(despues)
  const cl = (l: string): LineaClasificada => ({ linea: l, clase: clasificarLinea(l, patrones) })
  return { nuevas: [...d].filter((l) => !a.has(l)).map(cl), quitadas: [...a].filter((l) => !d.has(l)).map(cl) }
}

export interface Previa { id: string; huella: string; lineas: string[] }
export interface Nueva { huella: string; lineas: string[] }
export type Decision =
  | { accion: 'nuevo' }
  | { accion: 'sin_cambio' }
  | { accion: 'version_nueva'; previa_id: string; diferencia: Diferencia }

export function decidir(previa: Previa | null, nueva: Nueva, patrones: RegExp[] = TRANSITORIOS_ES): Decision {
  if (!previa) return { accion: 'nuevo' }
  if (previa.huella === nueva.huella) return { accion: 'sin_cambio' }
  return { accion: 'version_nueva', previa_id: previa.id, diferencia: compararLineas(previa.lineas, nueva.lineas, patrones) }
}

/** resumen de una diferencia para el informe: lo transitorio se cuenta aparte y NUNCA es un cambio */
export function resumirDiferencia(d: Diferencia): { transitorias: { nuevas: number; quitadas: number }; cambio_real: { nuevas: number; quitadas: number }; por_clase: Record<'precio' | 'horario' | 'texto', number> } {
  const real = (xs: LineaClasificada[]) => xs.filter((x) => x.clase !== 'transitorio')
  const por: Record<'precio' | 'horario' | 'texto', number> = { precio: 0, horario: 0, texto: 0 }
  for (const x of [...real(d.nuevas), ...real(d.quitadas)]) por[x.clase as 'precio' | 'horario' | 'texto']++
  return {
    transitorias: { nuevas: d.nuevas.length - real(d.nuevas).length, quitadas: d.quitadas.length - real(d.quitadas).length },
    cambio_real: { nuevas: real(d.nuevas).length, quitadas: real(d.quitadas).length },
    por_clase: por,
  }
}
