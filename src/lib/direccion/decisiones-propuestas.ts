/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · la fuente «Propuestas» de `GET /api/direccion/decisiones`: los encargos de video parados en la aprobación del dueño.
 * La marca es un turno del dueño abierto (lo lee la oficina: `oficina/video/propuestas-pendientes.ts`; sin tabla nueva). Contrato: ADENDA 1, 2 y 3 de
 * `2026-11-16-RESPUESTA-CC1-a-CC2-CC3-CC5-sprint2-hoja-fase-y-propuestas.md` (la tarjeta de CC5).
 *  · `imagen_url` / `imagenes` por plano salen de `imagenes_clave.propuestas[i].planos[n]` (CC2); `video_url` de `borrador_video.propuestas[i]` (CC3). Lo que todavía no existe va `null` / `[]`.
 *  · `costo.borrador_usd` = lo que declaran esos dos artefactos para la propuesta (null si ninguno lo dice). `costo.final_usd` = null mientras el brazo no dé una estimación: no se adivina.
 * Pura: arma lo que muestra la tarjeta con el estado del motor del encargo.
 */
import { esObjeto, texto, type Fila } from './comun'
import { FUNCION_APROBAR_PROPUESTAS, quedanVueltas } from '../oficina/video/aprobacion'
import type { Paso } from '../oficina/tipos'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type ClaseDeImagen } from '../oficina/mesa/propuestas-imagen'
export const TITULO_PROPUESTAS = 'Propuestas del video: elige una'
export const PARA_QUE_PROPUESTAS = 'Eliges el video antes de fabricarlo: la propuesta que apruebes es la que se produce en calidad final, sin otra parada.'
export const PARA_QUE_CORTO_PROPUESTAS = 'elegir el video'
export const DESTRABA_PROPUESTAS = 'Al aprobar se fabrica la propuesta elegida (imagen final, clips y lo demás) dentro del tope del encargo. Si pides cambios, la mesa corrige y vuelve a presentar.'
export const DESTRABA_CORTO_PROPUESTAS = 'fabricar el video'
/** «Decisivo» de la tarjeta (pedido de CC5 en su ADENDA 1 de campos) */
export const CRITICOS_PROPUESTAS = ['Solo lo que apruebes se fabrica, en máxima calidad']
/** 17-nov · propuestas también en IMAGEN (contrato CC5 v1 §2): los textos de la decisión cuando la pieza es imagen (kit · carrusel · foto) */
export const TITULO_PROPUESTAS_IMAGEN = 'Propuestas de la pieza: elige una'
export const PARA_QUE_PROPUESTAS_IMAGEN = 'Eliges la pieza antes de fabricarla: la propuesta que apruebes es la que se produce en calidad final, sin otra parada.'
export const PARA_QUE_CORTO_PROPUESTAS_IMAGEN = 'elegir la pieza'
export const DESTRABA_PROPUESTAS_IMAGEN = 'Al aprobar se fabrica la propuesta elegida en calidad final dentro del tope del encargo. Si pides cambios, la mesa corrige y vuelve a presentar.'
export const DESTRABA_CORTO_PROPUESTAS_IMAGEN = 'fabricar la pieza'
export const COSTO_NOTA_PROPUESTAS = 'aprobar fabrica la elegida dentro del tope ya fijado del encargo; pedir cambios vuelve a correr la mesa y los borradores dentro del mismo tope'

/** en imagen (contrato §2) cada lámina viaja como un plano: `desde`/`hasta`/`producto`/`dice` van null y `foto_propia` dice si es la foto del cliente */
export interface PlanoDeLaTarjeta { n: number; desde: number | null; hasta: number | null; foto_propia?: boolean | null; rol: string | null; dice: string | null; se_ve: string; texto_en_pantalla: string | null; producto: boolean | null; imagen_url: string | null; imagenes: string[] }
/** lo que la mesa no escribió va `null` (nunca 0 ni texto vacío: la tarjeta lo muestra con guion rojo · pedido de CC5) */
export interface PropuestaDeLaTarjeta { id: string; nombre: string; concepto: string | null; segundos: number | null; red: string | null; objetivo: string | null; por_que: string | null; video_url: string | null; costo: { borrador_usd: number | null; final_usd: number | null } | null; planos: PlanoDeLaTarjeta[] }
export interface TextoDeLaPublicacion { texto_base: string | null; pie_de_foto: string | null; hashtags: string[]; llamado: string | null }
/** `familia`/`clase` solo en imagen (ausente = video, como hasta hoy); `texto_de_la_publicacion` por propuesta solo en imagen */
export interface PropuestasDeLaDecision { encargo_id: string; brief_id: string; ronda: number; quedan_vueltas: number; avisos: string[]; lista: Array<PropuestaDeLaTarjeta & { texto_de_la_publicacion?: TextoDeLaPublicacion | null }>; familia?: 'imagen'; clase?: ClaseDeImagen }

const lista = (x: unknown): Fila[] => (Array.isArray(x) ? x.filter(esObjeto) : [])
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const positivo = (x: unknown): number | null => { const n = num(x); return n !== null && n > 0 ? n : null }
const url = (x: unknown): string | null => (typeof x === 'string' && /^https?:\/\//i.test(x.trim()) ? x.trim() : null)
const datosDe = (motor: Fila, tipo: string): Fila | null => { const a = esObjeto(motor.artefactos) ? motor.artefactos[tipo] : null; return esObjeto(a) && esObjeto(a.datos) ? a.datos : null }
/** la propuesta de un artefacto por su id («P1»…); si el artefacto no trae ids, por su lugar */
const deLaPropuesta = (filas: Fila[], id: string, i: number): Fila | null => filas.find((f) => f.id === id) ?? (filas.every((f) => f.id === undefined) ? filas[i] ?? null : null)

/** arma lo que muestra la tarjeta. Pura: recibe el estado del motor y los pasos de la plantilla */
export function propuestasDeLaDecision(enc: { id: string; brief_id: string }, motor: Fila, pasos: Fila[] | null): PropuestasDeLaDecision | null {
  const pv = datosDe(motor, 'propuestas_video')
  const props = lista(pv?.propuestas)
  if (!pv || !props.length) return propuestasDeImagenDeLaDecision(enc, motor, pasos)
  const ik = lista(datosDe(motor, 'imagenes_clave')?.propuestas)
  const bv = lista(datosDe(motor, 'borrador_video')?.propuestas)
  const paso = pasos?.find((p) => p.tipo === 'codigo' && p.funcion === FUNCION_APROBAR_PROPUESTAS)
  // corrección de CC6: la MISMA regla que el motor (`quedanVueltas`): sin `vuelve_a` o sin plantilla legible, 0 (la tarjeta no ofrece «Pedir cambios» que terminaría en 409 `sin_vueltas`)
  const vueltas = esObjeto(motor.vueltas) ? (motor.vueltas as Record<string, number>) : {}
  const quedan = quedanVueltas({ vueltas }, paso as unknown as Pick<Paso, 'clave' | 'vuelve_a'> | undefined)
  const listaT = props.map((p, i): PropuestaDeLaTarjeta => {
    const id = String(p.id ?? `P${i + 1}`)
    const img = deLaPropuesta(ik, id, i), vid = deLaPropuesta(bv, id, i)
    const planosImg = lista(img?.planos)
    const g = esObjeto(p.guion) ? p.guion : {}
    const planos = lista(g.planos).map((pl): PlanoDeLaTarjeta => {
      const n = Number(pl.n)
      const pi = planosImg.find((x) => Number(x.n) === n) ?? null
      const imagenes = (Array.isArray(pi?.imagenes) ? pi.imagenes : []).map(url).filter((u): u is string => !!u)
      const primera = url(pi?.url) ?? imagenes[0] ?? null
      return { n, desde: Number(pl.desde), hasta: Number(pl.hasta), rol: texto(pl.rol), dice: texto(pl.dice), se_ve: String(pl.se_ve ?? ''), texto_en_pantalla: texto(pl.texto_en_pantalla), producto: typeof pl.producto === 'boolean' ? pl.producto : null, imagen_url: primera, imagenes: imagenes.length ? imagenes : primera ? [primera] : [] }
    })
    const ci = num(img?.costo_usd), cv = num(vid?.costo_usd)
    const borrador = ci === null && cv === null ? null : Math.round(((ci ?? 0) + (cv ?? 0)) * 10000) / 10000
    return { id, nombre: texto(p.nombre) ?? id, concepto: texto(p.concepto), segundos: positivo(p.segundos) ?? positivo(g.segundos), red: texto(p.red), objetivo: texto(p.objetivo), por_que: texto(p.por_que), video_url: url(vid?.url), costo: { borrador_usd: borrador, final_usd: null }, planos }
  })
  const avisos = (Array.isArray(pv.avisos) ? pv.avisos : []).filter((a): a is string => typeof a === 'string')
  return { encargo_id: enc.id, brief_id: enc.brief_id, ronda: num(pv.ronda) ?? 1, quedan_vueltas: quedan, avisos, lista: listaT }
}

const CLASES: readonly ClaseDeImagen[] = ['kit', 'carrusel', 'post_img']
/** las vueltas que le quedan al dueño: la MISMA regla que el motor (`quedanVueltas` · corrección de CC6 en video) */
function vueltasQueQuedan(motor: Fila, pasos: Fila[] | null): number {
  const paso = pasos?.find((p) => p.tipo === 'codigo' && p.funcion === FUNCION_APROBAR_PROPUESTAS)
  const vueltas = esObjeto(motor.vueltas) ? (motor.vueltas as Record<string, number>) : {}
  return quedanVueltas({ vueltas }, paso as unknown as Pick<Paso, 'clave' | 'vuelve_a'> | undefined)
}

/**
 * 17-nov · propuestas también en IMAGEN (contrato CC5 v1 §2): la tarjeta con `propuestas_imagen` (el motor) y `borrador_imagen` (las láminas en borrador).
 * Cada lámina viaja como un plano (`desde`/`hasta`/`producto`/`dice` null); `texto_en_pantalla` = eyebrow, headline, body y cta sin vacíos, unidos con salto;
 * `imagenes` = [png_url] si existe, si no [imagen_url], si no []; `foto_propia` = la foto es del cliente. Lo que no existe va null: nada se inventa.
 */
export function propuestasDeImagenDeLaDecision(enc: { id: string; brief_id: string }, motor: Fila, pasos: Fila[] | null): PropuestasDeLaDecision | null {
  const pi = datosDe(motor, ARTEFACTO_PROPUESTAS_IMAGEN)
  const props = lista(pi?.propuestas)
  if (!pi || !props.length) return null
  const bi = lista(datosDe(motor, 'borrador_imagen')?.propuestas)
  const clase = CLASES.includes(pi.clase as ClaseDeImagen) ? (pi.clase as ClaseDeImagen) : undefined
  const listaT = props.map((p, i) => {
    const id = String(p.id ?? `P${i + 1}`)
    const b = deLaPropuesta(bi, id, i)
    const laminasB = lista(b?.laminas)
    const planos = lista(p.laminas).map((l): PlanoDeLaTarjeta => {
      const n = Number(l.n)
      const lb = laminasB.find((x) => Number(x.n) === n) ?? null
      const png = url(lb?.png_url), img = url(lb?.imagen_url)
      const imagenes = png ? [png] : img ? [img] : []
      const textos = ['eyebrow', 'headline', 'body', 'cta'].map((k) => texto(l[k])).filter((x): x is string => !!x)
      const foto = esObjeto(l.foto) ? l.foto : null
      return { n, desde: null, hasta: null, foto_propia: foto ? foto.origen === 'real' : null, rol: texto(l.rol), dice: null, se_ve: String(l.se_ve ?? ''), texto_en_pantalla: textos.length ? textos.join('\n') : null, producto: null, imagen_url: imagenes[0] ?? null, imagenes }
    })
    const c = esObjeto(p.copy) ? p.copy : null
    const hashtags = Array.isArray(c?.hashtags) ? c.hashtags.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
    const publicacion: TextoDeLaPublicacion | null = c ? { texto_base: texto(c.texto_base), pie_de_foto: texto(c.pie_de_foto), hashtags, llamado: texto(c.llamado) } : null
    return { id, nombre: texto(p.nombre) ?? id, concepto: texto(p.concepto), segundos: null, red: texto(p.red), objetivo: texto(p.objetivo), por_que: texto(p.por_que), video_url: null, costo: { borrador_usd: num(b?.costo_usd), final_usd: null }, planos, texto_de_la_publicacion: publicacion }
  })
  const avisos = (Array.isArray(pi.avisos) ? pi.avisos : []).filter((a): a is string => typeof a === 'string')
  return { encargo_id: enc.id, brief_id: enc.brief_id, ronda: num(pi.ronda) ?? 1, quedan_vueltas: vueltasQueQuedan(motor, pasos), avisos, lista: listaT, familia: 'imagen', ...(clase ? { clase } : {}) }
}
