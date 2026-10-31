/**
 * DEL GUION AL PEDIDO DEL BRAZO · puro. Lo que el brazo (`POST /api/video/generate`) acepta: `prompt`, `formato` (reel · short · tiktok · video), `segundos`, `resolucion`,
 * `fotos` (direcciones https de fotos PROPIAS del cliente, ≤ 9) y `clave` (idempotencia: `<encargo>:<brief>:v<versión del guion>`). Nada aquí llama a la red.
 */
import { MAX_FOTOS_DE_REFERENCIA, RELACION_POR_FORMATO, RESOLUCION_APROBADA, armarPedido } from '../../video/parametros'
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
