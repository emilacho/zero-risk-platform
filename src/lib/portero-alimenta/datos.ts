/**
 * EL PORTERO QUE ALIMENTA · DATOS (no lógica) · agnóstico: ni clientes, ni lugares, ni rubros.
 * Todo lo que cambia con el idioma, el país o la moneda vive aquí como DATO; ampliar una lista no toca la lógica.
 *  · tuteo por defecto; el voseo es una VARIANTE del registro del cliente (manual/país), nunca un supuesto;
 *  · los avisos de estado («cerrado, vuelve hoy…») son transitorios: no son cambios.
 */

/** tope del portero (firma 14-oct de Emilio: reemplaza el US$ 1,00 del 10-oct). El código corta con motivo si se pasa. */
export const TOPE_DEL_PORTERO_USD = 1.5
/** búsquedas propias que el portero puede proponer por día (firma 14-oct) */
export const MAX_BUSQUEDAS_PROPUESTAS_POR_DIA = 3
/** páginas de artículos que se leen por día (cada una es una corrida del lector del sitio) */
export const MAX_ARTICULOS_POR_DIA = 3
/** llamadas del juez por día y cliente, y lo que cabe en cada una */
export const MAX_LLAMADAS_DEL_JUEZ_POR_DIA = 3
export const MAX_ITEMS_POR_LLAMADA_DEL_JUEZ = 20
export const TOPE_DE_GASTO_DEL_JUEZ_POR_LLAMADA_USD = 0.08

/** monedas reconocidas SIN «$» (códigos ISO en minúscula, sobre texto normalizado) · dato: se amplía sin tocar la lógica */
export const MONEDAS: readonly string[] = [
  'usd', 'ars', 'uyu', 'cop', 'mxn', 'clp', 'pen', 'eur', 'brl', 'bob', 'pyg', 'gtq', 'crc', 'dop', 'nio', 'hnl', 'pab', 'gbp', 'cad', 'vef', 'ves',
]
/** símbolos que `normalizar` borra: se sustituyen por su código ANTES de normalizar */
export const SIMBOLOS_DE_MONEDA: ReadonlyArray<[RegExp, string]> = [
  [/€/g, ' eur '],
  [/£/g, ' gbp '],
  [/\bS\/\.?\s?(?=\d)/g, ' pen '],
  [/\bUS\$\s?/g, ' usd $'],
  [/\bR\$\s?/g, ' brl $'],
]

export const DIAS_EN_ORDEN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
/** nombres de día en varios idiomas → el canónico */
export const NOMBRE_DE_DIA: Record<string, (typeof DIAS_EN_ORDEN)[number]> = {
  lunes: 'lunes', martes: 'martes', miercoles: 'miercoles', jueves: 'jueves', viernes: 'viernes', sabado: 'sabado', domingo: 'domingo',
  monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves', friday: 'viernes', saturday: 'sabado', sunday: 'domingo',
  mon: 'lunes', tue: 'martes', wed: 'miercoles', thu: 'jueves', fri: 'viernes', sat: 'sabado', sun: 'domingo',
}

export type VarianteDeIdioma = 'es_tuteo' | 'es_voseo'
/** transitorios COMUNES a todas las variantes (texto normalizado: minúsculas, sin tildes) */
export const TRANSITORIOS_COMUNES: RegExp[] = [
  /^(abierto|cerrado)\b/,
  /\b(abierto|cerrado) (ahora|hoy)\b/,
  /\bvuelve (hoy|manana|pasado manana|el \w+|a las)\b/,
  /\b(abre|abrimos|cierra|cerramos) (hoy|manana|ahora|a las)\b/,
  /\bultima actualizacion\b/,
  /\bproximo (turno|horario)\b/,
  /\bhoy no (abrimos|atendemos|abre|atiende)\b/,
  /\bvolvemos (hoy|manana|pasado manana|el \w+|a las)\b/,
]
/** transitorios del voseo (rioplatense): «volvé», «estamos cerrados hasta mañana»… */
export const TRANSITORIOS_VOSEO: RegExp[] = [
  /\bvolve (hoy|manana|a las|a partir|el \w+)\b/,
  /\bestamos cerrad[oa]s? (hasta|por hoy|ahora)\b/,
  /\bhoy (cerramos|no hay atencion)\b/,
]
export const transitoriosDe = (v: VarianteDeIdioma): RegExp[] => (v === 'es_voseo' ? [...TRANSITORIOS_COMUNES, ...TRANSITORIOS_VOSEO] : TRANSITORIOS_COMUNES)

/**
 * La variante del cliente sale de lo que él declaró (registro del manual o país), nunca de adivinar por el texto.
 * Países de voseo dominante = DATO; ante cualquier duda, tuteo (regla de la casa).
 */
export const PAISES_DE_VOSEO: readonly string[] = ['ar', 'uy', 'py']
export function varianteDelCliente(c: { registro?: string | null; pais?: string | null }): VarianteDeIdioma {
  const r = String(c.registro ?? '').toLowerCase()
  if (r.includes('voseo')) return 'es_voseo'
  if (r.includes('tuteo')) return 'es_tuteo'
  const p = String(c.pais ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const iso = p.length === 2 ? p : (({ argentina: 'ar', uruguay: 'uy', paraguay: 'py' }) as Record<string, string>)[p] ?? ''
  return PAISES_DE_VOSEO.includes(iso) ? 'es_voseo' : 'es_tuteo'
}

/** interruptores (todos APAGADOS por omisión: sin ellos el sistema queda idéntico a hoy) */
export interface Interruptores { alimentar: boolean; proponer_busquedas: boolean; menciones: boolean; puente_al_indice: boolean; /** el resumen vivo del cliente (15-oct): apagado por omisión */ resumen_vivo?: boolean }
export function interruptoresDelEntorno(env: Record<string, string | undefined> = process.env): Interruptores {
  const on = (k: string) => String(env[k] ?? '').trim().toLowerCase() === 'on'
  return { alimentar: on('PORTERO_ALIMENTAR'), proponer_busquedas: on('PORTERO_PROPONER_BUSQUEDAS'), menciones: on('PORTERO_MENCIONES'), puente_al_indice: on('PORTERO_PUENTE_AL_INDICE'), resumen_vivo: on('PORTERO_RESUMEN_VIVO') }
}
