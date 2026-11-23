/**
 * ENCARGO 7 · 21-nov · LA ETIQUETA `red` Y LOS NOMBRES DE LAS CARPETAS DEL VAULT.
 *
 * La red de una pieza (foto, video o ficha) se DEDUCE del raspador, del tipo o del enlace; sin dato → null («no consta»).
 * Nunca se inventa: una pieza sin señal de red queda sin red, y el vault la muestra en «Datos».
 *
 * Los nombres (capas, redes, tipos) son los que Lenovo pasó en `2026-11-18-NOMBRES-LENOVO-a-CC-CEREBRO-CEREBRO-carpetas-del-vault.md`
 * con el boceto 2 aprobado por Emilio. Viven SOLO aquí: cambiar un rótulo es cambiar una línea, y el dashboard solo pinta.
 */
export type Fila = Record<string, unknown>

/** capa → rótulo (el primer nivel del árbol) */
export const CAPAS_DEL_VAULT = { propio: 'Propio', competencia: 'Competencia', mercado: 'Mercado', pais: 'País', mundo: 'Mundo' } as const
export type CapaDelVault = keyof typeof CAPAS_DEL_VAULT

/** red → rótulo (el segundo nivel) */
export const REDES_DEL_VAULT = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', x: 'X',
  maps: 'Google Maps', sitio: 'Sitio web', anuncios_meta: 'Anuncios de Meta', anuncios_google: 'Anuncios de Google',
  foros: 'Foros', busquedas: 'Búsquedas de Google', ventas: 'Ventas y métricas', menciones: 'Menciones', eventos: 'Eventos y feriados',
} as const
export type RedDelVault = keyof typeof REDES_DEL_VAULT

/** tipo → rótulo (el tercer nivel) */
export const TIPOS_DEL_VAULT = {
  publicacion: 'Publicaciones', reel: 'Reels', video: 'Videos', foto: 'Fotos', resena: 'Reseñas',
  comentario: 'Comentarios', pagina: 'Páginas', anuncio: 'Anuncios', tendencia: 'Tendencias', ficha: 'Datos',
} as const
export type TipoDelVault = keyof typeof TIPOS_DEL_VAULT

/** las carpetas RAW, aparte del árbol: nada se borra y se puede devolver */
export const RAW_DEL_VAULT = { raw_sin_clasificar: 'Sin clasificar', raw_duplicado: 'Duplicado' } as const

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** el host de un enlace, sin `www.`; '' si no es un enlace */
const hostDe = (url: string): string => url.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i)?.[1]?.toLowerCase() ?? ''

const RED_POR_HOST: Array<[RegExp, RedDelVault]> = [
  [/(^|\.)instagram\.com$|(^|\.)cdninstagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$|(^|\.)tiktokcdn\S*$/, 'tiktok'],
  [/(^|\.)facebook\.com$|(^|\.)fbcdn\.net$/, 'facebook'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'],
  [/^x\.com$|(^|\.)twitter\.com$|(^|\.)twimg\.com$/, 'x'],
  // 23-nov · hallazgo de CC6 en #1271 con datos vivos: Google NO es solo Maps. Cada servicio con su red, y Maps
  // SOLO por sus hosts propios o la ruta /maps (abajo). google.com a secas ya no dice nada («no consta»).
  [/^adstransparency\.google\.com$/, 'anuncios_google'],
  [/^trends\.google\.com$/, 'busquedas'],
  [/^maps\.google\.com$|^maps\.app\.goo\.gl$/, 'maps'],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/, 'foros'],
]
/** Maps por la RUTA: google.<tld>/maps y goo.gl/maps (el host solo no alcanza: google.com también es anuncios, trends y búsquedas) */
const ES_RUTA_DE_MAPS = /^https?:\/\/(?:www\.)?(?:google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps(?:[/?#]|$)|goo\.gl\/maps\/)/i

/** la red que dice un enlace; null si el host no es de una red conocida */
export function redDeUrl(url: unknown): RedDelVault | null {
  const u = txt(url)
  const h = hostDe(u)
  if (!h) return null
  if (ES_RUTA_DE_MAPS.test(u)) return 'maps'
  for (const [re, red] of RED_POR_HOST) if (re.test(h)) return red
  return null
}

/** la red de una FOTO (`client_social_images`) o un VIDEO (`client_videos`): primero el tipo, después el enlace; sin señal → null */
export function redDeLaFotoOVideo(f: Partial<Pick<Fila, 'tipo' | 'post_url' | 'url' | 'fuente_url'>>): RedDelVault | null {
  const tipo = txt(f.tipo)
  if (tipo === 'maps_portada' || tipo === 'maps_foto') return 'maps'
  if (tipo === 'web_imagen' || tipo === 'web_captura' || tipo === 'logo_hd' || tipo === 'video_web') return redDeUrl(f.post_url) ?? redDeUrl(f.url) ?? redDeUrl(f.fuente_url) ?? 'sitio'
  // los anuncios con archivo vienen de la biblioteca de Meta (los de Google son fichas de texto)
  if (tipo === 'anuncio') return 'anuncios_meta'
  return redDeUrl(f.post_url) ?? redDeUrl(f.url) ?? redDeUrl(f.fuente_url)
}

/** clase de ficha → red, cuando la clase lo dice sola (la lista viva de clases, 21-nov) */
const RED_POR_CLASE: Record<string, RedDelVault> = {
  metrica: 'ventas', venta: 'ventas',
  evento_local: 'eventos', contexto_feriado: 'eventos', contexto_temporada: 'eventos',
  tendencia_busqueda: 'busquedas', busqueda: 'busquedas',
  foro: 'foros',
  mencion: 'menciones',
  sitio: 'sitio', articulo: 'sitio',
  mapas: 'maps', resenas: 'maps', competidor_mapas: 'maps', horas_de_mas_gente: 'maps',
  instagram: 'instagram', competidor_instagram: 'instagram', lo_mas_gustado: 'instagram', lo_mas_gustado_propio: 'instagram',
  competidor_anuncios: 'anuncios_meta',
  competidor_anuncios_google: 'anuncios_google',
}

/** la red de una FICHA (`cerebro_fichas`): primero el enlace de la fuente, después la clase; sin señal → null («no consta»: dato del dueño, resumen, informe…) */
export function redDeLaFicha(f: Partial<Pick<Fila, 'clase' | 'fuente_url'>>): RedDelVault | null {
  return redDeUrl(f.fuente_url) ?? RED_POR_CLASE[txt(f.clase)] ?? null
}

/** la CAPA de una pieza clasificada: del papel efectivo y, para las referencias, de su nivel del embudo */
export function capaDeLaPieza(papel: string, nivel: string): CapaDelVault {
  if (papel === 'propio') return 'propio'
  if (papel === 'competidor') return 'competencia'
  if (papel === 'mercado') return 'mercado'
  // referencia (tendencias, anuncios de terceros, bodega): la capa la dice el nivel
  if (nivel === 'mundo' || nivel === 'global') return 'mundo'
  if (nivel === 'pais') return 'pais'
  if (nivel === 'directa') return 'competencia'
  return 'mercado'
}

/** la CAPA de una ficha, por su alcance (los valores vivos: cliente · competidor · mercado · pais · zona · general · null) */
export function capaDeLaFicha(alcance: unknown): CapaDelVault {
  const a = txt(alcance)
  if (a === 'competidor') return 'competencia'
  if (a === 'mercado' || a === 'zona') return 'mercado'
  if (a === 'pais') return 'pais'
  // cliente, general, formato o sin alcance: es material del cliente
  return 'propio'
}

/** el TIPO de carpeta de una foto, un video, una tendencia, un comentario o una ficha */
export function tipoDeCarpetaDeFoto(tipo: unknown): TipoDelVault {
  const t = txt(tipo)
  if (t === 'anuncio') return 'anuncio'
  if (t === 'web_captura') return 'pagina'
  if (t === 'post_image' || t === 'post_sidecar' || t === 'post_hijo' || t === 'post_video') return 'publicacion'
  return 'foto'
}
export function tipoDeCarpetaDeVideo(tipo: unknown): TipoDelVault {
  const t = txt(tipo)
  if (t === 'reel') return 'reel'
  if (t === 'anuncio') return 'anuncio'
  return 'video'
}
const TIPO_POR_CLASE: Record<string, TipoDelVault> = {
  resenas: 'resena',
  comentarios: 'comentario', competidor_comentarios: 'comentario',
  sitio: 'pagina', articulo: 'pagina',
  competidor_anuncios: 'anuncio', competidor_anuncios_google: 'anuncio',
  videos: 'video',
  tendencia_del_publico: 'tendencia', tendencia_busqueda: 'tendencia',
}
export function tipoDeCarpetaDeFicha(clase: unknown): TipoDelVault {
  return TIPO_POR_CLASE[txt(clase)] ?? 'ficha'
}
