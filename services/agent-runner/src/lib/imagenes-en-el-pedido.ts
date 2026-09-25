/**
 * EL CABLE PARA MIRAR · CC#1 · 2026-09-25 · §144 Emilio («arreglemos estos dos, ya sin juez»).
 *
 * Medido en el censo del 25-sep (`raw/tasks/2026-09-25-RESULTADO-CC1-que-trae-apify-para-lo-visual-…`):
 * el módulo de Apify trae DIRECCIONES de fotos (perfil y posts de Instagram, portada del mapa,
 * imagen social del sitio, creativos de la biblioteca de anuncios) y el corredor armaba el pedido
 * como una cadena de texto (`query({ prompt: input.task })`). Cuando la dirección viaja escrita en
 * el texto, el modelo LEE la dirección: no ve la foto.
 *
 * Este módulo hace dos cosas, y nada más:
 *   1. `validarImagenes` · lee el campo OPCIONAL `images: [{url, label}]` del pedido y lo rechaza
 *      si viene mal formado. Sin el campo, no cambia nada para nadie (regla del encargo: aditivo).
 *   2. `armarBloquesDeImagen` + `armarPromptConImagenes` · convierten el pedido en UN mensaje de
 *      usuario con bloques `image` ANTES del texto (la documentación de visión de Anthropic pide
 *      imagen-primero). Dos caminos, declarados en el resultado:
 *        · `url`    · el bloque lleva `source: { type: 'url', url }` · el servidor de Anthropic
 *                     baja la imagen · sin descargar ni codificar de este lado.
 *        · `base64` · este lado la baja (tope 10 MB · 15 s · sólo jpeg/png/gif/webp) y la manda
 *                     codificada. Es el camino de respaldo si el CDN no deja bajarla por URL.
 *
 * Los tipos son ESTRUCTURALES (la forma del `MessageParam` de la API y del `SDKUserMessage` del
 * SDK 0.2.138) para no depender de cómo resuelva cada entorno los tipos del SDK: lo que viaja es
 * exactamente lo que documenta Anthropic (`{type:'image', source:{type:'url'|'base64', …}}`).
 *
 * 🚫 No se enchufa a ningún nodo del journey: es cañería. Enchufarla es otro encargo.
 */

export type ImagenDelPedido = { url: string; label?: string }
export type ModoImagenes = 'url' | 'base64'
export type MediaTypeImagen = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
export type BloqueDeContenido =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: MediaTypeImagen; data: string } }
/** La forma de `SDKUserMessage` (SDK 0.2.138): `type`, `message` (MessageParam) y `parent_tool_use_id`. */
export type MensajeDeUsuarioSDK = {
  type: 'user'
  message: { role: 'user'; content: BloqueDeContenido[] }
  parent_tool_use_id: string | null
}
export type ImagenEntregada = {
  url: string
  label: string
  modo: ModoImagenes
  media_type?: string
  bytes?: number
}

export const MAX_IMAGENES = 20
export const MAX_LABEL = 80
export const MAX_BYTES_POR_IMAGEN = 10 * 1024 * 1024
export const TIMEOUT_DESCARGA_MS = 15_000
const TIPOS_ACEPTADOS = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/** El campo `images` es opcional · ausente = `[]` sin error · presente y mal formado = error (400). */
export function validarImagenes(raw: unknown): { images: ImagenDelPedido[]; error: string | null } {
  if (raw === undefined || raw === null) return { images: [], error: null }
  if (!Array.isArray(raw)) return { images: [], error: 'images must be an array of {url, label?}' }
  if (raw.length > MAX_IMAGENES) return { images: [], error: `images: at most ${MAX_IMAGENES} per request` }
  const out: ImagenDelPedido[] = []
  const vistas = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i]
    const url = typeof it === 'string' ? it : it && typeof it === 'object' ? (it as { url?: unknown }).url : undefined
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url.trim())) {
      return { images: [], error: `images[${i}].url must be an http(s) URL` }
    }
    const labelRaw = it && typeof it === 'object' ? (it as { label?: unknown }).label : undefined
    if (labelRaw !== undefined && labelRaw !== null && typeof labelRaw !== 'string') {
      return { images: [], error: `images[${i}].label must be a string` }
    }
    const u = url.trim()
    if (vistas.has(u)) continue
    vistas.add(u)
    const label = typeof labelRaw === 'string' ? labelRaw.trim().slice(0, MAX_LABEL) : ''
    out.push(label ? { url: u, label } : { url: u })
  }
  return { images: out, error: null }
}

/** `base64` sólo si se pide así, textual · cualquier otra cosa (incluido ausente) = `url`. */
export function leerModoImagenes(raw: unknown): ModoImagenes {
  return raw === 'base64' ? 'base64' : 'url'
}

function mediaTypePorExtension(url: string): string | null {
  const m = url.toLowerCase().match(/\.(jpe?g|png|gif|webp)(\?|#|$)/)
  if (!m) return null
  return m[1] === 'jpg' || m[1] === 'jpeg' ? 'image/jpeg' : `image/${m[1]}`
}

async function descargar(url: string, fetchFn: typeof fetch): Promise<{ data: string; media_type: MediaTypeImagen; bytes: number }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_DESCARGA_MS)
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, headers: { Accept: 'image/*' } })
    if (!res.ok) throw new Error(`imagen no descargable · HTTP ${res.status} · ${url.slice(0, 80)}`)
    const ct = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const media_type = TIPOS_ACEPTADOS.has(ct) ? ct : mediaTypePorExtension(url)
    if (!media_type || !TIPOS_ACEPTADOS.has(media_type)) {
      throw new Error(`imagen de tipo no aceptado · ${ct || 'sin content-type'} · ${url.slice(0, 80)}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES_POR_IMAGEN) {
      throw new Error(`imagen demasiado grande · ${buf.byteLength} bytes > ${MAX_BYTES_POR_IMAGEN} · ${url.slice(0, 80)}`)
    }
    return { data: buf.toString('base64'), media_type: media_type as MediaTypeImagen, bytes: buf.byteLength }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Bloques de contenido para UN mensaje: por cada imagen, un rótulo de texto («Imagen 1: …») y el
 * bloque `image`. El texto del pedido va DESPUÉS (lo pone `armarPromptConImagenes`).
 * En modo `base64` una descarga fallida lanza: el que llama la declara como error del pedido.
 */
export async function armarBloquesDeImagen(
  images: ImagenDelPedido[],
  modo: ModoImagenes,
  fetchFn: typeof fetch = fetch,
): Promise<{ bloques: BloqueDeContenido[]; entregadas: ImagenEntregada[] }> {
  const bloques: BloqueDeContenido[] = []
  const entregadas: ImagenEntregada[] = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const label = img.label ? `Imagen ${i + 1}: ${img.label}` : `Imagen ${i + 1}`
    bloques.push({ type: 'text', text: label })
    if (modo === 'base64') {
      const d = await descargar(img.url, fetchFn)
      bloques.push({ type: 'image', source: { type: 'base64', media_type: d.media_type, data: d.data } })
      entregadas.push({ url: img.url, label, modo, media_type: d.media_type, bytes: d.bytes })
    } else {
      bloques.push({ type: 'image', source: { type: 'url', url: img.url } })
      entregadas.push({ url: img.url, label, modo })
    }
  }
  return { bloques, entregadas }
}

/** UN mensaje de usuario · imágenes primero, el pedido después · como pide la documentación de visión. */
export async function* armarPromptConImagenes(
  task: string,
  bloques: BloqueDeContenido[],
): AsyncIterable<MensajeDeUsuarioSDK> {
  yield {
    type: 'user',
    message: { role: 'user', content: [...bloques, { type: 'text', text: task }] },
    parent_tool_use_id: null,
  }
}
