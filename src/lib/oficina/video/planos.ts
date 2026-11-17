/**
 * VIDEO PLANO POR PLANO · 11-nov · GO Lenovo 16:43 (decisión de Emilio 16:41, camino B: «primero saquemos material premium sin ver el dinero»).
 * Del guion de la mesa → UN pedido por plano: con su foto propia (imagen a video) o, si el plano no tiene foto, desde su texto. Cada plano dura lo que pide
 * el guion; si pide menos que el mínimo del proveedor (4 s), se genera de 4 s y al unir se corta a lo que pide el guion (`cortar_a_s`). Genérico: cualquier
 * cliente, cualquier cantidad de planos. Puro: sin base, sin red, sin modelo.
 */
import { createHash } from 'node:crypto'
import { RESOLUCION_APROBADA, armarPedidoDePlano, fichaPorOmision, type CatalogoDeModelos } from '../../video/parametros'
import type { BriefLeido } from '../brief'
import type { FotoEtiquetada } from '../fotos'
import { buscarFotoPropia, formatoDeVideo, fotosPropiasConDireccion } from './pedido'
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
  /** 17-nov · S2-4 · de dónde sale el primer cuadro del clip: su imagen clave final (#1072/#1076), la foto propia del plano o solo el texto */
  primer_cuadro: 'imagen_clave' | 'foto_propia' | 'texto'
  /**
   * 17-nov · S2-4 tramo 3 · la HUELLA del contenido del clip: lo que decide qué genera el proveedor (el primer cuadro ORIGINAL —antes del encuadre—, el texto, el formato,
   * los segundos, la resolución, la proporción y el audio). Mismo contenido = misma huella, en este encargo o en otro del mismo cliente: un clip ya pagado se reutiliza.
   */
  huella: string
  /** 17-nov · S2-4 tramo 4 · el plano es del BORRADOR de esta propuesta («P1»…): el lote se une por propuesta */
  propuesta?: string
}

/** la huella del contenido de un clip (ver `PedidoDePlano.huella`) · el cliente no entra: la búsqueda en el libro ya filtra por cliente */
export function huellaDelClip(c: { fuente: string | null; prompt: string; formato: string; segundos: number; resolucion: string; relacion: string; audio: boolean }): string {
  return createHash('sha256').update(JSON.stringify(['clip.v1', c.fuente, c.prompt, c.formato, c.segundos, c.resolucion, c.relacion, c.audio])).digest('hex').slice(0, 40)
}

/** la imagen clave de un plano tal como la deja el paso `imagenes_clave` (solo hace falta su primer cuadro) */
export interface PrimerCuadro { n: number; url: string }

/** cuánto dura un plano en el guion (entero ≥ 1) */
export const duracionDelPlano = (p: Pick<Plano, 'desde' | 'hasta'>): number => Math.max(1, Math.round(p.hasta - p.desde))

/**
 * el texto de UN plano para el modelo: lo que se ve, la cámara y el audio del video entero (para que los clips suenen parecido).
 * 17-nov · S2-5 (aviso de CC2) · el texto en pantalla NO va al modelo: se compone después, por código, con la marca (la regla fija del pedido dice «sin texto en pantalla»).
 */
export function promptDelPlano(p: Plano, audio: string, max = 3600): string {
  const t = [
    p.se_ve,
    p.movimiento ? `Cámara: ${p.movimiento}.` : '',
    audio ? `Audio: ${audio}` : 'Audio: música o sonido ambiente acorde a la escena.',
  ].filter(Boolean).join(' ')
  return t.slice(0, max)
}

/**
 * 17-nov · S2-4 · el texto del CLIP cuando arranca de su imagen clave: el «Prompt de video» de la hoja (S2-1: solo movimiento y cámara, el proceso de la acción
 * y su estado final; lo que se ve ya está en el cuadro) + el audio del video entero. Sin ese campo, el de siempre (`promptDelPlano`).
 */
export function promptDelClip(p: Plano, audio: string, max = 3600): string {
  const pv = typeof p.prompt_video === 'string' ? p.prompt_video.trim() : ''
  if (!pv) return promptDelPlano(p, audio, max)
  return [pv, audio ? `Audio: ${audio}` : 'Audio: música o sonido ambiente acorde a la escena.'].join(' ').slice(0, max)
}

/** el buscador de fotos por omisión: el MISMO del pedido de una toma (#1047 · id exacto o nombre corto que empieza una sola foto propia; uno ambiguo no se adivina) */
export function buscadorDeFotos(fotos: FotoEtiquetada[]): (id: string) => string | null {
  const propias = fotosPropiasConDireccion(fotos)
  return (id) => { const h = buscarFotoPropia(id, propias); return h && 'url' in h ? h.url : null }
}

export function pedidosPorPlano(o: {
  guion: Pick<TraduccionDeGuion, 'planos' | 'audio'>
  brief: Pick<BriefLeido, 'formato' | 'red'>
  fotos: FotoEtiquetada[]
  clave: string
  resolucion?: string
  relacion?: string
  /** cómo se halla la dirección de una foto citada por el guion · por omisión, el de #1047 (exacto o nombre corto único) */
  buscarFoto?: (id: string) => string | null
  /** 17-nov · S2-4 · las imágenes clave FINALES vigentes: la de cada plano es el primer cuadro de su clip (manda sobre la foto propia, que ya fue su referencia) */
  imagenesClave?: PrimerCuadro[]
  /** 17-nov · T1 · el catálogo de modelos que leyó el encargo al abrir (el MISMO que valida la ruta); sin él, el del código */
  catalogo?: CatalogoDeModelos
}): { ok: true; pedidos: PedidoDePlano[] } | { ok: false; errores: string[] } {
  const ficha = fichaPorOmision(o.catalogo)
  const planos = [...(o.guion.planos ?? [])].sort((a, b) => a.n - b.n || a.desde - b.desde)
  if (!planos.length) return { ok: false, errores: ['el guion no tiene planos'] }
  const buscar = o.buscarFoto ?? buscadorDeFotos(o.fotos)
  const formato = formatoDeVideo(o.brief)
  const errores: string[] = []
  const pedidos: PedidoDePlano[] = []
  for (const p of planos) {
    const dura = duracionDelPlano(p)
    if (dura > ficha.segundos_max) { errores.push(`el plano ${p.n} dura ${dura} s y el modelo admite hasta ${ficha.segundos_max} s por plano`); continue }
    const ic = (o.imagenesClave ?? []).find((x) => x.n === p.n && typeof x.url === 'string' && x.url.trim() !== '')
    const url = ic ? ic.url : p.foto_id ? buscar(p.foto_id) : null
    const primer_cuadro: PedidoDePlano['primer_cuadro'] = ic ? 'imagen_clave' : url ? 'foto_propia' : 'texto'
    const v = armarPedidoDePlano({ prompt: ic ? promptDelClip(p, o.guion.audio) : promptDelPlano(p, o.guion.audio), formato, segundos: Math.max(ficha.segundos_min, dura), resolucion: o.resolucion ?? RESOLUCION_APROBADA, ...(o.relacion ? { relacion: o.relacion } : {}), audio: true, fotos: url ? [url] : [] }, o.catalogo)
    if (!v.ok) { errores.push(...v.errores.map((e) => `plano ${p.n}: ${e}`)); continue }
    pedidos.push({ n: p.n, prompt: v.pedido.prompt, formato: v.pedido.formato, segundos: v.pedido.segundos, cortar_a_s: dura, resolucion: v.pedido.resolucion, relacion: v.pedido.relacion, audio: true, fotos: v.pedido.fotos, foto_no_hallada: p.foto_id && !url && !ic ? p.foto_id : null, plano: true, clave: `${o.clave}:p${p.n}`, primer_cuadro, huella: huellaDelClip({ fuente: url, prompt: v.pedido.prompt, formato: v.pedido.formato, segundos: v.pedido.segundos, resolucion: v.pedido.resolucion, relacion: v.pedido.relacion, audio: v.pedido.audio === true }) })
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedidos }
}

/** lo que se generará en total (segundos pedidos al proveedor) y lo que durará el video unido · para cotizar la suma contra el tope */
export const segundosGenerados = (ps: Pick<PedidoDePlano, 'segundos'>[]) => ps.reduce((s, p) => s + p.segundos, 0)
export const segundosDelVideoUnido = (ps: Pick<PedidoDePlano, 'cortar_a_s'>[]) => ps.reduce((s, p) => s + p.cortar_a_s, 0)
