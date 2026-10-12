/**
 * EL NEGOCIO DEL CLIENTE, NO SU CLIENTELA (ronda 78 · §C.3 de CC#3). Una descripción de industria dice QUÉ ES el negocio al principio y A QUIÉN le sirve (o de qué trata su objeto) después:
 * «software PARA restaurantes» es software, no comida; «escuela DE pastelería» es educación, no alimentos; «consultora PARA ferreterías» es un servicio profesional, no un comercio.
 * Regla: el negocio es la CABEZA de la descripción (hasta la primera palabra de enlace: para, de, del, en, a, que, con, sobre, orientado a, dirigido a, especializado en…). Una clave de UNA palabra
 * solo cuenta si está en la cabeza; una clave de VARIAS palabras («agencia de viajes», «taller mecanico») cuenta si aparece en la descripción entera (ya es un negocio completo).
 * Si la cabeza no reconoce nada, se vuelve a la descripción entera (sin dato mejor, la pista de toda la frase). La coincidencia sigue siendo por PALABRA ENTERA (`coincidencia.ts`).
 * PURO. Nada de este archivo nombra un rubro, un lugar ni un cliente.
 */
import { coincideAlguna, coincidePorPalabra } from './coincidencia'

const ENLACES = new Set(['para', 'de', 'del', 'en', 'a', 'que', 'sobre', 'orientado', 'orientada', 'orientados', 'orientadas', 'dirigido', 'dirigida', 'dirigidos', 'dirigidas', 'especializado', 'especializada', 'especializados', 'especializadas', 'enfocado', 'enfocada', 'enfocados', 'enfocadas'])

const sinTildes = (s: unknown): string => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]+/g, ' ').replace(/\s+/g, ' ').trim()

/** lo que ES el negocio: las palabras hasta la primera palabra de enlace (nunca vacío: si la descripción abre con un enlace, se usa entera) */
export function cabezaDelNegocio(descripcion: unknown): string {
  const t = sinTildes(descripcion).split(' ').filter(Boolean)
  let fin = t.findIndex((p, i) => i > 0 && ENLACES.has(p))
  if (fin < 0) fin = t.length
  return t.slice(0, fin).join(' ')
}

const esFrase = (clave: string): boolean => sinTildes(clave.replace(/\*+\s*$/, '')).includes(' ')

/** ¿alguna clave describe AL NEGOCIO (cabeza) o es una frase de negocio completa que aparece en la descripción? */
export function coincideConElNegocio(descripcion: unknown, claves: readonly string[], cabezaForzada?: string): boolean {
  const cabeza = cabezaForzada ?? cabezaDelNegocio(descripcion)
  if (coincideAlguna(cabeza, claves)) return true
  return (claves ?? []).some((c) => esFrase(c) && coincidePorPalabra(descripcion, c))
}

/**
 * Elige, entre varios grupos de claves, los que corresponden al NEGOCIO; si ninguno lo reconoce en la cabeza, se vuelve a la descripción entera (sin dato mejor).
 * `grupos`: nombre → claves. Devuelve los nombres elegidos. `conocidas` (opcional): el vocabulario de negocios que SE RECONOCEN aunque ningún grupo los tenga (p. ej. el catálogo de familias):
 * si la cabeza es uno de ellos («software», «marketing», «escuela»), el negocio ya está dicho y NO se vuelve a la descripción entera (no se le pega el rubro de su clientela).
 */
export function gruposDelNegocio<K extends string>(descripcion: unknown, grupos: Record<K, readonly string[]>, conocidas?: readonly string[]): K[] {
  const nombres = Object.keys(grupos) as K[]
  // «consultoría agrícola», «hotel boutique»: una cabeza de DOS palabras cuya primera ya es un negocio conocido dice el negocio con la primera; la segunda lo califica (no lo cambia)
  let cabeza = cabezaDelNegocio(descripcion)
  const dos = cabeza.split(' ')
  if (conocidas && dos.length === 2 && coincideAlguna(dos[0], conocidas)) cabeza = dos[0]
  const porNegocio = nombres.filter((n) => coincideConElNegocio(descripcion, grupos[n], cabeza))
  if (porNegocio.length) return porNegocio
  if (conocidas && coincideConElNegocio(descripcion, conocidas, cabeza)) return []
  return nombres.filter((n) => coincideAlguna(descripcion, grupos[n]))
}
