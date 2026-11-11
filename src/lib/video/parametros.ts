/**
 * PARÁMETROS APROBADOS DEL BRAZO DE VIDEO (Emilio, 31-oct 11:55Z, «aprobado todo» · adenda 1 del encargo):
 * Seedance 2.5 · 8–15 s para reel/tiktok/short · 1080p (adenda 4: por omisión 720p hasta medir el descuento real) · audio generado (música/ambiente), SIN voz sintética al inicio · fotos propias del cliente como referencia
 * siempre que existan · SIN caras de personas reales por ahora · tope US$ 5 por video · cantidad = la que pida el calendario.
 * Son DATOS (se cambian aquí o por el pedido, dentro de lo permitido): el código solo impide salirse de lo aprobado y de lo que la API admite.
 */

import { PROPORCION_POR_FORMATO } from '../cadena/proporciones'

export const MODELO_APROBADO = 'bytedance/seedance-2.5'
export const MODELOS_PERMITIDOS: ReadonlySet<string> = new Set(['bytedance/seedance-2.5', 'bytedance/seedance-2.0'])
export const DURACION_MIN_S = 8
export const DURACION_MAX_S = 15
/** adenda 4 (Emilio, 31-oct 12:30Z, opción B): la prueba va a 720p y queda como valor por omisión; 1080p sigue admitida para después, cuando se mida el descuento real */
export const RESOLUCION_APROBADA = '720p'
export const RESOLUCIONES_PERMITIDAS: ReadonlySet<string> = new Set(['480p', '720p', '1080p'])
/** el tope por video POR OMISIÓN (lo aprobado por Emilio el 31-oct); el vigente sale de la configuración (`configDelBrazo`) */
export const TOPE_POR_VIDEO_USD = 5

/**
 * 11-nov · GO Lenovo 03:55Z · regla #18 del barrido: el descuento y el tope del proveedor NO viven en el código (el descuento del 31-oct quedó escrito con su fecha y venció el 7-nov).
 * Son CONFIGURACIÓN: `cadena_config` clave `brazo_de_video` = `{ tope_por_video_usd?, descuento?: { pct, hasta, modelos } }`. La pone quien decide (Lenovo/Emilio), no este código.
 * Sin la clave, ilegible o con valores raros: el tope aprobado (US$ 5) y SIN descuento (del lado seguro: se reserva la lista, que es lo que más cuesta).
 */
export const CLAVE_DE_CONFIG_DEL_BRAZO = 'brazo_de_video'
export interface DescuentoDelProveedor { pct: number; hasta: string; modelos: readonly string[] }
export interface ConfigDelBrazo { tope_por_video_usd: number; descuento: DescuentoDelProveedor | null }
export const CONFIG_DEL_BRAZO_POR_OMISION: ConfigDelBrazo = { tope_por_video_usd: TOPE_POR_VIDEO_USD, descuento: null }

/** normaliza el valor guardado · cada parte inválida vuelve a su valor por omisión (nunca lanza) · pura */
export function configDelBrazo(valor: unknown): ConfigDelBrazo {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
  const tope = typeof v.tope_por_video_usd === 'number' && Number.isFinite(v.tope_por_video_usd) && v.tope_por_video_usd > 0 ? v.tope_por_video_usd : TOPE_POR_VIDEO_USD
  const d = v.descuento && typeof v.descuento === 'object' && !Array.isArray(v.descuento) ? (v.descuento as Record<string, unknown>) : null
  const descuento = d && typeof d.pct === 'number' && d.pct > 0 && d.pct < 1 && typeof d.hasta === 'string' && Number.isFinite(Date.parse(d.hasta)) && Array.isArray(d.modelos)
    ? { pct: d.pct, hasta: d.hasta, modelos: d.modelos.map(String) }
    : null
  return { tope_por_video_usd: tope, descuento }
}

/** lee la configuración del brazo con el lector de la cadena (`almacen.leerConfig`: el único que nombra sus tablas) · sin valor o cualquier error ⇒ la de por omisión (tope aprobado, sin descuento) */
export async function leerConfigDelBrazo(leer: (clave: string) => PromiseLike<unknown>): Promise<ConfigDelBrazo> {
  try {
    const v = await leer(CLAVE_DE_CONFIG_DEL_BRAZO)
    return v == null ? CONFIG_DEL_BRAZO_POR_OMISION : configDelBrazo(v)
  } catch { return CONFIG_DEL_BRAZO_POR_OMISION }
}

/** el costo con el descuento de la configuración, si rige para ese modelo y esa hora; sin descuento, la lista */
export function conDescuento(costoListaUsd: number, modelo: string, ahoraMs: number, descuento: DescuentoDelProveedor | null): { usd: number; pct: number } {
  const d = descuento
  const rige = !!d && d.pct > 0 && d.modelos.includes(modelo) && ahoraMs < Date.parse(d.hasta)
  if (!rige) return { usd: costoListaUsd, pct: 0 }
  return { usd: +(costoListaUsd * (1 - d.pct)).toFixed(4), pct: d.pct }
}
/**
 * los formatos que acepta el brazo y su relación POR OMISIÓN · 11-nov regla #17: la relación real la manda quien pide (la oficina la lee del brief,
 * que la tomó de `cadena_formatos_por_red.proporcion`); sin ella, la MISMA de por omisión que usa la hoja (`cadena/proporciones.ts`). Antes el brazo tenía la suya (video = 16:9).
 */
export const FORMATOS_DEL_BRAZO = ['reel', 'short', 'tiktok', 'video', 'historia', 'estado'] as const
export const RELACION_POR_FORMATO: Readonly<Record<string, string>> = Object.fromEntries(FORMATOS_DEL_BRAZO.map((f) => [f, PROPORCION_POR_FORMATO[f] ?? '9:16']))
export const RELACIONES_PERMITIDAS: ReadonlySet<string> = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])
export const MAX_FOTOS_DE_REFERENCIA = 9 // el mínimo común de 2.0 (9) y 2.5 (30): nunca se manda más que lo que admite cualquiera de los dos

/** reglas fijas que viajan en el pedido al modelo (texto del guion + estas líneas): lo aprobado que el modelo tiene que respetar */
export const REGLAS_DEL_PEDIDO: readonly string[] = [
  'Sin voces, sin diálogo y sin narración: solo música y sonido ambiente.',
  'Sin rostros de personas reales ni reconocibles; si aparecen personas, de espaldas, de lejos o solo manos.',
  'Sin texto en pantalla que no esté escrito literalmente en este pedido; sin logotipos ni marcas que no sean las del cliente.',
]

export interface PedidoDeVideo {
  prompt: string
  formato: string
  segundos: number
  resolucion: string
  relacion: string
  modelo: string
  audio: boolean
  fotos: string[]
}

export interface Entrada { prompt?: unknown; formato?: unknown; segundos?: unknown; resolucion?: unknown; relacion?: unknown; modelo?: unknown; audio?: unknown; fotos?: unknown }

/** valida y completa un pedido con los valores aprobados; devuelve la lista de errores (vacía = válido) */
export function armarPedido(e: Entrada): { ok: true; pedido: PedidoDeVideo } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const prompt = typeof e.prompt === 'string' ? e.prompt.trim() : ''
  if (prompt.length < 10 || prompt.length > 4000) errores.push('`prompt` es un texto de 10 a 4000 caracteres')
  const formato = typeof e.formato === 'string' ? e.formato.trim().toLowerCase() : ''
  if (!formato || !(formato in RELACION_POR_FORMATO)) errores.push(`\`formato\` es uno de: ${Object.keys(RELACION_POR_FORMATO).join(', ')}`)
  const segundos = e.segundos === undefined ? DURACION_MIN_S : Number(e.segundos)
  if (!Number.isInteger(segundos) || segundos < DURACION_MIN_S || segundos > DURACION_MAX_S) errores.push(`\`segundos\` es un entero de ${DURACION_MIN_S} a ${DURACION_MAX_S}`)
  const resolucion = e.resolucion === undefined ? RESOLUCION_APROBADA : String(e.resolucion).toLowerCase()
  if (!RESOLUCIONES_PERMITIDAS.has(resolucion)) errores.push('`resolucion` es 480p, 720p o 1080p')
  const relacion = e.relacion === undefined ? (RELACION_POR_FORMATO[formato] ?? '9:16') : String(e.relacion)
  if (!RELACIONES_PERMITIDAS.has(relacion)) errores.push('`relacion` es 16:9, 4:3, 1:1, 3:4, 9:16 o 21:9')
  const modelo = e.modelo === undefined ? MODELO_APROBADO : String(e.modelo)
  if (!MODELOS_PERMITIDOS.has(modelo)) errores.push(`\`modelo\` es uno de: ${[...MODELOS_PERMITIDOS].join(', ')}`)
  if (e.audio !== undefined && typeof e.audio !== 'boolean') errores.push('`audio` es verdadero o falso')
  let fotos: string[] = []
  if (e.fotos !== undefined) {
    if (!Array.isArray(e.fotos) || e.fotos.some((u) => typeof u !== 'string' || !/^https:\/\/\S+$/.test(u))) errores.push('`fotos` es una lista de direcciones https públicas')
    else fotos = [...new Set(e.fotos as string[])].slice(0, MAX_FOTOS_DE_REFERENCIA)
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedido: { prompt, formato, segundos, resolucion, relacion, modelo, audio: e.audio === undefined ? true : (e.audio as boolean), fotos } }
}

/** la ruta del modelo según haya fotos propias (referencia) o no (texto) · doc: /docs/models/seedance-2-5.md */
export const rutaDelModelo = (p: Pick<PedidoDeVideo, 'modelo' | 'fotos'>) => `${p.modelo}/${p.fotos.length ? 'reference-to-video' : 'text-to-video'}`

/** el cuerpo exacto que se manda a Higgsfield (sirve igual para `/estimate/{ruta}` y para `/{ruta}`) */
export function cuerpoParaHiggsfield(p: PedidoDeVideo): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = { prompt: `${p.prompt}\n\n${REGLAS_DEL_PEDIDO.join(' ')}`, duration: p.segundos, resolution: p.resolucion, aspect_ratio: p.relacion, generate_audio: p.audio }
  if (p.fotos.length) cuerpo.image_urls = p.fotos
  return cuerpo
}
