/**
 * 11-nov · GO Lenovo 03:55Z · regla #17 del barrido · LA PROPORCIÓN DEL CUADRO SALE DE UNA SOLA FUENTE.
 * El dato vive en `cadena_formatos_por_red.proporcion` (por red y formato). Lo escribe la hoja en LÍMITES del brief; la oficina lo lee del brief
 * y lo manda en el pedido al brazo de video. Este archivo es el ÚNICO respaldo cuando la columna está vacía (la hoja y el brazo usan el mismo).
 * Puro: sin red ni base.
 */
import type { FormatosPorRed } from './tipos'

/** proporción por omisión según el formato (se declara en LÍMITES como «por omisión del formato») */
export const PROPORCION_POR_FORMATO: Readonly<Record<string, string>> = { imagen: '4:5', carrusel: '4:5', historia: '9:16', estado: '9:16', reel: '9:16', video: '9:16', short: '9:16', tiktok: '9:16', kit: '9:16' }
/** la de un formato que no está en la lista */
export const PROPORCION_POR_OMISION = '1:1'
/** forma válida de una proporción guardada (la base la acota con su CHECK) */
export const RE_PROPORCION = /^\d{1,2}:\d{1,2}$/

/** la proporción por omisión del formato (respaldo) */
export function proporcionDe(formato: string, proporciones: Readonly<Record<string, string>> = PROPORCION_POR_FORMATO): { proporcion: string; por_omision: boolean } {
  const p = proporciones[formato.toLowerCase()]
  return p ? { proporcion: p, por_omision: true } : { proporcion: PROPORCION_POR_OMISION, por_omision: true }
}

/** la proporción de (red, formato): primero el dato de la tabla; si falta o es ilegible, la de por omisión del formato (`ilegible` = el dato que no se pudo usar, para avisarlo) */
export function proporcionDeLaTabla(formatos: FormatosPorRed, red: string, formato: string, respaldo: Readonly<Record<string, string>> = PROPORCION_POR_FORMATO): { proporcion: string; por_omision: boolean; ilegible?: string } {
  const fila = (formatos[red] ?? formatos[red.toLowerCase()] ?? []).find((x) => x.formato.toLowerCase() === formato.toLowerCase())
  const dato = typeof fila?.proporcion === 'string' ? fila.proporcion.trim() : ''
  if (RE_PROPORCION.test(dato)) return { proporcion: dato, por_omision: false }
  return dato ? { ...proporcionDe(formato, respaldo), ilegible: dato } : proporcionDe(formato, respaldo)
}
