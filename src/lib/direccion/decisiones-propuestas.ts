/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · la fuente «Propuestas» de `GET /api/direccion/decisiones`: los encargos de video parados en la aprobación del dueño.
 * La marca es un turno del dueño abierto (lo lee la oficina: `oficina/video/propuestas-pendientes.ts`; sin tabla nueva). Contrato: ADENDA 1, 2 y 3 de
 * `2026-11-16-RESPUESTA-CC1-a-CC2-CC3-CC5-sprint2-hoja-fase-y-propuestas.md` (la tarjeta de CC5).
 *  · `imagen_url` / `imagenes` por plano salen de `imagenes_clave.propuestas[i].planos[n]` (CC2); `video_url` de `borrador_video.propuestas[i]` (CC3). Lo que todavía no existe va `null` / `[]`.
 *  · `costo.borrador_usd` = lo que declaran esos dos artefactos para la propuesta (null si ninguno lo dice). `costo.final_usd` = null mientras el brazo no dé una estimación: no se adivina.
 * Pura: arma lo que muestra la tarjeta con el estado del motor del encargo.
 */
import { esObjeto, texto, type Fila } from './comun'
import { FUNCION_APROBAR_PROPUESTAS } from '../oficina/video/aprobacion'
export const TITULO_PROPUESTAS = 'Propuestas del video: elige una'
export const PARA_QUE_PROPUESTAS = 'Eliges el video antes de fabricarlo: la propuesta que apruebes es la que se produce en calidad final, sin otra parada.'
export const PARA_QUE_CORTO_PROPUESTAS = 'elegir el video'
export const DESTRABA_PROPUESTAS = 'Al aprobar se fabrica la propuesta elegida (imagen final, clips y lo demás) dentro del tope del encargo. Si pides cambios, la mesa corrige y vuelve a presentar.'
export const DESTRABA_CORTO_PROPUESTAS = 'fabricar el video'
/** «Decisivo» de la tarjeta (pedido de CC5 en su ADENDA 1 de campos) */
export const CRITICOS_PROPUESTAS = ['Solo lo que apruebes se fabrica, en máxima calidad']
export const COSTO_NOTA_PROPUESTAS = 'aprobar fabrica la elegida dentro del tope ya fijado del encargo; pedir cambios vuelve a correr la mesa y los borradores dentro del mismo tope'
/** las vueltas por omisión del paso, si la plantilla no dice `max` (contrato §2) */
const VUELTAS_POR_OMISION = 3

export interface PlanoDeLaTarjeta { n: number; desde: number; hasta: number; rol: string | null; dice: string | null; se_ve: string; texto_en_pantalla: string | null; producto: boolean | null; imagen_url: string | null; imagenes: string[] }
/** lo que la mesa no escribió va `null` (nunca 0 ni texto vacío: la tarjeta lo muestra con guion rojo · pedido de CC5) */
export interface PropuestaDeLaTarjeta { id: string; nombre: string; concepto: string | null; segundos: number | null; red: string | null; objetivo: string | null; por_que: string | null; video_url: string | null; costo: { borrador_usd: number | null; final_usd: number | null } | null; planos: PlanoDeLaTarjeta[] }
export interface PropuestasDeLaDecision { encargo_id: string; brief_id: string; ronda: number; quedan_vueltas: number; avisos: string[]; lista: PropuestaDeLaTarjeta[] }

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
  if (!pv || !props.length) return null
  const ik = lista(datosDe(motor, 'imagenes_clave')?.propuestas)
  const bv = lista(datosDe(motor, 'borrador_video')?.propuestas)
  const paso = pasos?.find((p) => p.tipo === 'codigo' && p.funcion === FUNCION_APROBAR_PROPUESTAS)
  const va = paso && esObjeto(paso.vuelve_a) ? paso.vuelve_a : null
  const max = num(va?.max) ?? VUELTAS_POR_OMISION
  const hechas = num((esObjeto(motor.vueltas) ? motor.vueltas : {})[String(paso?.clave ?? '')]) ?? 0
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
  return { encargo_id: enc.id, brief_id: enc.brief_id, ronda: num(pv.ronda) ?? 1, quedan_vueltas: Math.max(0, max - hechas), avisos, lista: listaT }
}
