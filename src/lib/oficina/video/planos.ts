/**
 * VIDEO PLANO POR PLANO · 11-nov · GO Lenovo 16:43 (decisión de Emilio 16:41, camino B: «primero saquemos material premium sin ver el dinero»).
 * Del guion de la mesa → UN pedido por plano: con su foto propia (imagen a video) o, si el plano no tiene foto, desde su texto. Cada plano dura lo que pide
 * el guion; si pide menos que el mínimo del proveedor (4 s), se genera de 4 s y al unir se corta a lo que pide el guion (`cortar_a_s`). Genérico: cualquier
 * cliente, cualquier cantidad de planos. Puro: sin base, sin red, sin modelo.
 */
import { DURACION_MAX_PLANO_S, DURACION_MIN_PLANO_S, RESOLUCION_APROBADA, armarPedidoDePlano } from '../../video/parametros'
import type { BriefLeido } from '../brief'
import type { FotoEtiquetada } from '../fotos'
import { formatoDeVideo } from './pedido'
import type { Plano, TraduccionDeGuion } from './guion'

export interface PedidoDePlano {
  /** número del plano en el guion (el orden de la unión) */
  n: number
  prompt: string
  formato: string
  /** lo que se le pide al proveedor (4–30 s) */
  segundos: number
  /** lo que dura el plano en el guion: al unir, el clip se corta a esto (si es igual a `segundos`, no se corta) */
  cortar_a_s: number
  resolucion: string
  relacion: string
  audio: true
  /** la foto propia del plano (0 o 1): con foto va por imagen a video; la foto tiene que llegar ENCUADRADA a `relacion` (esa ruta no admite proporción) */
  fotos: string[]
  /** el id que citó el guion y no se halló entre las propias (el plano sale desde su texto) */
  foto_no_hallada: string | null
  plano: true
  /** clave idempotente del plano: `<clave del guion>:p<n>` */
  clave: string
}

/** cuánto dura un plano en el guion (entero ≥ 1) */
export const duracionDelPlano = (p: Pick<Plano, 'desde' | 'hasta'>): number => Math.max(1, Math.round(p.hasta - p.desde))

/** el texto de UN plano para el modelo: lo que se ve, la cámara, el texto literal y el audio del video entero (para que los clips suenen parecido) */
export function promptDelPlano(p: Plano, audio: string, max = 3600): string {
  const t = [
    p.se_ve,
    p.movimiento ? `Cámara: ${p.movimiento}.` : '',
    p.texto_en_pantalla ? `Texto en pantalla, literal: «${p.texto_en_pantalla}».` : '',
    audio ? `Audio: ${audio}` : 'Audio: música o sonido ambiente acorde a la escena.',
  ].filter(Boolean).join(' ')
  return t.slice(0, max)
}

/** el buscador de fotos por omisión: el id exacto entre las propias con dirección https · el de las fotos por nombre corto (CC4) lo reemplaza */
export function buscadorExacto(fotos: FotoEtiquetada[]): (id: string) => string | null {
  const propias = new Map(fotos.filter((f) => (f.origen ?? 'propia') === 'propia' && f.url && /^https:\/\/\S+$/.test(f.url)).map((f) => [f.id, f.url as string]))
  return (id) => propias.get(id) ?? null
}

export function pedidosPorPlano(o: {
  guion: Pick<TraduccionDeGuion, 'planos' | 'audio'>
  brief: Pick<BriefLeido, 'formato' | 'red'>
  fotos: FotoEtiquetada[]
  clave: string
  resolucion?: string
  relacion?: string
  /** cómo se halla la dirección de una foto citada por el guion · por omisión, el id exacto */
  buscarFoto?: (id: string) => string | null
}): { ok: true; pedidos: PedidoDePlano[] } | { ok: false; errores: string[] } {
  const planos = [...(o.guion.planos ?? [])].sort((a, b) => a.n - b.n || a.desde - b.desde)
  if (!planos.length) return { ok: false, errores: ['el guion no tiene planos'] }
  const buscar = o.buscarFoto ?? buscadorExacto(o.fotos)
  const formato = formatoDeVideo(o.brief)
  const errores: string[] = []
  const pedidos: PedidoDePlano[] = []
  for (const p of planos) {
    const dura = duracionDelPlano(p)
    if (dura > DURACION_MAX_PLANO_S) { errores.push(`el plano ${p.n} dura ${dura} s y el proveedor admite hasta ${DURACION_MAX_PLANO_S} s por plano`); continue }
    const url = p.foto_id ? buscar(p.foto_id) : null
    const v = armarPedidoDePlano({ prompt: promptDelPlano(p, o.guion.audio), formato, segundos: Math.max(DURACION_MIN_PLANO_S, dura), resolucion: o.resolucion ?? RESOLUCION_APROBADA, ...(o.relacion ? { relacion: o.relacion } : {}), audio: true, fotos: url ? [url] : [] })
    if (!v.ok) { errores.push(...v.errores.map((e) => `plano ${p.n}: ${e}`)); continue }
    pedidos.push({ n: p.n, prompt: v.pedido.prompt, formato: v.pedido.formato, segundos: v.pedido.segundos, cortar_a_s: dura, resolucion: v.pedido.resolucion, relacion: v.pedido.relacion, audio: true, fotos: v.pedido.fotos, foto_no_hallada: p.foto_id && !url ? p.foto_id : null, plano: true, clave: `${o.clave}:p${p.n}` })
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedidos }
}

/** lo que se generará en total (segundos pedidos al proveedor) y lo que durará el video unido · para cotizar la suma contra el tope */
export const segundosGenerados = (ps: Pick<PedidoDePlano, 'segundos'>[]) => ps.reduce((s, p) => s + p.segundos, 0)
export const segundosDelVideoUnido = (ps: Pick<PedidoDePlano, 'cortar_a_s'>[]) => ps.reduce((s, p) => s + p.cortar_a_s, 0)
