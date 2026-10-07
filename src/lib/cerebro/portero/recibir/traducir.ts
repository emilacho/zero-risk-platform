/**
 * PASO 7 · traducir lo que contesta el modelo (NÚMEROS de segmento) a filas de `cerebro_fichas` con el texto COPIADO del original.
 * El modelo nunca transcribe: el contenido de una ficha sale SOLO de los segmentos que pidió (0 caracteres inventados) y la ficha guarda las FIRMAS de esos
 * segmentos, no sus números. Todo segmento termina en una ficha, un descarte CON motivo o una ficha «sin clasificar» del sistema: nada se pierde.
 */
import { PLAZOS_EN_DIAS } from '../../plazos'
import { extraerJson } from '../decision'
import { type Segmento, firmaDe } from './segmentos'
import type { FichaViva, FilaDeFicha, OrigenDeIngreso, Propiedad } from './tipos'

export const MAXIMO_DE_DIAS_DE_VIGENCIA_EXPLICITA = 400
/** lo más que lleva UNA ficha (en caracteres): bajo el límite de lo que `entregar` devuelve de una ficha (60.000), para que NINGUNA se entregue cortada */
export const MAXIMO_DE_CARACTERES_POR_FICHA = 40_000
export const MOTIVO_DE_RETIRADA_PARCIAL = 'sus segmentos cambiaron y nada los reemplazó'

export interface ContextoDeTraduccion {
  cliente: string
  ingresoId: string
  origen: OrigenDeIngreso
  fechaFuente: string | null
  ahora: Date
  prueba: boolean
  paraModelo: Segmento[]
  afectadas: FichaViva[]
  nuevoId: () => string
}

export type CaidaDeTraduccion = 'json_roto' | 'salida_cortada' | 'campos_que_faltan'
export type ResultadoDeTraduccion =
  | { ok: true; fichas: FilaDeFicha[]; retiradas: Array<{ id: string; motivo: string }>; notas: string[]; segmentosCubiertos: number; segmentosResiduales: number }
  | { ok: false; caida: CaidaDeTraduccion }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** parte los segmentos de una ficha en grupos seguidos cuyo texto no pasa del máximo (un segmento mide ≤ 600, así que siempre cabe); lo corto queda en un solo grupo */
export function partesDe(segs: Segmento[]): Segmento[][] {
  const partes: Segmento[][] = []
  let actual: Segmento[] = []
  let largo = 0
  for (const s of segs) {
    const suma = largo + s.texto.length + (actual.length > 0 ? 2 : 0)
    if (actual.length > 0 && suma > MAXIMO_DE_CARACTERES_POR_FICHA) { partes.push(actual); actual = []; largo = 0 }
    largo += s.texto.length + (actual.length > 0 ? 2 : 0)
    actual.push(s)
  }
  if (actual.length > 0) partes.push(actual)
  return partes
}
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export function traducir(respuestas: Array<{ texto: string; cortada?: boolean }>, ctx: ContextoDeTraduccion): ResultadoDeTraduccion {
  const crudas: Record<string, unknown>[] = []
  const descartesCrudos: Record<string, unknown>[] = []
  for (const r of respuestas) {
    const leido = extraerJson(r.texto, 'fichas')
    if (!leido) return { ok: false, caida: r.cortada ? 'salida_cortada' : 'json_roto' }
    const v = leido.valor
    if (!esObjeto(v) || !Array.isArray(v.fichas)) return { ok: false, caida: r.cortada ? 'salida_cortada' : 'campos_que_faltan' }
    for (const f of v.fichas) if (esObjeto(f)) crudas.push(f)
    if (Array.isArray(v.descartes)) for (const d of v.descartes) if (esObjeto(d)) descartesCrudos.push(d)
  }

  const notas: string[] = []
  const porN = new Map(ctx.paraModelo.map((s) => [s.n, s]))
  const usados = new Set<number>()
  const ahoraIso = ctx.ahora.toISOString()
  const limiteDeVigencia = ctx.ahora.getTime() + MAXIMO_DE_DIAS_DE_VIGENCIA_EXPLICITA * 86_400_000
  const tomar = (pedidos: unknown, quien: string): Segmento[] => {
    const lista = Array.isArray(pedidos) ? pedidos : []
    const buenos = new Set<number>()
    for (const p of lista) {
      if (typeof p !== 'number' || !Number.isInteger(p)) { notas.push(`${quien}: «${String(p)}» no es un número de segmento`); continue }
      if (!porN.has(p)) { notas.push(`${quien}: el segmento ${p} no existe en esta llamada`); continue }
      if (usados.has(p)) { notas.push(`${quien}: el segmento ${p} lo pidieron dos fichas o descartes; queda con el primero (repetido)`); continue }
      buenos.add(p)
    }
    for (const n of buenos) usados.add(n)
    return [...buenos].sort((a, b) => a - b).map((n) => porN.get(n) as Segmento)
  }
  const base = (id: string, segs: Segmento[]) => {
    const contenido = segs.map((s) => s.texto).join('\n\n')
    return {
      id, client_id: ctx.cliente, ingreso_id: ctx.ingresoId, contenido, firmas: segs.map((s) => s.firma), origen: ctx.origen, fecha_fuente: ctx.fechaFuente,
      reconfirmado_en: ahoraIso, huella: firmaDe(contenido), archivo_nombre: null, archivo_tipo: null, archivo_enlace: null, archivo_bytes: null,
      provenance_tag: { source: 'cerebro_recibir', trust_level: ctx.origen === 'dueno' ? 'tenant_trusted' : 'untrusted', ingress_route: 'cerebro/portero/recibir', ingress_id: ctx.ingresoId, received_at: ahoraIso },
      prueba: ctx.prueba,
    }
  }

  const fichas: FilaDeFicha[] = []
  const citadas = new Set<number>()
  crudas.forEach((c, i) => {
    const quien = `ficha ${i + 1}`
    const segs = tomar(c.segmentos, quien)
    if (segs.length === 0) { notas.push(`${quien} sin segmentos válidos: no se archivó`); return }
    const id = ctx.nuevoId()
    const clase = texto(c.clase, 40) ?? 'ficha'
    const titulo = texto(c.titulo, 200) ?? clase
    let plazo = 'sin_plazo'
    if (typeof c.plazo === 'string' && Object.prototype.hasOwnProperty.call(PLAZOS_EN_DIAS, c.plazo)) plazo = c.plazo
    else if (c.plazo !== undefined && c.plazo !== null) notas.push(`${quien}: el plazo «${String(c.plazo)}» no está en la lista; queda sin_plazo`)
    let vigente: string | null = null
    if (c.vigente_hasta !== undefined && c.vigente_hasta !== null && c.vigente_hasta !== '') {
      const t = typeof c.vigente_hasta === 'string' ? Date.parse(c.vigente_hasta) : NaN
      if (Number.isNaN(t)) notas.push(`${quien}: la fecha de vigencia «${String(c.vigente_hasta)}» no se pudo leer`)
      else if (t > limiteDeVigencia) notas.push(`${quien}: la fecha de vigencia pasa de ${MAXIMO_DE_DIAS_DE_VIGENCIA_EXPLICITA} días y se ignoró`)
      else vigente = new Date(t).toISOString()
    }
    const propiedad: Propiedad = c.propiedad === 'propia' || c.propiedad === 'ajena' || c.propiedad === 'incierta' ? c.propiedad : 'incierta'
    let versionDe: string | null = null
    let ref = `ficha:${id}`
    if (c.reemplaza !== undefined && c.reemplaza !== null) {
      const k = c.reemplaza
      if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= ctx.afectadas.length && !citadas.has(k)) {
        citadas.add(k); versionDe = ctx.afectadas[k - 1].id; ref = ctx.afectadas[k - 1].ref
      } else notas.push(`${quien}: el «reemplaza» ${String(k)} no vale (no existe o ya lo citó otra ficha)`)
    }
    const producto = (Array.isArray(c.producto) ? c.producto : []).map((p) => texto(p, 120)).filter((p): p is string => p !== null).slice(0, 20)
    // una ficha larga se parte en fichas que `entregar` devuelve ENTERAS; `reemplaza` va solo en la primera parte, las demás son fichas nuevas
    const partes = partesDe(segs)
    partes.forEach((ps, k) => {
      const idk = k === 0 ? id : ctx.nuevoId()
      fichas.push({
        ...base(idk, ps), ref: k === 0 ? ref : `ficha:${idk}`, clase, titulo: partes.length > 1 ? `${titulo.slice(0, 170)} (parte ${k + 1} de ${partes.length})` : titulo, que_es: texto(c.que_es, 400) ?? titulo, plazo, vigente_hasta: vigente, version_de: k === 0 ? versionDe : null,
        producto, sede: texto(c.sede, 200), propiedad, porque: texto(c.porque, 300), descartada: false, motivo_descarte: null, juzgado_por: 'modelo', residual: false,
      })
    })
  })

  descartesCrudos.forEach((d, i) => {
    const motivo = texto(d.motivo, 300)
    if (!motivo) { notas.push(`descarte ${i + 1} sin motivo: no se descartó (queda para «sin clasificar»)`); return }
    const segs = tomar(d.segmentos, `descarte ${i + 1}`)
    if (segs.length === 0) return
    const id = ctx.nuevoId()
    fichas.push({
      ...base(id, segs), ref: `ficha:${id}`, clase: 'descarte', titulo: `Descartado: ${motivo.slice(0, 120)}`, que_es: motivo, plazo: 'sin_plazo', vigente_hasta: null, version_de: null,
      producto: [], sede: null, propiedad: 'incierta', porque: null, descartada: true, motivo_descarte: motivo, juzgado_por: 'modelo', residual: false,
    })
  })
  const cubiertos = usados.size

  // lo que nadie cubrió: una ficha «sin clasificar» por tramo de números seguidos
  const sobrantes = ctx.paraModelo.filter((s) => !usados.has(s.n)).sort((a, b) => a.n - b.n)
  const tramos: Segmento[][] = []
  for (const s of sobrantes) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && ultimo[ultimo.length - 1].n + 1 === s.n) ultimo.push(s)
    else tramos.push([s])
  }
  for (const tramo of tramos) {
    const partes = partesDe(tramo)
    partes.forEach((ps, k) => {
      const id = ctx.nuevoId()
      const b = base(id, ps)
      fichas.push({
        ...b, ref: `ficha:${id}`, clase: 'sin_clasificar', titulo: `Sin clasificar: ${(b.contenido ?? '').replace(/\s+/g, ' ').slice(0, 80)}${partes.length > 1 ? ` (parte ${k + 1} de ${partes.length})` : ''}`, que_es: 'archivado tal cual, sin juicio sobre qué es',
        plazo: 'sin_plazo', vigente_hasta: null, version_de: null, producto: [], sede: null, propiedad: 'incierta', porque: null, descartada: false, motivo_descarte: null, juzgado_por: 'sistema', residual: true,
      })
    })
  }

  const retiradas = ctx.afectadas.filter((_f, i) => !citadas.has(i + 1)).map((f) => ({ id: f.id, motivo: MOTIVO_DE_RETIRADA_PARCIAL }))
  return { ok: true, fichas, retiradas, notas, segmentosCubiertos: cubiertos, segmentosResiduales: sobrantes.length }
}
