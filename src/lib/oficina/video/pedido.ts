/**
 * DEL GUION AL PEDIDO DEL BRAZO · puro. Lo que el brazo (`POST /api/video/generate`) acepta: `prompt`, `formato` (reel · short · tiktok · video), `segundos`, `resolucion`,
 * `fotos` (direcciones https de fotos PROPIAS del cliente, ≤ 9) y `clave` (idempotencia: `<encargo>:<brief>:v<versión del guion>`). Nada aquí llama a la red.
 */
import { DURACION_MIN_S, MAX_FOTOS_DE_REFERENCIA, RELACION_POR_FORMATO, RESOLUCION_APROBADA, armarPedido } from '../../video/parametros'
import type { BriefLeido } from '../brief'
import type { FotoEtiquetada } from '../fotos'
import { promptDelGuion, type TraduccionDeGuion } from './guion'

/** ¿este brief es de video? (reel · short · video · tiktok); un carrusel, un kit o una imagen no lo son aunque nombren «video» de paso */
export const esVideo = (b: Pick<BriefLeido, 'formato' | 'que_es'>): boolean => /\b(reel|short|video|tiktok)\b/i.test(b.formato) && !/carrusel|carousel|kit|imagen fija/i.test(b.formato)

/** el formato que entiende el brazo (`RELACION_POR_FORMATO`): reel · short · tiktok · video */
export function formatoDeVideo(b: Pick<BriefLeido, 'formato' | 'red'>): keyof typeof RELACION_POR_FORMATO {
  const f = b.formato.toLowerCase()
  if (/reel/.test(f)) return 'reel'
  if (/short/.test(f)) return 'short'
  if (/tiktok/.test(f) || /tiktok/i.test(b.red)) return 'tiktok'
  return 'video'
}

/** el formato de la tabla de entrega (`oficina_entrega_formatos`): el de tiktok se llama «video» ahí */
export const formatoDeEntrega = (formato: string): string => (formato === 'tiktok' ? 'video' : formato)

export interface PedidoDeVideoDeLaOficina {
  prompt: string
  formato: string
  segundos: number
  resolucion: string
  relacion: string
  audio: true
  /** direcciones https de las fotos propias de referencia (en el orden de los planos) */
  fotos: string[]
  /** ids de fotos que el guion nombró y no existen entre las propias del cliente: se declaran, no se inventan */
  fotos_no_halladas: string[]
  clave: string
  prompt_recortado: boolean
}

export function armarPedidoDeLaOficina(o: { guion: TraduccionDeGuion; brief: Pick<BriefLeido, 'formato' | 'red'>; fotos: FotoEtiquetada[]; clave: string; resolucion?: string }): { ok: true; pedido: PedidoDeVideoDeLaOficina } | { ok: false; errores: string[] } {
  const formato = formatoDeVideo(o.brief)
  const propias = new Map(o.fotos.filter((f) => (f.origen ?? 'propia') === 'propia' && f.url && /^https:\/\/\S+$/.test(f.url)).map((f) => [f.id, f.url as string]))
  const urls: string[] = []
  const noHalladas: string[] = []
  for (const id of o.guion.fotos_ids) { const u = propias.get(id); if (u) { if (!urls.includes(u)) urls.push(u) } else noHalladas.push(id) }
  const { prompt, recortado } = promptDelGuion(o.guion)
  const entrada = { prompt, formato, segundos: o.guion.segundos, resolucion: o.resolucion ?? RESOLUCION_APROBADA, audio: true, fotos: urls.slice(0, MAX_FOTOS_DE_REFERENCIA) }
  const v = armarPedido(entrada)
  if (!v.ok) return { ok: false, errores: v.errores }
  return { ok: true, pedido: { prompt: v.pedido.prompt, formato: v.pedido.formato, segundos: v.pedido.segundos, resolucion: v.pedido.resolucion, relacion: v.pedido.relacion, audio: true, fotos: v.pedido.fotos, fotos_no_halladas: noHalladas, clave: o.clave, prompt_recortado: recortado } }
}

/** 11-nov · el texto de los pedidos de COTIZACIÓN: nunca se filma (la cotización usa `dry_run` del brazo, que solo estima) */
export const PROMPT_DE_COTIZACION = 'Cotización previa de la sala de video: con este texto no se filma nada.'

/**
 * 11-nov · GO Lenovo 02:52Z · «cotizar primero»: antes de llamar a la mesa, los pedidos que se cotizan GRATIS, uno por cada ruta que el guion puede usar:
 * solo texto siempre; y con foto propia si el cliente tiene alguna (el guion las nombra en «Foto:» y el pedido va por la ruta de referencia).
 * La duración es la MÍNIMA aprobada: si ni el video más corto cabe en el tope, ninguno cabrá; uno más largo lo vuelve a medir el brazo al enviar. Puro.
 */
export function pedidosParaCotizar(o: { brief: Pick<BriefLeido, 'formato' | 'red'>; fotos: FotoEtiquetada[]; clave: string; resolucion?: string }): { ok: true; pedidos: Array<{ ruta: 'texto' | 'foto'; pedido: PedidoDeVideoDeLaOficina }> } | { ok: false; errores: string[] } {
  const formato = formatoDeVideo(o.brief)
  const foto = o.fotos.find((f) => (f.origen ?? 'propia') === 'propia' && f.url && /^https:\/\/\S+$/.test(f.url))?.url
  const rutas: Array<{ ruta: 'texto' | 'foto'; fotos: string[] }> = [{ ruta: 'texto', fotos: [] }, ...(foto ? [{ ruta: 'foto' as const, fotos: [foto] }] : [])]
  const pedidos: Array<{ ruta: 'texto' | 'foto'; pedido: PedidoDeVideoDeLaOficina }> = []
  for (const r of rutas) {
    const v = armarPedido({ prompt: PROMPT_DE_COTIZACION, formato, segundos: DURACION_MIN_S, resolucion: o.resolucion ?? RESOLUCION_APROBADA, audio: true, fotos: r.fotos })
    if (!v.ok) return { ok: false, errores: v.errores }
    pedidos.push({ ruta: r.ruta, pedido: { prompt: v.pedido.prompt, formato: v.pedido.formato, segundos: v.pedido.segundos, resolucion: v.pedido.resolucion, relacion: v.pedido.relacion, audio: true, fotos: v.pedido.fotos, fotos_no_halladas: [], clave: `${o.clave}:cotizar:${r.ruta}`, prompt_recortado: false } })
  }
  return { ok: true, pedidos }
}
