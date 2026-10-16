/**
 * AUDITORÍA DIARIA DE CALIDAD (15-oct · mejora 4) · SILENCIOSA. Cada día, una muestra pequeña y determinista de las fichas que nacieron HOY se verifica contra su fuente cruda (`apify_raw`):
 *   · la cita EXISTE: el texto de la ficha está en lo que raspó la fuente (el sistema lo copia; si no está, algo se rompió entre el crudo y la ficha);
 *   · es DEL CLIENTE: la fila cruda a la que apunta es de este client_id (nada de otro cliente mezclado);
 *   · la FECHA es coherente: `fecha_fuente` no es futura ni posterior a `observado_en`, y si la fuente trae esa fecha, coincide.
 * Solo CÓDIGO: US$ 0, sin modelo. Lo que no se puede comprobar (sin crudo guardado, sin fecha) es `sin_verificar` y NUNCA cuenta como error.
 * Es una condición más del vigilante: si la tasa de error de la muestra pasa el umbral, apaga y avisa; si todo está bien, no dice nada.
 */
import { createHash } from 'node:crypto'
import { normalizar } from '../manual/texto'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)

/** tamaño de la muestra diaria */
export const TAMANO_DE_MUESTRA = 5
/** el umbral: a partir de 3 fichas verificables, ≥ 2 errores y ≥ 40 % de error ⇒ problema del vigilante (una ficha mala sola no apaga nada) */
export const MINIMO_VERIFICABLES = 3
export const MINIMO_ERRORES = 2
export const UMBRAL_DE_ERROR = 0.4
/** qué parte de las palabras de la ficha debe estar en el crudo para decir «la cita existe» */
export const PARTE_DE_LA_CITA = 0.6

export interface FichaAuditable { id: string; client_id: string; contenido: string; fecha_fuente: string | null; observado_en: string | null; fuente_url: string | null; provenance_tag: unknown }
export type VeredictoDeAuditoria = 'ok' | 'error' | 'sin_verificar'
export interface ResultadoDeFicha { ficha_id: string; veredicto: VeredictoDeAuditoria; errores: string[]; sin_verificar: string[] }
export interface ResultadoDeAuditoria {
  dia: string
  elegidas: number
  verificables: number
  errores: number
  sin_verificar: number
  tasa_de_error: number | null
  problema: string | null
  fichas: ResultadoDeFicha[]
}

const textoPlano = (x: unknown): string => {
  try { return normalizar(typeof x === 'string' ? x : JSON.stringify(x ?? '')) } catch { return '' }
}
const palabras = (s: string): string[] => s.split(/\s+/).filter((w) => w.length >= 3)

/** verifica UNA ficha contra su crudo (puro) */
export function verificarFicha(f: FichaAuditable, crudo: { client_id?: unknown; respuesta?: unknown } | null): ResultadoDeFicha {
  const out: ResultadoDeFicha = { ficha_id: f.id, veredicto: 'ok', errores: [], sin_verificar: [] }
  if (!crudo) { out.sin_verificar.push('no hay fila cruda guardada para esta ficha'); out.veredicto = 'sin_verificar'; return out }
  // 1 · del cliente
  if (typeof crudo.client_id === 'string' && crudo.client_id !== f.client_id) out.errores.push('la fila cruda es de OTRO cliente')
  // 2 · la cita existe
  const crudoPlano = textoPlano(crudo.respuesta)
  const fichaPlano = textoPlano(f.contenido)
  const pal = palabras(fichaPlano)
  if (!crudoPlano) out.sin_verificar.push('la fila cruda no trae respuesta guardada')
  else if (pal.length < 3) out.sin_verificar.push('el texto de la ficha es demasiado corto para comprobarlo')
  else {
    const en = new Set(palabras(crudoPlano))
    const presentes = pal.filter((w) => en.has(w)).length
    const textual = presentes / pal.length >= PARTE_DE_LA_CITA || crudoPlano.includes(fichaPlano.slice(0, 60))
    // una ficha que el sistema ARMÓ (métrica, puntaje, conteo) no copia texto: se comprueba por sus CIFRAS; si no trae cifras, no hay con qué compararla
    const cifras = fichaPlano.split(' ').filter((w) => /^[0-9]+$/.test(w) && w.length >= 2)
    const enCrudo = new Set(crudoPlano.split(' '))
    const armada = esObjeto(f.provenance_tag) && (f.provenance_tag as Fila).metrica !== undefined
    if (!textual) {
      if (cifras.length && cifras.every((c) => enCrudo.has(c))) { /* las cifras están en la fuente */ }
      else if (armada && !cifras.length) out.sin_verificar.push('ficha armada por el sistema sin cifras: no hay texto que comparar')
      else out.errores.push(`el texto de la ficha no está en su fuente (${Math.round((presentes / pal.length) * 100)} % de sus palabras${cifras.length ? ' y alguna cifra falta' : ''})`)
    }
  }
  // 3 · la fecha
  if (f.fecha_fuente) {
    const t = Date.parse(f.fecha_fuente)
    const obs = f.observado_en ? Date.parse(f.observado_en) : NaN
    if (!Number.isFinite(t)) out.errores.push(`la fecha de la fuente no se entiende («${String(f.fecha_fuente).slice(0, 30)}»)`)
    else if (Number.isFinite(obs) && t > obs + 86_400_000) out.errores.push('la fecha de la fuente es posterior al día en que se observó')
    else if (crudoPlano && !crudoPlano.includes(f.fecha_fuente.slice(0, 10))) out.sin_verificar.push('la fuente no trae esa fecha escrita')
  }
  out.veredicto = out.errores.length ? 'error' : out.sin_verificar.length && !crudoPlano ? 'sin_verificar' : 'ok'
  return out
}

/** la muestra es la misma para el mismo día y las mismas fichas (reproducible, sin azar escondido) */
export function elegirMuestra<T extends { id: string }>(fichas: T[], dia: string, n = TAMANO_DE_MUESTRA): T[] {
  return [...fichas]
    .map((f) => ({ f, k: createHash('sha256').update(`${dia}|${f.id}`).digest('hex') }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .slice(0, n)
    .map((x) => x.f)
}

export function juzgarAuditoria(dia: string, fichas: ResultadoDeFicha[]): ResultadoDeAuditoria {
  const verificables = fichas.filter((f) => f.veredicto !== 'sin_verificar')
  const errores = verificables.filter((f) => f.veredicto === 'error').length
  const tasa = verificables.length ? errores / verificables.length : null
  const problema = tasa !== null && verificables.length >= MINIMO_VERIFICABLES && errores >= MINIMO_ERRORES && tasa >= UMBRAL_DE_ERROR
    ? `auditoría de calidad: ${errores} de ${verificables.length} fichas de hoy no verifican contra su fuente (${Math.round(tasa * 100)} %)`
    : null
  return { dia, elegidas: fichas.length, verificables: verificables.length, errores, sin_verificar: fichas.length - verificables.length, tasa_de_error: tasa === null ? null : Math.round(tasa * 100) / 100, problema, fichas }
}

interface Db { from: (t: string) => any }
/** lee las fichas nacidas hoy, toma la muestra y las verifica; una falla de lectura se DICE (no se lee como «todo bien») */
export async function auditarCliente(db: Db, clientId: string, ahora: Date, n = TAMANO_DE_MUESTRA): Promise<{ ok: true; resultado: ResultadoDeAuditoria } | { ok: false; detalle: string }> {
  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const dia = dia0.toISOString().slice(0, 10)
  const q = await db.from('cerebro_fichas').select('id, client_id, contenido, fecha_fuente, observado_en, fuente_url, provenance_tag, descartada, retirada_en').eq('client_id', clientId).gte('creado_en', dia0.toISOString()).limit(500)
  if (q.error) return { ok: false, detalle: `cerebro_fichas: ${String(q.error.message).slice(0, 120)}` }
  const vivas = lista(q.data).filter((f) => !f.descartada && !f.retirada_en && typeof f.contenido === 'string' && esObjeto(f.provenance_tag)) as unknown as FichaAuditable[]
  const muestra = elegirMuestra(vivas, dia, n)
  if (!muestra.length) return { ok: true, resultado: juzgarAuditoria(dia, []) }
  const ids = muestra.map((f) => { const r = esObjeto(f.provenance_tag) && esObjeto((f.provenance_tag as Fila).respaldo_en) ? ((f.provenance_tag as Fila).respaldo_en as Fila).id : null; return typeof r === 'string' ? r : null })
  const pedir = [...new Set(ids.filter((x): x is string => !!x))]
  const porId = new Map<string, Fila>()
  if (pedir.length) {
    const c = await db.from('apify_raw').select('id, client_id, respuesta').in('id', pedir).limit(pedir.length)
    if (c.error) return { ok: false, detalle: `apify_raw: ${String(c.error.message).slice(0, 120)}` }
    for (const r of lista(c.data)) porId.set(String(r.id), r)
  }
  const fichas = muestra.map((f, i) => verificarFicha(f, ids[i] ? (porId.get(ids[i]!) as { client_id?: unknown; respuesta?: unknown } | undefined) ?? null : null))
  return { ok: true, resultado: juzgarAuditoria(dia, fichas) }
}

/** las citas `[ficha:xxxxxxxx · fecha]` de un texto de resumen (puro) */
export function citasDeUnResumen(texto: string): Array<{ ficha: string; fecha: string }> {
  const out: Array<{ ficha: string; fecha: string }> = []
  for (const m of texto.matchAll(/\[ficha:([0-9a-f]{8}) · ([^\]]{0,20})\]/g)) out.push({ ficha: m[1], fecha: m[2].trim() })
  return out
}

/**
 * Condición del vigilante (15-oct · pulido del resumen): toda cita del resumen vivo VIGENTE de hoy apunta a una ficha que EXISTE del mismo cliente (viva o retirada: nada se borra).
 * Solo código, US$ 0. Sin resumen vigente = nada que revisar (no es un problema). Una cita sin ficha es un error real: el resumen se arma y se pule SOLO con fichas de la lista.
 */
export async function auditarCitasDelResumen(db: Db, clientId: string): Promise<{ ok: true; revisadas: number; problema: string | null } | { ok: false; detalle: string }> {
  const r = await db.from('cerebro_fichas').select('id, contenido, retirada_en, descartada, clase').eq('client_id', clientId).eq('clase', 'resumen_vivo').limit(50)
  if (r.error) return { ok: false, detalle: `cerebro_fichas: ${String(r.error.message).slice(0, 120)}` }
  const vivos = lista(r.data).filter((f) => !f.retirada_en && !f.descartada && typeof f.contenido === 'string')
  if (!vivos.length) return { ok: true, revisadas: 0, problema: null }
  const citas = vivos.flatMap((f) => citasDeUnResumen(String(f.contenido)))
  if (!citas.length) return { ok: true, revisadas: 0, problema: null }
  const q = await db.from('cerebro_fichas').select('id').eq('client_id', clientId).limit(5000)
  if (q.error) return { ok: false, detalle: `cerebro_fichas: ${String(q.error.message).slice(0, 120)}` }
  const ids = lista(q.data).map((f) => String(f.id))
  const faltan = [...new Set(citas.map((c) => c.ficha))].filter((p) => !ids.some((id) => id.startsWith(p)))
  return { ok: true, revisadas: citas.length, problema: faltan.length ? `el resumen vivo cita ${faltan.length} ficha(s) que no existen (${faltan.slice(0, 3).join(', ')})` : null }
}
