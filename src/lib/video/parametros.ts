/**
 * PARÁMETROS APROBADOS DEL BRAZO DE VIDEO (Emilio, 31-oct 11:55Z, «aprobado todo» · adenda 1 del encargo):
 * Seedance 2.5 · 8–15 s para reel/tiktok/short · 1080p · audio generado (música/ambiente), SIN voz sintética al inicio · fotos propias del cliente como referencia
 * siempre que existan · SIN caras de personas reales por ahora · tope US$ 5 por video · cantidad = la que pida el calendario.
 * Son DATOS (se cambian aquí o por el pedido, dentro de lo permitido): el código solo impide salirse de lo aprobado y de lo que la API admite.
 */

export const MODELO_APROBADO = 'bytedance/seedance-2.5'
export const MODELOS_PERMITIDOS: ReadonlySet<string> = new Set(['bytedance/seedance-2.5', 'bytedance/seedance-2.0'])
export const DURACION_MIN_S = 8
export const DURACION_MAX_S = 15
export const RESOLUCION_APROBADA = '1080p'
export const RESOLUCIONES_PERMITIDAS: ReadonlySet<string> = new Set(['480p', '720p', '1080p'])
export const TOPE_POR_VIDEO_USD = 5
/** relación de cuadro por formato de red (la tabla `cadena_formatos_por_red` nombra el formato; el cuadro lo fija esto) */
export const RELACION_POR_FORMATO: Readonly<Record<string, string>> = { reel: '9:16', short: '9:16', tiktok: '9:16', video: '16:9', historia: '9:16', estado: '9:16' }
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
