/**
 * EL PORTERO QUE ALIMENTA · DATOS (no lógica) · agnóstico: ni clientes, ni lugares, ni rubros.
 * Todo lo que cambia con el idioma, el país o la moneda vive aquí como DATO; ampliar una lista no toca la lógica.
 *  · tuteo por defecto; el voseo es una VARIANTE del registro del cliente (manual/país), nunca un supuesto;
 *  · los avisos de estado («cerrado, vuelve hoy…») son transitorios: no son cambios.
 */

import { codigoDePais } from '../pais/pais-del-cliente'

/** tope del portero por cliente y día (firma 15-oct de Emilio: «3 al día»; antes 1,50). El código corta con motivo si se pasa. */
export const TOPE_DEL_PORTERO_USD = 3
/**
 * Umbrales de gasto del VIGILANTE (15-oct · firma de Emilio): por encima de `aviso_usd` UN aviso a #alertas por día y cliente SIN apagar; por encima de `apagar_usd` apaga + avisa.
 * Son DATO: se cambian con `PORTERO_GASTO_AVISO_USD` / `PORTERO_GASTO_APAGAR_USD` sin tocar la lógica (un valor roto o incoherente vuelve a estos: 3 y 10).
 */
export interface UmbralesDeGasto { aviso_usd: number; apagar_usd: number }
/** firma de Emilio 15-oct: avisa pasando de US$ 3, apaga SOLO pasando de US$ 10 (21-oct: son también los valores por omisión del código; borrar una variable ya no vuelve a 1,50 / 3,00) */
export const UMBRALES_DE_GASTO_POR_OMISION: UmbralesDeGasto = { aviso_usd: 3, apagar_usd: 10 }
export function umbralesDeGastoDelEntorno(env: Record<string, string | undefined> = process.env): UmbralesDeGasto {
  const num = (k: string) => { const t = String(env[k] ?? '').trim().replace(',', '.'); const n = t === '' ? NaN : Number(t); return Number.isFinite(n) && n > 0 && n <= 50 ? n : null }
  const aviso = num('PORTERO_GASTO_AVISO_USD'), apagar = num('PORTERO_GASTO_APAGAR_USD')
  const u = { aviso_usd: aviso ?? UMBRALES_DE_GASTO_POR_OMISION.aviso_usd, apagar_usd: apagar ?? UMBRALES_DE_GASTO_POR_OMISION.apagar_usd }
  return u.aviso_usd < u.apagar_usd ? u : { ...UMBRALES_DE_GASTO_POR_OMISION }
}
/** lo máximo que puede costar UN pulido del resumen (≈ US$ 0,02 por día y cliente: una llamada) */
export const TOPE_DEL_PULIDO_USD = 0.03
/** firma 15-oct: el tope sube a US$ 0,05 SOLO si el costo real medido pasó de `TOPE_DEL_PULIDO_USD` en este número de días seguidos */
export const TOPE_ALTO_DEL_PULIDO_USD = 0.05
export const DIAS_PARA_SUBIR_EL_TOPE_DEL_PULIDO = 3
/** el pulido en su PROPIO paso (`/pulir`, 16-oct · firma de Emilio «calidad sobre precio»): hasta US$ 0,30 por corrida y cliente (medido ≈ 0,24). Reemplaza los topes 0,03/0,05 de cuando iba dentro de ④. */
export const TOPE_DEL_PULIDO_APARTE_USD = 0.3
/**
 * El pulido es redacción (ordenar y reescribir líneas con su cita), no un problema que pida pensar mucho. Medido 19-oct con el razonamiento por omisión: 120–236 s, US$ 0,25–0,36 y 7–10 mil
 * tokens de salida para una respuesta de ~1,8 mil; pasaba el plazo (200 s) o el tope. Con `low`: 54 s, US$ 0,16, 2,6 mil tokens, y las mismas guardas (citas ≥ 80 %, no agrega hechos) aprobadas.
 */
export const RAZONAMIENTO_DEL_PULIDO = 'low' as const
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

/**
 * IDIOMA DE BÚSQUEDA POR PAÍS (P7 · dato): el idioma en que se pide Google Maps y las búsquedas. Español por omisión (la casa trabaja en español); se amplía una línea por país.
 * El país sale de la ficha del cliente (nombre o código); sin país se usa el español y NO se adivina otro.
 */
export const IDIOMA_DE_BUSQUEDA_POR_PAIS: Readonly<Record<string, string>> = { BR: 'pt', PT: 'pt', US: 'en', GB: 'en', CA: 'en', AU: 'en', IE: 'en', NZ: 'en', FR: 'fr', IT: 'it', DE: 'de' }
export function idiomaDeBusqueda(pais: unknown): string {
  const iso = codigoDePais(pais)
  return (iso && IDIOMA_DE_BUSQUEDA_POR_PAIS[iso]) || 'es'
}

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
  // «Abierto ahora», «Cerrado hoy», «Ahora mismo cerrado» son el estado de este momento; «Abierto las 24 horas» o «Cerrado los domingos» son un dato permanente y NO se descartan
  /^(abierto|cerrado)( ahora| hoy| ya| en este momento)?$/,
  /\b(abierto|cerrado) (ahora|hoy|ya|en este momento)\b/,
  /\b(ahora mismo|en este momento|por ahora) (abierto|cerrado|abrimos|cerramos)\b/,
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
export interface Interruptores { alimentar: boolean; proponer_busquedas: boolean; menciones: boolean; puente_al_indice: boolean; /** el resumen vivo del cliente (15-oct): apagado por omisión */ resumen_vivo?: boolean; /** pulido del resumen con un agente del roster (15-oct): apagado por omisión; solo actúa si el resumen vivo está encendido */ resumen_pulido?: boolean }
export function interruptoresDelEntorno(env: Record<string, string | undefined> = process.env): Interruptores {
  const on = (k: string) => String(env[k] ?? '').trim().toLowerCase() === 'on'
  return { alimentar: on('PORTERO_ALIMENTAR'), proponer_busquedas: on('PORTERO_PROPONER_BUSQUEDAS'), menciones: on('PORTERO_MENCIONES'), puente_al_indice: on('PORTERO_PUENTE_AL_INDICE'), resumen_vivo: on('PORTERO_RESUMEN_VIVO'), resumen_pulido: on('PORTERO_RESUMEN_PULIDO') }
}
