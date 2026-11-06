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
  nota: string
}

export const MODELOS_3D: readonly ModeloDe3D[] = [
  {
    id: 'tripo-h3.1', nombre: 'Tripo H3.1', endpoint: 'tripo3d/h3.1/image-to-3d', campoDeImagen: 'image_url',
    precio: { normal: 0.3, alta: 0.4 },
    opciones: { normal: { texture: true, texture_quality: 'standard' }, alta: { texture: true, texture_quality: 'detailed' } },
    nota: 'rápido · buena textura',
  },
  {
    id: 'hunyuan-3d-v3.1-pro', nombre: 'Hunyuan 3D v3.1', endpoint: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', campoDeImagen: 'input_image_url',
    precio: { normal: 0.375, alta: 0.525 },
    opciones: { normal: { enable_pbr: false }, alta: { enable_pbr: true } },
    nota: 'forma fiel · alta suma materiales realistas',
  },
  {
    id: 'meshy-6', nombre: 'Meshy 6', endpoint: 'fal-ai/meshy/v6/image-to-3d', campoDeImagen: 'image_url',
    precio: { normal: 0.8, alta: 0.8 },
    opciones: { normal: {}, alta: { enable_pbr: true } },
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
  foto: { tipo: 'subida'; b64: string } | { tipo: 'pieza'; pieza_id: string } | null
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
  if (b64 && piezaFoto) errores.push('una sola imagen de partida: subida o de la galería')
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
  const textoOpcional = tipo === '3d' && foto !== null
  if (!textoOpcional && (prompt.length < 3 || prompt.length > TOPE_DEL_TEXTO)) errores.push(`el texto va de 3 a ${TOPE_DEL_TEXTO} caracteres`)
  if (textoOpcional && prompt.length > TOPE_DEL_TEXTO) errores.push(`el texto va hasta ${TOPE_DEL_TEXTO} caracteres`)
  const calidad: Calidad = e.calidad === 'alta' ? 'alta' : 'normal'
  if (e.calidad !== undefined && e.calidad !== 'alta' && e.calidad !== 'normal') errores.push('`calidad` es normal o alta')

  let modelo = '', formato = '1:1', segundos = 0, resolucion = '', audio = false
  if (tipo === 'imagen') {
    modelo = modeloDeImagen
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
  return { ok: true, pedido: { client_id, tipo, prompt, modelo, formato, calidad, segundos, resolucion, audio, clave, foto } }
}

/** costo de una imagen de OpenAI antes de crearla */
export const costoDeImagen = (formato: string, conFoto: boolean) => +(((conFoto ? COSTO_IMAGEN_CON_FOTO_USD : COSTO_IMAGEN_SIN_FOTO_USD) * (FACTOR_POR_FORMATO[formato] ?? 1)).toFixed(4))

export interface Cotizacion { total_usd: number; partes: Array<{ que: string; usd: number }> }

/** imagen y 3D se cotizan aquí; el video necesita la estimación del proveedor (ver `servicio.ts`) */
export function cotizarSinRed(p: Pedido): Cotizacion | null {
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
  return { [m.campoDeImagen]: imagenUrl, ...m.opciones[calidad] }
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
// palabras enteras: «rig» no debe saltar con «origin» ni «pose» con «purpose»
export const noEsHumanoide = (error: string) => /humanoid|\brig(?:ging|ged)?\b|\blimbs?\b|\bskeleton\b|\bbiped\b|\bpose\b/i.test(error)
export const AVISO_NO_HUMANOIDE = 'Este modelo no parece una figura humana con brazos y piernas definidos, así que no se puede animar. No se cobró.'
