/**
 * EL ESTUDIO DE LA CÁMARA (dpto de marketing · GO de Lenovo 05-nov tras boceto aprobado por Emilio) · catálogo y pedido. Puro: sin red, sin base.
 * Lo usa Emilio directamente: SIN tope de gasto ni freno (firma de Emilio 05-nov 20:12). El costo se muestra ANTES de crear y el real queda en el libro y en la pieza.
 * Precios: los publicados por cada proveedor en su página (leídos 05-nov). Son DATOS: se cambian aquí cuando cambie la lista.
 *   · imagen OpenAI: medida 03-oct, media 1:1 ≈ US$ 0,0138 sin foto; con foto de partida ≈ 0,026 (la real sale de `usage`).
 *   · 3D fal.ai: Tripo H3.1 0,30 textura normal / 0,40 textura alta · Hunyuan 3D v3.1 Pro 0,375 (+0,15 PBR en alta) · Meshy 6 0,80.
 *   · video Higgsfield: NO está aquí: se cotiza con su `/estimate` (gratis) antes de crear, como el brazo de video.
 */

export type TipoDePieza = 'imagen' | 'video' | '3d'
export const TIPOS: readonly TipoDePieza[] = ['imagen', 'video', '3d']
export type Calidad = 'normal' | 'alta'

/** el modelo de imagen: el mismo que configura la plataforma (`IMAGE_MODEL`); el de reserva es el vigente medido */
export const MODELO_DE_IMAGEN_DE_RESERVA = 'gpt-image-2.5-flare'
export const COSTO_IMAGEN_SIN_FOTO_USD = 0.0138
export const COSTO_IMAGEN_CON_FOTO_USD = 0.026
/** relación → tamaño que admite OpenAI */
export const TAMANO_POR_FORMATO: Readonly<Record<string, string>> = { '1:1': '1024x1024', '9:16': '1024x1536', '16:9': '1536x1024' }
export const FORMATOS_DE_IMAGEN = Object.keys(TAMANO_POR_FORMATO)
/** 1536 cuesta 1,5 veces lo de 1024² (misma proporción que la tabla de OpenAI) */
const FACTOR_POR_FORMATO: Readonly<Record<string, number>> = { '1:1': 1, '9:16': 1.5, '16:9': 1.5 }

export interface ModeloDe3D {
  id: string
  nombre: string
  /** endpoint de fal.ai */
  endpoint: string
  /** el nombre del campo de la imagen en su entrada (cada uno usa el suyo) */
  campoDeImagen: 'image_url' | 'input_image_url'
  precio: Record<Calidad, number>
  /** la entrada extra por calidad */
  opciones: Record<Calidad, Record<string, unknown>>
  /** el nombre del campo del tope de caras en su entrada (cada uno usa el suyo; leído de su ficha en fal, 09-nov) */
  campoDeCaras: 'face_limit' | 'face_count' | 'target_polycount'
  nota: string
}

/** el esqueleto (Meshy, vía fal) rechaza modelos de más de 380 000 triángulos (medido 06-nov) */
export const LIMITE_DE_CARAS_DEL_ESQUELETO = 380_000
/** todo modelo 3D nuevo sale con este tope, así se puede animar desde que se crea (firma de Emilio 09-nov 15:42Z: calidad antes que precio) */
export const TOPE_DE_CARAS_3D = 300_000

export const MODELOS_3D: readonly ModeloDe3D[] = [
  {
    id: 'tripo-h3.1', nombre: 'Tripo H3.1', endpoint: 'tripo3d/h3.1/image-to-3d', campoDeImagen: 'image_url',
    precio: { normal: 0.3, alta: 0.4 },
    opciones: { normal: { texture: true, texture_quality: 'standard' }, alta: { texture: true, texture_quality: 'detailed' } },
    campoDeCaras: 'face_limit',
    nota: 'rápido · buena textura',
  },
  {
    id: 'hunyuan-3d-v3.1-pro', nombre: 'Hunyuan 3D v3.1', endpoint: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', campoDeImagen: 'input_image_url',
    precio: { normal: 0.375, alta: 0.525 },
    opciones: { normal: { enable_pbr: false }, alta: { enable_pbr: true } },
    // su valor por omisión es 500 000: pasaría del límite del esqueleto
    campoDeCaras: 'face_count',
    nota: 'forma fiel · alta suma materiales realistas',
  },
  {
    id: 'meshy-6', nombre: 'Meshy 6', endpoint: 'fal-ai/meshy/v6/image-to-3d', campoDeImagen: 'image_url',
    precio: { normal: 0.8, alta: 0.8 },
    opciones: { normal: {}, alta: { enable_pbr: true } },
    campoDeCaras: 'target_polycount',
    nota: 'el más detallado · tarda 5 a 10 min',
  },
]
export const modeloDe3D = (id: string) => MODELOS_3D.find((m) => m.id === id) ?? null

export const MODELOS_DE_VIDEO = [
  { id: 'bytedance/seedance-2.5', nombre: 'Seedance 2.5' },
  { id: 'bytedance/seedance-2.0', nombre: 'Seedance 2.0' },
] as const
export const RELACIONES_DE_VIDEO = ['9:16', '16:9', '1:1'] as const
export const RESOLUCIONES_DE_VIDEO = ['480p', '720p', '1080p'] as const
export const SEGUNDOS_DE_VIDEO = { min: 4, max: 15 } as const

export const TOPE_DEL_TEXTO = 4000
/** la foto de partida que sube el dueño (en base64 dentro del JSON: Vercel corta los cuerpos de más de ~4,5 MB) */
export const TOPE_DE_LA_FOTO_BYTES = 3 * 1024 * 1024
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Pedido {
  client_id: string
  tipo: TipoDePieza
  prompt: string
  /** imagen: el de OpenAI · video: el de Higgsfield · 3d: el id del catálogo */
  modelo: string
  formato: string
  calidad: Calidad
  segundos: number
  resolucion: string
  audio: boolean
  /** clave del clic: repetir la misma clave devuelve la misma pieza y no cobra dos veces */
  clave: string
  /** subida · una imagen de la galería · o «rehacer»: un 3D nuevo desde la MISMA imagen de partida de un 3D anterior (queda ligado a él) */
  foto: { tipo: 'subida'; b64: string } | { tipo: 'pieza'; pieza_id: string } | { tipo: 'rehacer'; pieza_id: string } | null
  /** GO 09-nov 22:45Z · imagen con 2 a 6 referencias, en el orden de sus números (fijos: quitar una no renumera las otras). Vacío = como siempre */
  fotos: Referencia[]
}

/** una referencia de una imagen con varias: su número (el que ve el dueño) y de dónde sale */
export interface Referencia { numero: number; foto: { tipo: 'subida'; b64: string } | { tipo: 'pieza'; pieza_id: string } }

/**
 * Imagen con varias referencias (GO de Lenovo 09-nov 22:45Z, boceto aprobado por Emilio): con 2 o más imágenes el sistema pasa solo a
 * fal.ai `fal-ai/nano-banana-pro/edit` (leída 09-nov): `prompt` + `image_urls` (lista) + `aspect_ratio` + `resolution` 1K/2K/4K + `num_images` 1-4.
 * Precio publicado: US$ 0,15 por imagen; «4K outputs will be charged at double the standard rate». Su página dice hasta 14 referencias:
 * el tope queda en 6 hasta que la primera prueba pagada lo confirme. Se pide SIEMPRE 2K (mismo precio que 1K), nunca 4K.
 */
export const VARIAS = {
  id: 'nano-banana-pro',
  nombre: 'Nano Banana Pro',
  endpoint: 'fal-ai/nano-banana-pro/edit',
  resolucion: '2K',
  precio_usd: 0.15,
  minimo: 2,
  maximo: 6,
} as const
/** el precio de una imagen con varias referencias según la resolución pedida (4K cobra el doble) */
export const precioDeVarias = (resolucion: string) => +(VARIAS.precio_usd * (resolucion === '4K' ? 2 : 1)).toFixed(4)
/** las referencias juntas viajan en el JSON (Vercel corta los cuerpos de más de ~4,5 MB): el tablero las achica antes */
export const TOPE_DE_LAS_REFERENCIAS_BYTES = 3 * 1024 * 1024

/**
 * El modelo solo ve las imágenes en orden (la 1.ª, la 2.ª…). Si el dueño quitó alguna, los números que ve tienen huecos (2, 3, 5):
 * se le dice al modelo qué número es cada una, para que «la imagen 3» del texto sea la que el dueño ve con el 3.
 */
export function textoConReferencias(prompt: string, numeros: number[]): string {
  if (numeros.every((n, i) => n === i + 1)) return prompt
  const orden = numeros.map((n, i) => `la ${i + 1}.ª imagen adjunta es la «imagen ${n}»`).join(', ')
  return `${prompt}\n\nReferencias, en el orden en que van adjuntas: ${orden}.`
}

/** lo que se manda a fal para una imagen con varias referencias */
export const entradaDeVarias = (prompt: string, numeros: number[], urls: string[], formato: string) =>
  ({ prompt: textoConReferencias(prompt, numeros), image_urls: urls, num_images: 1, aspect_ratio: formato, resolution: VARIAS.resolucion, output_format: 'png' })

/** la imagen de la respuesta de fal (`images[0].url`) */
export function imagenDeVarias(salida: Record<string, unknown>): string | null {
  const l = Array.isArray(salida.images) ? salida.images : []
  const u = l[0] && typeof l[0] === 'object' ? (l[0] as { url?: unknown }).url : null
  return typeof u === 'string' ? u : null
}

const B64 = /^[A-Za-z0-9+/=\s]+$/
const bytesDeB64 = (b64: string) => Math.floor((b64.replace(/\s/g, '').length * 3) / 4)

/** las referencias del pedido: 2 a 6, números enteros del 1 al 6 sin repetir, en el orden de sus números */
function armarReferencias(crudas: unknown, errores: string[]): Referencia[] {
  if (crudas === undefined || crudas === null) return []
  if (!Array.isArray(crudas)) { errores.push('`fotos` es una lista'); return [] }
  if (crudas.length < VARIAS.minimo || crudas.length > VARIAS.maximo) { errores.push(`\`fotos\` lleva de ${VARIAS.minimo} a ${VARIAS.maximo} imágenes (con una sola se usa \`foto_b64\` o \`foto_pieza_id\`)`); return [] }
  const salida: Referencia[] = []
  let bytes = 0
  for (const x of crudas) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const numero = Number(r.numero)
    if (!Number.isInteger(numero) || numero < 1 || numero > VARIAS.maximo) { errores.push(`cada referencia lleva su \`numero\` del 1 al ${VARIAS.maximo}`); return [] }
    if (salida.some((y) => y.numero === numero)) { errores.push(`la referencia ${numero} está repetida`); return [] }
    const b64 = texto(r.b64).replace(/^data:[^,]+,/, '')
    const pieza = texto(r.pieza_id)
    if ((b64 ? 1 : 0) + (pieza ? 1 : 0) !== 1) { errores.push(`la referencia ${numero} lleva \`b64\` o \`pieza_id\`, una de las dos`); return [] }
    if (pieza && !UUID.test(pieza)) { errores.push(`la referencia ${numero} no es un id de pieza`); return [] }
    if (b64 && !B64.test(b64)) { errores.push(`la referencia ${numero} no es base64`); return [] }
    bytes += b64 ? bytesDeB64(b64) : 0
    salida.push({ numero, foto: b64 ? { tipo: 'subida', b64: b64.replace(/\s/g, '') } : { tipo: 'pieza', pieza_id: pieza } })
  }
  if (bytes > TOPE_DE_LAS_REFERENCIAS_BYTES) { errores.push('las referencias juntas pasan de 3 MB'); return [] }
  return salida.sort((a, b) => a.numero - b.numero)
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function armarPedido(e: Record<string, unknown>, modeloDeImagen: string): { ok: true; pedido: Pedido } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const client_id = texto(e.client_id)
  if (!UUID.test(client_id)) errores.push('`client_id` es obligatorio: toda pieza pertenece a un cliente')
  const tipo = texto(e.tipo) as TipoDePieza
  if (!TIPOS.includes(tipo)) errores.push('`tipo` es imagen, video o 3d')
  const prompt = texto(e.prompt)
  const clave = texto(e.clave)
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clave)) errores.push('`clave` es obligatoria (8 a 80 letras, números, guion): sin ella un doble clic cobraría dos veces')
  let foto: Pedido['foto'] = null
  const b64 = texto(e.foto_b64)
  const piezaFoto = texto(e.foto_pieza_id)
  const rehacer = texto(e.rehacer_pieza_id)
  const fotos = armarReferencias(e.fotos, errores)
  if (fotos.length && tipo !== 'imagen') errores.push('varias referencias solo valen para una imagen')
  if (fotos.length && [b64, piezaFoto, rehacer].some(Boolean)) errores.push('con varias referencias no se manda además una imagen de partida suelta')
  if ([b64, piezaFoto, rehacer].filter(Boolean).length > 1) errores.push('una sola imagen de partida: subida, de la galería o la de un modelo anterior')
  else if (rehacer) {
    if (tipo !== '3d') errores.push('`rehacer_pieza_id` solo vale para un modelo 3D')
    else if (!UUID.test(rehacer)) errores.push('`rehacer_pieza_id` no es un id de pieza')
    else foto = { tipo: 'rehacer', pieza_id: rehacer }
  }
  else if (b64) {
    const limpio = b64.replace(/^data:[^,]+,/, '')
    if (!/^[A-Za-z0-9+/=\s]+$/.test(limpio)) errores.push('`foto_b64` no es base64')
    else if (Math.floor((limpio.replace(/\s/g, '').length * 3) / 4) > TOPE_DE_LA_FOTO_BYTES) errores.push('la foto de partida pasa de 3 MB')
    else foto = { tipo: 'subida', b64: limpio.replace(/\s/g, '') }
  } else if (piezaFoto) {
    if (!UUID.test(piezaFoto)) errores.push('`foto_pieza_id` no es un id de pieza')
    else foto = { tipo: 'pieza', pieza_id: piezaFoto }
  }
  // en 3D con foto el texto sobra (se convierte la foto); en lo demás, el texto es lo que se crea
  const textoOpcional = tipo === '3d' && foto !== null && !fotos.length
  if (!textoOpcional && (prompt.length < 3 || prompt.length > TOPE_DEL_TEXTO)) errores.push(`el texto va de 3 a ${TOPE_DEL_TEXTO} caracteres`)
  if (textoOpcional && prompt.length > TOPE_DEL_TEXTO) errores.push(`el texto va hasta ${TOPE_DEL_TEXTO} caracteres`)
  const calidad: Calidad = e.calidad === 'alta' ? 'alta' : 'normal'
  if (e.calidad !== undefined && e.calidad !== 'alta' && e.calidad !== 'normal') errores.push('`calidad` es normal o alta')

  let modelo = '', formato = '1:1', segundos = 0, resolucion = '', audio = false
  if (tipo === 'imagen') {
    modelo = fotos.length ? VARIAS.id : modeloDeImagen
    formato = texto(e.formato) || '1:1'
    if (!(formato in TAMANO_POR_FORMATO)) errores.push('`formato` de imagen es 1:1, 9:16 o 16:9')
  } else if (tipo === '3d') {
    modelo = texto(e.modelo) || MODELOS_3D[0].id
    if (!modeloDe3D(modelo)) errores.push(`\`modelo\` 3D es uno de: ${MODELOS_3D.map((m) => m.id).join(', ')}`)
  } else if (tipo === 'video') {
    modelo = texto(e.modelo) || MODELOS_DE_VIDEO[0].id
    if (!MODELOS_DE_VIDEO.some((m) => m.id === modelo)) errores.push(`\`modelo\` de video es uno de: ${MODELOS_DE_VIDEO.map((m) => m.id).join(', ')}`)
    formato = texto(e.formato) || '9:16'
    if (!(RELACIONES_DE_VIDEO as readonly string[]).includes(formato)) errores.push('`formato` de video es 9:16, 16:9 o 1:1')
    segundos = e.segundos === undefined ? 5 : Number(e.segundos)
    if (!Number.isInteger(segundos) || segundos < SEGUNDOS_DE_VIDEO.min || segundos > SEGUNDOS_DE_VIDEO.max) errores.push(`\`segundos\` es un entero de ${SEGUNDOS_DE_VIDEO.min} a ${SEGUNDOS_DE_VIDEO.max}`)
    resolucion = texto(e.resolucion) || '720p'
    if (!(RESOLUCIONES_DE_VIDEO as readonly string[]).includes(resolucion)) errores.push('`resolucion` es 480p, 720p o 1080p')
    if (e.audio !== undefined && typeof e.audio !== 'boolean') errores.push('`audio` es verdadero o falso')
    audio = e.audio !== false
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedido: { client_id, tipo, prompt, modelo, formato, calidad, segundos, resolucion, audio, clave, foto, fotos } }
}

/** costo de una imagen de OpenAI antes de crearla */
export const costoDeImagen = (formato: string, conFoto: boolean) => +(((conFoto ? COSTO_IMAGEN_CON_FOTO_USD : COSTO_IMAGEN_SIN_FOTO_USD) * (FACTOR_POR_FORMATO[formato] ?? 1)).toFixed(4))

export interface Cotizacion { total_usd: number; partes: Array<{ que: string; usd: number }> }

/** imagen y 3D se cotizan aquí; el video necesita la estimación del proveedor (ver `servicio.ts`) */
export function cotizarSinRed(p: Pedido): Cotizacion | null {
  if (p.tipo === 'imagen' && p.fotos.length) {
    const usd = precioDeVarias(VARIAS.resolucion)
    return { total_usd: usd, partes: [{ que: `imagen con ${p.fotos.length} referencias`, usd }] }
  }
  if (p.tipo === 'imagen') {
    const usd = costoDeImagen(p.formato, p.foto !== null)
    return { total_usd: usd, partes: [{ que: 'imagen', usd }] }
  }
  if (p.tipo === '3d') {
    const m = modeloDe3D(p.modelo)
    if (!m) return null
    const partes = [] as Array<{ que: string; usd: number }>
    // sin foto de partida, primero se crea la imagen (cuadrada, como pide la conversión)
    if (!p.foto) partes.push({ que: 'imagen', usd: costoDeImagen('1:1', false) })
    partes.push({ que: `3D · ${m.nombre}`, usd: m.precio[p.calidad] })
    return { total_usd: +partes.reduce((s, x) => s + x.usd, 0).toFixed(4), partes }
  }
  return null
}

/** el texto que va a OpenAI cuando la imagen es para convertir en 3D: un objeto solo, entero y sobre fondo limpio (la conversión lo necesita) */
export const promptDeImagenPara3D = (prompt: string) =>
  `${prompt}\n\nUn solo objeto, entero y centrado, vista de producto de tres cuartos, sobre fondo liso claro, sin otros objetos, sin texto, sin sombras duras.`

/** lo que se manda a fal para la conversión */
export function entradaDe3D(m: ModeloDe3D, calidad: Calidad, imagenUrl: string): Record<string, unknown> {
  return { [m.campoDeImagen]: imagenUrl, ...m.opciones[calidad], [m.campoDeCaras]: TOPE_DE_CARAS_3D }
}

/** el archivo 3D de la respuesta de fal: cada modelo lo nombra distinto; se prefiere GLB */
export function archivoDe3D(salida: Record<string, unknown>): { url: string; tipo: string; nombre: string | null } | null {
  const comoArchivo = (v: unknown) => (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string; content_type?: string; file_name?: string }) : null)
  const urls = (salida.model_urls && typeof salida.model_urls === 'object' ? salida.model_urls : {}) as Record<string, unknown>
  const candidatos = [comoArchivo(urls.glb), comoArchivo(urls.pbr_model), comoArchivo(salida.model_glb), comoArchivo(salida.model_mesh)]
  const f = candidatos.find((x) => x !== null)
  if (!f) return null
  const nombre = typeof f.file_name === 'string' ? f.file_name : null
  const ext = (nombre ?? f.url).toLowerCase().split('?')[0]
  const tipo = typeof f.content_type === 'string' && f.content_type ? f.content_type : ext.endsWith('.glb') ? 'model/gltf-binary' : ext.endsWith('.obj') ? 'model/obj' : ext.endsWith('.fbx') ? 'application/octet-stream' : 'model/gltf-binary'
  return { url: f.url, tipo, nombre }
}

/** la miniatura que dan algunos modelos 3D (para la galería) */
export function miniaturaDe3D(salida: Record<string, unknown>): string | null {
  for (const k of ['thumbnail', 'rendered_image']) {
    const v = salida[k] as { url?: unknown } | undefined
    if (v && typeof v.url === 'string') return v.url
  }
  return null
}

// ── animar un modelo 3D (GO de Lenovo 06-nov · firma de Emilio: sin boceto solo esta vez) ─────────────────
/**
 * fal.ai `fal-ai/meshy/rigging/multi-animation` (leída 06-nov): pone esqueleto al GLB y genera un clip por movimiento.
 *  · entrada: `model_url` (GLB público), `height_meters` (1,7 por omisión), `animation_action_ids` (1 a 10, ids 0-696), `enable_safety_checker`.
 *  · salida: `animations[] {action_id, animation_glb, animation_fbx}`, `rigged_character_glb/fbx`, `basic_animations` (caminar y correr).
 *  · precio: US$ 0,20 por pedido + US$ 0,12 por movimiento. Solo figuras humanas con brazos y piernas definidos.
 */
export const ANIMAR = {
  id: 'meshy-animar',
  nombre: 'Meshy · animar',
  endpoint: 'fal-ai/meshy/rigging/multi-animation',
  precio: { base: 0.2, por_movimiento: 0.12 },
  maximo: 10,
  altura_m: 1.7,
} as const
/** los más comunes primero (ids de la biblioteca de Meshy) */
export const MOVIMIENTOS_COMUNES: ReadonlyArray<{ id: number; nombre: string }> = [
  { id: 0, nombre: 'Quieto' },
  { id: 30, nombre: 'Caminar' },
  { id: 14, nombre: 'Correr' },
  { id: 28, nombre: 'Saludar' },
  { id: 591, nombre: 'Bailar' },
]

export interface PedidoDeAnimacion { client_id: string; clave: string; origen_pieza_id: string; movimientos: number[] }

export function armarAnimacion(e: Record<string, unknown>, existe: (id: number) => boolean): { ok: true; pedido: PedidoDeAnimacion } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const client_id = texto(e.client_id)
  if (!UUID.test(client_id)) errores.push('`client_id` es obligatorio: toda pieza pertenece a un cliente')
  const clave = texto(e.clave)
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clave)) errores.push('`clave` es obligatoria (8 a 80 letras, números, guion): sin ella un doble clic cobraría dos veces')
  const origen_pieza_id = texto(e.origen_pieza_id)
  if (!UUID.test(origen_pieza_id)) errores.push('`origen_pieza_id` es el modelo 3D que se anima')
  const crudos = Array.isArray(e.movimientos) ? e.movimientos : []
  // solo números o texto de dígitos: `true` no es el movimiento 1, ni `""` el 0
  const movimientos = [...new Set(crudos.map((x) => (typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN)))]
  if (!movimientos.length) errores.push('elige al menos un movimiento')
  else if (movimientos.length > ANIMAR.maximo) errores.push(`hasta ${ANIMAR.maximo} movimientos por vez`)
  else if (movimientos.some((x) => !Number.isInteger(x) || !existe(x))) errores.push('hay un movimiento que no está en la biblioteca')
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedido: { client_id, clave, origen_pieza_id, movimientos } }
}

export function cotizarAnimacion(n: number): Cotizacion {
  const partes = [{ que: 'esqueleto', usd: ANIMAR.precio.base }, { que: `${n} movimiento${n === 1 ? '' : 's'}`, usd: +(ANIMAR.precio.por_movimiento * n).toFixed(4) }]
  return { total_usd: +partes.reduce((s, x) => s + x.usd, 0).toFixed(4), partes }
}

/** lo que se manda a fal para animar */
export const entradaDeAnimacion = (modeloUrl: string, movimientos: number[]) => ({ model_url: modeloUrl, height_meters: ANIMAR.altura_m, animation_action_ids: movimientos, enable_safety_checker: true })

/** los clips de la respuesta, en el orden pedido (solo los que traen archivo) */
export function clipsDeAnimacion(salida: Record<string, unknown>): Array<{ action_id: number; glb: string | null; fbx: string | null }> {
  const url = (v: unknown) => (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string }).url : null)
  const lista = Array.isArray(salida.animations) ? salida.animations : []
  return lista
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ action_id: Number(c.action_id), glb: url(c.animation_glb), fbx: url(c.animation_fbx) }))
    .filter((c) => Number.isInteger(c.action_id) && (c.glb || c.fbx))
}

/** un fallo de fal que dice que el modelo no se puede montar en un esqueleto humano: se explica en claro */
// solo palabras que dicen «no es humano»; «rigging», «skeleton» o «pose» aparecen también en fallos de otra causa
// (06-nov: el error de demasiados triángulos dice «limit for rigging» y salía como «no es figura humana»)
export const noEsHumanoide = (error: string) => /humanoid|\blimbs?\b|\bbiped\b/i.test(error)
export const AVISO_NO_HUMANOIDE = 'Este modelo no parece una figura humana con brazos y piernas definidos, así que no se puede animar. No se registró ningún cobro.'

/** fal rechaza el esqueleto porque el modelo tiene demasiados triángulos (medido 06-nov: 1.456.114 contra un tope de 380.000) */
export function demasiadoDetalle(error: string): { tiene: number; tope: number } | null {
  const m = /([\d,.]+)\s*triangles?\s+which exceeds the\s+([\d,.]+)\s*triangle limit/i.exec(error)
  if (!m) return /triangle limit|polycount/i.test(error) ? { tiene: NaN, tope: NaN } : null
  const n = (s: string) => Number(s.replace(/[,.]/g, ''))
  return { tiene: n(m[1]), tope: n(m[2]) }
}
const miles = (x: number) => x.toLocaleString('es-EC')

/** el motivo de un fallo al animar, en claro: primero «demasiadas caras» (su error también nombra el esqueleto), después «no es figura humana» */
/** el texto del proveedor sin el JSON alrededor: «fal 422 · {"detail":"x"}» → «fal 422 · x» (el texto puede venir cortado) */
export function textoDelProveedor(error: string): string {
  const m = /"msg"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(error) ?? /"detail"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(error)
  const inicio = error.indexOf('{')
  return m && inicio >= 0 ? `${error.slice(0, inicio)}${m[1]}` : error
}

export function motivoDeAnimacion(crudo: string): string {
  const error = textoDelProveedor(crudo)
  const det = demasiadoDetalle(error)
  if (det) {
    const cifras = Number.isFinite(det.tiene) ? ` (${miles(det.tiene)} triángulos; el proveedor acepta hasta ${miles(det.tope)})` : ''
    return `Este modelo tiene demasiadas caras para animarlo${cifras}: créalo de nuevo. Los modelos nuevos ya salen listos para animar. No se registró ningún cobro. (${error})`
  }
  if (noEsHumanoide(error)) return `${AVISO_NO_HUMANOIDE} (${error})`
  // causa no reconocida: se dice en simple, sin inventarla, y se muestra el texto del proveedor
  return `${AVISO_SIN_CAUSA} (${error})`
}
export const AVISO_SIN_CAUSA = 'No se pudo animar este modelo; el proveedor no dio una causa que reconozcamos. No se registró ningún cobro.'
