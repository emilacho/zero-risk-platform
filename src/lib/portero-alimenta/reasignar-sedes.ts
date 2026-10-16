/**
 * REASIGNAR A SU SEDE las fichas ya guardadas cuando el cliente asigna sus fuentes a sedes (`config.apify.fuentes_por_sede`).
 *  · NADA SE BORRA ni se pisa a mano: cada ficha que cambia de sede se VERSIONA (ficha nueva con `version_de`) y la anterior queda retirada con su motivo y su fecha;
 *  · IDEMPOTENTE: una ficha que ya está en su sede no se toca (correr dos veces no hace nada la segunda);
 *  · `dry_run` OBLIGATORIO: con true solo cuenta;
 *  · agnóstico: no sabe de ningún cliente; solo lee la asignación y las fichas.
 */
import { randomUUID } from 'node:crypto'
import type { Db } from './alimentar'
import { claveDeAlcance, datosDeSede, sedesDeFicha, sedesDeLaFuente, sufijoDeRef, tipoDeFuenteDeUnidad, type TipoDeFuente } from './sedes-fuentes'

type Fila = Record<string, unknown>
const obj = (x: unknown): Fila => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Fila) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** de qué tipo de fuente de sede es una ficha ya archivada (`null` = no pertenece a una sede: terceros, competencia, resumen, pedidos…) */
export function fuenteDeLaFicha(f: Fila): { tipo: TipoDeFuente; detalle: string | null } | null {
  const ref = txt(f.ref)
  const atributo = txt(f.atributo)
  let m = /^portero:([^:]+):/.exec(ref)
  if (m) {
    const fuente = m[1]
    // la cuenta de una red sale de la dirección de la ficha (instagram.com/<usuario>/…)
    const usuario = /instagram\.com\/([^/?#]+)/i.exec(txt(f.fuente_url))?.[1] ?? ''
    const refDeUnidad = fuente === 'metrica' ? (atributo.startsWith('metrica:mapas') ? 'mapas' : `@${usuario}`) : fuente === 'mapas' || fuente === 'resenas' ? 'mapas' : fuente === 'reparto' ? txt(f.fuente_url) : `@${usuario}`
    return tipoDeFuenteDeUnidad({ fuente, ref: refDeUnidad })
  }
  m = /^brazo:propios:([^:]+):/.exec(ref)
  if (m) {
    if (m[1] === 'loyverse') { const tienda = txt(obj(obj(f.provenance_tag).datos).tienda); return tienda ? { tipo: 'punto_de_venta', detalle: tienda } : null }
    if (m[1] === 'meta') return { tipo: 'redes', detalle: null }
  }
  return null
}

export interface Reasignacion { id: string; ref: string; tipo: TipoDeFuente; detalle: string | null; de: string; a: string[] }
export interface PlanDeReasignacion { reasignar: Reasignacion[]; ya_en_su_sede: number; no_aplica: number; sin_asignacion: number; declarado: string[] }

/** puro: qué fichas vigentes cambian de sede según la asignación vigente en la config */
export function planDeReasignacion(fichas: Fila[], config: unknown, clavesDeSedes: string[]): PlanDeReasignacion {
  const p: PlanDeReasignacion = { reasignar: [], ya_en_su_sede: 0, no_aplica: 0, sin_asignacion: 0, declarado: [] }
  const declarado = new Set<string>()
  for (const f of fichas) {
    if (f.retirada_en || f.descartada === true || f.prueba === true) continue
    const fu = fuenteDeLaFicha(f)
    if (!fu) { p.no_aplica++; continue }
    const a = sedesDeLaFuente(config, fu.tipo, fu.detalle, clavesDeSedes)
    a.declarado.forEach((d) => declarado.add(d))
    if (!a.sedes) { p.sin_asignacion++; continue }
    const actual = sedesDeFicha(f.provenance_tag) ?? (txt(f.sede) ? txt(f.sede).split(',') : null)
    if (claveDeAlcance(actual) === claveDeAlcance(a.sedes)) { p.ya_en_su_sede++; continue }
    p.reasignar.push({ id: String(f.id), ref: txt(f.ref), tipo: fu.tipo, detalle: fu.detalle, de: claveDeAlcance(actual) || 'todas', a: a.sedes })
  }
  p.declarado = [...declarado]
  return p
}

/** la ficha nueva (versión) de una que cambia de sede: copia todo y cambia solo la sede, la referencia (si es del portero), el título y el rastro */
export function versionConSede(vieja: Fila, sedes: string[], o: { id: string; motivo: string }): Fila {
  const nueva: Fila = { ...vieja }
  for (const k of ['creado_en', 'retirada_en', 'motivo_retirada', 'reemplazada_por']) delete nueva[k]
  const ref = txt(vieja.ref)
  const sufijo = sufijoDeRef(sedes)
  const titulo = txt(vieja.titulo)
  const marca = ` · sede ${sedes.join(', ')}`
  nueva.id = o.id
  nueva.version_de = vieja.id
  nueva.sede = claveDeAlcance(sedes)
  // las del portero llevan la sede en la `ref` (la misma línea en dos sedes son dos fichas); las de los brazos ya tienen una `ref` por cifra y la conservan (su archivo es por `ref`)
  nueva.ref = ref.startsWith('portero:') && !ref.includes(':s:') ? `${ref}${sufijo}` : ref
  nueva.titulo = (titulo.includes(' · sede ') ? titulo : `${titulo}${marca}`).slice(0, 160)
  nueva.decision = 'reemplaza'
  nueva.razon_de_decision = o.motivo.slice(0, 300)
  const pt = obj(vieja.provenance_tag)
  nueva.provenance_tag = { ...pt, datos: { ...obj(pt.datos), ...datosDeSede(sedes) } }
  return nueva
}

export interface ResultadoDeReasignar { plan: PlanDeReasignacion; escritas: number; retiradas: number; errores: string[] }
export async function reasignarFichasASusSedes(o: { db: Db; client_id: string; config: unknown; clavesDeSedes: string[]; ahora: Date; dry_run: boolean; motivo: string; nuevoId?: () => string }): Promise<ResultadoDeReasignar> {
  const r: ResultadoDeReasignar = { plan: { reasignar: [], ya_en_su_sede: 0, no_aplica: 0, sin_asignacion: 0, declarado: [] }, escritas: 0, retiradas: 0, errores: [] }
  const q = await o.db.from('cerebro_fichas').select('*').eq('client_id', o.client_id).is('retirada_en', null).limit(5000)
  if (q.error) { r.errores.push(`lectura de las fichas vigentes: ${q.error.message}`); return r }
  const fichas = (Array.isArray(q.data) ? q.data : []) as Fila[]
  r.plan = planDeReasignacion(fichas, o.config, o.clavesDeSedes)
  if (o.dry_run) return r
  const porId = new Map(fichas.map((f) => [String(f.id), f]))
  const nuevoId = o.nuevoId ?? randomUUID
  const dia = o.ahora.toISOString().slice(0, 10)
  for (const x of r.plan.reasignar) {
    const vieja = porId.get(x.id)
    if (!vieja) continue
    const fila = versionConSede(vieja, x.a, { id: nuevoId(), motivo: o.motivo })
    const w = await o.db.from('cerebro_fichas').insert(fila)
    if (w.error) { r.errores.push(`versión de ${x.id}: ${w.error.message}`); continue }
    r.escritas++
    const u = await o.db.from('cerebro_fichas').update({ retirada_en: o.ahora.toISOString(), motivo_retirada: `reasignada a la sede ${x.a.join(', ')} el ${dia}: ${o.motivo}`.slice(0, 300), reemplazada_por: fila.id }).eq('id', x.id).eq('client_id', o.client_id)
    if (u.error) r.errores.push(`retiro de ${x.id}: ${u.error.message}`)
    else r.retiradas++
  }
  return r
}
