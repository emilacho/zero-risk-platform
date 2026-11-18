/**
 * EL VIDEO COMPUESTO CON LA MARCA · lo PURO · Sprint 3 · T5 tramo 3 (CC4 · RESPUESTA-LENOVO 17-nov: «A, lo cableas tú» · US$ 0).
 *
 * Después de unir los clips, el video unido pasa por el servicio de render con la plantilla `htmlDeVideo` (S2-5 · CC2), que le dibuja
 * por código: el texto de cada plano, el cierre con la marca y, si la mesa los pidió, los subtítulos palabra por palabra. Aquí solo se arma
 * el pedido (sin red, sin base):
 *  · los segundos de cada texto salen de los CORTES REALES (la suma de `cortar_a_s` en el orden del guion), no de lo que pedía el guion;
 *  · el cierre lleva el logo (o la firma) y el diseño de la marca; su texto es el del último plano si ese plano es el llamado o la conclusión
 *    (entonces ese texto no se repite encima del plano: va una sola vez, en el cierre). Sin logo ni firma no hay cierre, y se avisa;
 *  · los subtítulos van solo si la mesa los pidió (sin rejas) y solo si la transcripción no falló (nunca se inventan).
 * Agnóstico: no sabe de rubros ni de clientes.
 */
import { NOMBRE_DE_VIDEO, SEGUNDOS_DE_CIERRE, type CierreDelVideo, type GrupoDeSubtitulo, type PedidoDeVideoCompuesto, type TextoDelPlano } from '../../../../packages/carousel-engine/src/video-html'
import type { DisenoDeAnuncio, TextoDeAnuncio } from '../../../../packages/carousel-engine/src/anuncio'

/** el lado corto del video según su resolución (el mismo que usa el unidor) */
export const LADO_CORTO: Record<string, number> = { '480p': 480, '720p': 720, '1080p': 1080 }

/** ancho × alto del video unido a partir de la proporción («9:16», «1:1», «16:9»…) y la resolución · pares (los códecs lo piden) */
export function medidasDelVideo(relacion: string, resolucion: string): { ancho: number; alto: number } {
  const corto = LADO_CORTO[resolucion.toLowerCase()] ?? 720
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(relacion.trim())
  const [a, b] = m ? [Number(m[1]), Number(m[2])] : [9, 16]
  const par = (x: number) => Math.round(x / 2) * 2
  if (!a || !b || a === b) return { ancho: corto, alto: corto }
  return a < b ? { ancho: corto, alto: par((corto * b) / a) } : { ancho: par((corto * a) / b), alto: corto }
}

/** los roles del plano que son el remate: su texto va en el cierre con la marca */
const ROLES_DEL_CIERRE = new Set(['llamado', 'conclusion'])

export interface PlanoParaComponer { n: number; texto_en_pantalla?: string; rol?: string }
export interface ClipParaComponer { n: number; cortar_a_s: number }

export interface EntradaDelVideoCompuesto {
  planos: PlanoParaComponer[]
  /** los clips TAL COMO SE UNIERON (en ese orden, con su corte) */
  clips: ClipParaComponer[]
  relacion: string
  resolucion: string
  /** el nombre del video unido en la carpeta del render */
  nombre_del_video: string
  /** el logo como data URI, o null */
  logo: string | null
  /** el nombre o el usuario de la marca (va solo si no hay logo) */
  firma: string | null
  diseno: DisenoDeAnuncio | null
  /** los grupos de subtítulos (ya agrupados) · null = no van */
  subtitulos: GrupoDeSubtitulo[] | null
  con_audio?: boolean
}

export type VideoCompuestoArmado =
  | { ok: true; pedido: PedidoDeVideoCompuesto; textos: number; con_cierre: boolean; avisos: string[] }
  | { ok: false; motivo: string }

const redondo = (x: number) => Math.round(x * 1000) / 1000

/** arma el pedido de `htmlDeVideo` · sin diseño de marca no se compone (el video unido sale como está) */
export function armarVideoCompuesto(x: EntradaDelVideoCompuesto): VideoCompuestoArmado {
  if (!x.diseno) return { ok: false, motivo: 'el cliente no tiene identidad visual legible en el manual: el video sale sin textos ni cierre de la marca' }
  if (!NOMBRE_DE_VIDEO.test(x.nombre_del_video)) return { ok: false, motivo: `nombre de video no válido para el render: «${x.nombre_del_video.slice(0, 90)}»` }
  const clips = x.clips.filter((c) => Number.isFinite(c.cortar_a_s) && c.cortar_a_s > 0)
  if (!clips.length) return { ok: false, motivo: 'no hay clips con segundos para componer' }
  const segundos = redondo(clips.reduce((s, c) => s + c.cortar_a_s, 0))
  const avisos: string[] = []
  const porN = new Map(x.planos.map((p) => [p.n, p]))
  const ultimo = porN.get(clips[clips.length - 1].n)
  const textoDelUltimo = (ultimo?.texto_en_pantalla ?? '').trim()
  const remateEnElCierre = !!textoDelUltimo && ROLES_DEL_CIERRE.has((ultimo?.rol ?? '').trim().toLowerCase())
  const marca = !!(x.logo || (x.firma ?? '').trim())
  const textos: TextoDelPlano[] = []
  let t = 0
  for (const [i, c] of clips.entries()) {
    const desde = redondo(t)
    t += c.cortar_a_s
    const p = porN.get(c.n)
    const texto = (p?.texto_en_pantalla ?? '').trim()
    // el remate va una sola vez: en el cierre (si hay cierre)
    if (!texto || (marca && remateEnElCierre && i === clips.length - 1)) continue
    textos.push({ desde, hasta: redondo(t), texto })
  }
  let cierre: CierreDelVideo | null = null
  if (marca) {
    const texto: TextoDeAnuncio = remateEnElCierre ? { titular: textoDelUltimo } : {}
    cierre = { ...texto, desde: redondo(Math.max(0, segundos - SEGUNDOS_DE_CIERRE)) }
  } else avisos.push('el manual no trae logo ni nombre de la marca: el video sale sin cierre de marca')
  const subtitulos = x.subtitulos?.length ? x.subtitulos : null
  const { ancho, alto } = medidasDelVideo(x.relacion, x.resolucion)
  const pedido: PedidoDeVideoCompuesto = {
    ancho, alto, segundos, video: x.nombre_del_video,
    logo: x.logo, firma: x.logo ? null : (x.firma ?? '').trim() || null,
    diseno: x.diseno, textos, cierre,
    ...(x.con_audio === false ? { con_audio: false } : {}),
    ...(subtitulos ? { subtitulos } : {}),
  }
  return { ok: true, pedido, textos: textos.length, con_cierre: !!cierre, avisos }
}
