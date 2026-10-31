/**
 * VIDEOS DEL CEREBRO · lectura instantánea (31-oct · encargo videos y PDF escaneados, punto 4).
 * Cada video llega con sus subcategorías (tipo · origen · cuenta · fecha · duración · pie · métricas), su TRANSCRIPCIÓN y sus CAPTURAS de momentos clave ya etiquetadas (qué muestra).
 * «De qué trata» sale de lo que dicen las etiquetas de sus capturas (y, si aún no están etiquetadas, del pie). US$ 0, sin modelo, solo lee.
 * El archivo vive en un almacén PRIVADO: la dirección que se devuelve es firmada y caduca (`firmar`, inyectado; sin firma, `archivo_url` queda en null y se dice).
 */
import type { Consulta, Fila } from '../consulta'
import { origenDeLaFoto, type OrigenDeFoto, ORIGENES_DE_FOTO } from './fotos-pendientes'

export const TIPOS_DE_VIDEO = ['reel', 'video_feed', 'historia', 'anuncio', 'video_web'] as const
export type TipoDeVideoVisto = (typeof TIPOS_DE_VIDEO)[number]
export const LIMITE_POR_DEFECTO_DE_VIDEOS = 30
export const LIMITE_MAXIMO_DE_VIDEOS = 100

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const numero = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null }

export interface CapturaVista { foto_id: string; momento: number | null; url: string | null; etiquetada: boolean; que_muestra: string | null; producto_visto: string[]; texto_visible: string | null }
export interface VideoVisto {
  video_id: string
  tipo: TipoDeVideoVisto | string
  origen: OrigenDeFoto
  cuenta: string | null
  publicado_en: string | null
  copiado_en: string | null
  duracion_s: number | null
  bytes: number | null
  pie: string | null
  metricas: Record<string, number>
  post_url: string | null
  de_que_trata: string | null
  transcripcion: string | null
  archivo_url: string | null
  capturas: CapturaVista[]
}
export interface PedidoDeVideos { cliente: string; origen?: OrigenDeFoto | null; tipo?: string | null; limite?: number }
export type RespuestaDeVideos =
  | { ok: true; cliente: string; total: number; devueltos: number; por_tipo: Record<string, number>; por_origen: Record<OrigenDeFoto, number>; sin_descargar: number; videos: VideoVisto[]; archivo_firmado: boolean; modelos_llamados: 0; costo_usd: 0 }
  | { ok: false; error: string; detalle: string }

const COLUMNAS_DE_VIDEO = ['id', 'owner_role', 'handle', 'post_id', 'tipo', 'estado', 'path', 'bytes', 'duracion_s', 'caption', 'posted_at', 'post_url', 'transcripcion', 'metricas', 'created_at']
const COLUMNAS_DE_CAPTURA = ['id', 'video_id', 'posicion', 'url', 'etiquetada_en', 'que_muestra', 'producto_visto', 'texto_visible', 'estado', 'created_at']

/** lo que trata el video: las etiquetas de sus capturas, sin repetir; sin etiquetas, el pie */
export function deQueTrataElVideo(capturas: CapturaVista[], pie: string | null): string | null {
  const dichas: string[] = []
  for (const c of capturas) if (c.que_muestra && !dichas.includes(c.que_muestra)) dichas.push(c.que_muestra)
  if (dichas.length) return dichas.slice(0, 4).join(' · ')
  return pie ? pie.slice(0, 300) : null
}

export async function listarVideos(consulta: Consulta, p: PedidoDeVideos, firmar?: (path: string) => Promise<string | null>): Promise<RespuestaDeVideos> {
  const cliente = txt(p.cliente)
  if (!cliente) return { ok: false, error: 'entrada_invalida', detalle: 'falta `client_id`' }
  if (p.origen && !(ORIGENES_DE_FOTO as readonly string[]).includes(p.origen)) return { ok: false, error: 'entrada_invalida', detalle: `\`origen\` debe ser ${ORIGENES_DE_FOTO.join(', ')}` }
  if (p.tipo && !(TIPOS_DE_VIDEO as readonly string[]).includes(p.tipo)) return { ok: false, error: 'entrada_invalida', detalle: `\`tipo\` debe ser ${TIPOS_DE_VIDEO.join(', ')}` }
  const limite = Math.min(Math.max(Math.trunc(p.limite ?? LIMITE_POR_DEFECTO_DE_VIDEOS) || LIMITE_POR_DEFECTO_DE_VIDEOS, 1), LIMITE_MAXIMO_DE_VIDEOS)
  const v = await consulta({ tabla: 'client_videos', columnas: COLUMNAS_DE_VIDEO, donde: { client_id: cliente }, orden: { columna: 'created_at', descendente: true }, limite: 1000 })
  if (v.error) return { ok: false, error: 'error_de_lectura', detalle: v.error.slice(0, 200) }
  const c = await consulta({ tabla: 'client_social_images', columnas: COLUMNAS_DE_CAPTURA, donde: { client_id: cliente, tipo: 'video_captura' }, orden: { columna: 'posicion', descendente: false }, limite: 2000 })
  if (c.error) return { ok: false, error: 'error_de_lectura', detalle: c.error.slice(0, 200) }
  const capturasDe = new Map<string, CapturaVista[]>()
  const ordenadas = [...c.filas].filter((f: Fila) => f.estado === 'ok' && txt(f.video_id)).sort((a, b) => (numero(String(a.posicion ?? '').replace('hijo-', '')) ?? 0) - (numero(String(b.posicion ?? '').replace('hijo-', '')) ?? 0))
  for (const f of ordenadas) {
    const k = String(f.video_id)
    const lista = capturasDe.get(k) ?? []
    lista.push({ foto_id: String(f.id), momento: numero(String(f.posicion ?? '').replace('hijo-', '')), url: txt(f.url), etiquetada: !!txt(f.etiquetada_en), que_muestra: txt(f.que_muestra), producto_visto: Array.isArray(f.producto_visto) ? (f.producto_visto as unknown[]).filter((x): x is string => typeof x === 'string') : [], texto_visible: txt(f.texto_visible) })
    capturasDe.set(k, lista)
  }
  const todos = v.filas.filter((f) => f.estado === 'ok')
  const sin_descargar = v.filas.length - todos.length
  const por_tipo: Record<string, number> = {}
  const por_origen = Object.fromEntries(ORIGENES_DE_FOTO.map((o) => [o, 0])) as Record<OrigenDeFoto, number>
  for (const f of todos) { por_tipo[String(f.tipo)] = (por_tipo[String(f.tipo)] ?? 0) + 1; por_origen[origenDeLaFoto(f.owner_role)]++ }
  const elegidos = todos.filter((f) => (!p.origen || origenDeLaFoto(f.owner_role) === p.origen) && (!p.tipo || f.tipo === p.tipo)).slice(0, limite)
  const videos: VideoVisto[] = []
  for (const f of elegidos) {
    const caps = capturasDe.get(String(f.id)) ?? []
    const path = txt(f.path)
    let archivo_url: string | null = null
    if (path && firmar) { try { archivo_url = await firmar(path) } catch { archivo_url = null } }
    const pie = txt(f.caption)
    const m = f.metricas && typeof f.metricas === 'object' ? (f.metricas as Record<string, unknown>) : {}
    const metricas: Record<string, number> = {}
    for (const [k, x] of Object.entries(m)) { const n = numero(x); if (n !== null) metricas[k] = n }
    videos.push({ video_id: String(f.id), tipo: String(f.tipo), origen: origenDeLaFoto(f.owner_role), cuenta: txt(f.handle), publicado_en: txt(f.posted_at), copiado_en: txt(f.created_at), duracion_s: numero(f.duracion_s), bytes: numero(f.bytes), pie, metricas, post_url: txt(f.post_url), de_que_trata: deQueTrataElVideo(caps, pie), transcripcion: txt(f.transcripcion), archivo_url, capturas: caps })
  }
  return { ok: true, cliente, total: todos.length, devueltos: videos.length, por_tipo, por_origen, sin_descargar, videos, archivo_firmado: !!firmar, modelos_llamados: 0, costo_usd: 0 }
}
