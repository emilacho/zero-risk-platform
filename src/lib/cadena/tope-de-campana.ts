/**
 * TOPE DE GASTO POR CAMPAÑA (CC1 · 2026-11-10 · GO Lenovo 19:30Z, opción A · condiciones de CC7). Antes de soltar las piezas de un parte, la cadena mira
 * cuánto lleva gastado la campaña MÁS lo que ya está comprometido MÁS lo que va a soltar, y lo compara con el tope que guarda LA CAMPAÑA (`cadena_campanas.tope_gasto_usd`).
 * Es una regla del sistema: no mira clientes ni rubros, y el monto nunca está escrito aquí (sale del dato de la campaña).
 *
 * De dónde sale el gasto (la MISMA fuente con que se midieron los US$ 26,28 de Náufrago el 10-nov, más las piezas):
 *   · planeación: `cadena_corridas` (con la cota pesimista de siempre, `costoEfectivo`: una corrida caída cuenta su tope);
 *   · concepto y brief creativo: `cadena_conceptos.costo_usd` y `cadena_brief_creativo.costo_usd`;
 *   · encargos de la oficina de la campaña (los reales con `parte_id` = la campaña o uno de sus partes; los lee `src/lib/oficina/gasto-de-encargos.ts`): su `gasto_usd`. Un encargo que YA está contado
 *     en un concepto o brief (por `encargo_id`) no se suma dos veces. Uno que sigue abierto (`abierto` · `en_paso`) cuenta lo mayor entre lo gastado y su tope.
 *   · 11-nov · revisiones de REGISTRO de los documentos de la campaña (la jefatura cobra aparte al revisor y a la corrección del productor; las lee la jefatura): su `gasto_usd`, y una abierta lo mayor entre lo gastado y su tope.
 * Lo comprometido (corrección pedida por CC7 🟡 y CC6 🔴 sobre e05a646): de los OTROS partes reales de la campaña, cada brief sin encargo real que la sala YA RECIBIÓ
 * (su sobre de producir existe: el freno lo soltó, o lo soltó la cadena antes del freno) cuenta el tope de su familia, sin importar su fecha (ya está en camino).
 * Un brief sin encargo que la sala NO recibió (lo retuvo el freno, o nunca salió) NO compromete dinero: guarda lugar POR FECHA, igual que una fila por venir
 * (solo si va antes que la pieza que se quiere soltar). Así una semana posterior retenida no le quita el dinero a la más cercana, llegue en el orden que llegue.
 * Lo que se va a soltar: cada sobre de este parte cuenta el tope de su familia (el tope por encargo de la plantilla activa de la oficina); sin familia o con una familia desconocida, el
 * mayor de los topes activos (cota pesimista).
 *
 * Qué hace:
 *   · sin tope en la campaña → no sale ninguna pieza real (una campaña sin tope no gasta) y se pregunta UNA vez;
 *   · gasto ilegible (cualquier lectura falla, o no hay topes de familia) → no sale nada y se avisa UNA vez (un error no es «cero gastado»);
 *   · con tope: salen, en el orden del calendario (fecha y hora; sin fecha, al final), las piezas que caben; en la primera que no cabe se corta (no se saltan piezas
 *     para soltar otras más baratas del final) y se pregunta UNA vez por campaña y monto de tope (si el tope sube, el siguiente corte abre su propia pregunta).
 *   · lo más cercano primero ENTRE partes (decisión de Emilio 10-nov 19:40Z): antes de soltar una pieza se le guarda lugar a cada fila ANTERIOR del calendario
 *     (desde hoy, aún sin parte: `validada` o `lista_para_brief`) con el tope de su familia. Así, si el parte de una semana posterior llega antes, no le quita el
 *     dinero a la semana más cercana.
 * Lo retenido NO se reintenta solo: queda en el parte. Al subir el tope, la siguiente llamada del mismo parte suelta lo que falte (la llave de cada sobre es la misma).
 * Aviso: una pieza en el borde puede gastar algo más que su tope (la oficina cierra «por tope» al pasarlo); el freno corta con los topes, no con ese exceso.
 */
import { costoEfectivo } from './nucleo'
import type { Corrida } from './almacen'

/** los estados de un encargo que todavía puede gastar */
export const ESTADOS_ABIERTOS = ['abierto', 'en_paso'] as const
/** los estados de una revisión de la jefatura que todavía puede gastar (los demás son terminales) */
export const ESTADOS_DE_REVISION_ABIERTOS = ['abierta', 'en_paso'] as const

export interface LecturaDeGasto {
  corridas: Array<Pick<Corrida, 'costo_usd' | 'estado' | 'paso'>>
  conceptos: Array<{ costo_usd: number | null; encargo_id: string | null }>
  briefs: Array<{ costo_usd: number | null; encargo_id: string | null }>
  /** encargos REALES (`dry_run=false`) con `parte_id` = la campaña o uno de sus partes reales */
  encargos: Array<{ id: string; parte_id: string; brief_id: string | null; estado: string; tope_usd: number | null; gasto_usd: number | null }>
  /** los partes REALES de la campaña (no los de ensayo) con sus briefs */
  partes: Array<{ id: string; briefs: Array<{ brief_id: string | null; familia: string | null; fila_id?: string | null }> }>
  /** tope por encargo de cada familia ACTIVA de la oficina */
  topes_de_familia: Record<string, number>
  /** los sobres de producir REALES que la sala ya recibió de esos partes (parte · brief) */
  soltados: Array<{ parte_id: string; brief_id: string }>
  /** 11-nov · las revisiones REALES de registro de la campaña (la jefatura las cobra aparte: el revisor y la corrección del productor) */
  revisiones: Array<{ estado: string; gasto_usd: number | null; tope_usd: number | null }>
}

/** la operación con que la sala guarda la ENTRADA de un sobre de producir (`brief/parte-listo` · `producir` → viaje PIEZAS; comprobada contra filas reales del 21-oct) */
export const OPERACION_DE_PRODUCIR = 'PIEZAS.intake.brief/parte-listo.producir'
/** un brief de otro parte que la sala todavía no recibió: guarda lugar por fecha (su fila del calendario) */
export interface BriefEsperando { parte_id: string; brief_id: string; familia: string | null; fila_id: string | null }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const r2 = (n: number): number => Math.round(n * 100) / 100

/** el tope de UNA pieza de esa familia · sin familia o desconocida, el mayor de los activos · sin topes legibles, LANZA */
export function topeDeLaPieza(topes: Record<string, number>, familia: string | null | undefined): number {
  const validos = Object.values(topes).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
  if (!validos.length) throw new Error('no hay topes de familia legibles')
  const t = familia ? topes[familia] : undefined
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : Math.max(...validos)
}

/** lo gastado y lo comprometido de la campaña · `parteActual` queda fuera de lo comprometido (sus briefs son lo que se va a soltar) · puro */
export function medirGastoDeCampana(l: LecturaDeGasto, parteActual: string): { gastado: number; comprometido: number; esperando: BriefEsperando[] } {
  const yaContados = new Set([...l.conceptos, ...l.briefs].filter((x) => x.encargo_id && typeof x.costo_usd === 'number').map((x) => x.encargo_id as string))
  let gastado = l.corridas.reduce((s, c) => s + costoEfectivo(c), 0)
  gastado += l.conceptos.reduce((s, x) => s + num(x.costo_usd), 0) + l.briefs.reduce((s, x) => s + num(x.costo_usd), 0)
  for (const e of l.encargos) {
    if (yaContados.has(e.id)) continue
    gastado += (ESTADOS_ABIERTOS as readonly string[]).includes(e.estado) ? Math.max(num(e.gasto_usd), num(e.tope_usd)) : num(e.gasto_usd)
  }
  // la revisión de registro de un documento de la campaña: una cerrada cuenta su gasto; una que sigue abierta, lo mayor entre lo gastado y su tope (igual que un encargo)
  for (const r of l.revisiones) gastado += (ESTADOS_DE_REVISION_ABIERTOS as readonly string[]).includes(r.estado) ? Math.max(num(r.gasto_usd), num(r.tope_usd)) : num(r.gasto_usd)
  const conEncargo = new Set(l.encargos.filter((e) => e.brief_id).map((e) => `${e.parte_id}|${e.brief_id}`))
  const enLaSala = new Set(l.soltados.map((x) => `${x.parte_id}|${x.brief_id}`))
  const esperando: BriefEsperando[] = []
  let comprometido = 0
  for (const p of l.partes) {
    if (p.id === parteActual) continue
    const vistos = new Set<string>()
    for (const b of p.briefs) {
      const id = typeof b.brief_id === 'string' ? b.brief_id.trim() : ''
      if (!id || vistos.has(id)) continue
      vistos.add(id)
      if (conEncargo.has(`${p.id}|${id}`)) continue
      if (enLaSala.has(`${p.id}|${id}`)) comprometido += topeDeLaPieza(l.topes_de_familia, b.familia)
      else esperando.push({ parte_id: p.id, brief_id: id, familia: b.familia, fila_id: b.fila_id ?? null })
    }
  }
  return { gastado, comprometido, esperando }
}

/** `no_se_produce` (11-nov): la puerta de la oficina dejará esta pieza SIN SALA (no se produce ni va por la pasarela) · sale como hoy, pero no cuesta ni corta a las demás */
export interface Candidata { brief_id: string; familia: string | null; fecha: string | null; hora: string | null; ya_tiene_encargo: boolean; no_se_produce?: boolean }
/** una fila del calendario (desde hoy) que todavía no tiene parte: se le guarda lugar si va ANTES que la pieza que se quiere soltar */
export interface FilaPorVenir { fila_id: string; fecha: string; hora: string | null; familia: string | null }
/** las filas por venir: las de la última versión, desde hoy, que siguen esperando (`validada` · `lista_para_brief`) y no están en ningún parte real ni en este · pura */
export function filasPorVenir(filas: Array<{ id: string; fecha: string; hora: string | null; estado: string; familia: string | null }>, hoy: string, partes: LecturaDeGasto['partes'], deEsteParte: Array<string | null | undefined>): FilaPorVenir[] {
  const cubiertas = new Set<string>([...partes.flatMap((p) => p.briefs.map((b) => b.fila_id ?? '')), ...deEsteParte.map((x) => x ?? '')].filter(Boolean))
  return filas.filter((f) => (f.estado === 'validada' || f.estado === 'lista_para_brief') && f.fecha >= hoy && !cubiertas.has(f.id)).map((f) => ({ fila_id: f.id, fecha: f.fecha, hora: f.hora, familia: f.familia }))
}
/** los briefs esperando de otros partes, con la fecha y hora de su fila del calendario · sin fila conocida van al final (no le guardan lugar a nadie con fecha) · pura */
export function esperandoPorVenir(esperando: BriefEsperando[], cuando: ReadonlyMap<string, { fecha: string; hora: string | null }>): FilaPorVenir[] {
  return esperando.map((b) => { const f = b.fila_id ? cuando.get(b.fila_id) : undefined; return { fila_id: `${b.parte_id}|${b.brief_id}`, fecha: f?.fecha ?? '9999-99-99', hora: f?.hora ?? null, familia: b.familia } })
}
const llaveDeOrden = (fecha: string | null, hora: string | null): string => (fecha ? `${fecha} ${hora ?? '99:99'}` : '9999-99-99')
export type DecisionDelTope =
  | { tipo: 'sin_tope'; retenidas: string[] }
  | { tipo: 'cabe'; tope: number; gastado: number; comprometido: number; estimado: number; sueltan: string[] }
  | { tipo: 'corta'; tope: number; gastado: number; comprometido: number; estimado: number; sueltan: string[]; retenidas: string[] }

/** el tope que guarda la campaña · solo un número positivo vale; cualquier otra cosa es «sin tope» */
export function topeDeLaCampana(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** decide qué piezas de este parte salen · en el orden del calendario · se corta en la primera que no cabe · puro */
export function decidirTope(topeCampana: unknown, medido: { gastado: number; comprometido: number }, candidatas: Candidata[], topes: Record<string, number>, porVenir: FilaPorVenir[] = []): DecisionDelTope {
  const tope = topeDeLaCampana(topeCampana)
  if (tope === null) return { tipo: 'sin_tope', retenidas: candidatas.map((c) => c.brief_id) }
  const orden = candidatas.map((c, i) => ({ c, i })).sort((a, b) => {
    const fa = llaveDeOrden(a.c.fecha, a.c.hora), fb = llaveDeOrden(b.c.fecha, b.c.hora)
    return fa < fb ? -1 : fa > fb ? 1 : a.i - b.i
  }).map((x) => x.c)
  const anteriores = porVenir.map((f) => ({ k: llaveDeOrden(f.fecha, f.hora), costo: topeDeLaPieza(topes, f.familia) }))
  /** el lugar guardado para las filas por venir que van ANTES de esta pieza */
  const reservaAntes = (c: Candidata): number => { const k = llaveDeOrden(c.fecha, c.hora); return anteriores.filter((a) => a.k < k).reduce((x, a) => x + a.costo, 0) }
  let suma = medido.gastado + medido.comprometido
  const sueltan: string[] = [], retenidas: string[] = []
  let cortado = false
  for (const c of orden) {
    // una pieza que ya tiene su encargo real ya está contada en lo gastado: el sobre repetido no suma (la sala lo contesta «duplicado»)
    if (c.ya_tiene_encargo) { sueltan.push(c.brief_id); continue }
    // una pieza que no se va a producir (sin sala) no gasta: sale como hoy (la oficina la deja esperando) y no le quita lugar a nadie
    if (c.no_se_produce) { sueltan.push(c.brief_id); continue }
    const costo = topeDeLaPieza(topes, c.familia)
    if (!cortado && suma + reservaAntes(c) + costo <= tope + 1e-9) { suma += costo; sueltan.push(c.brief_id) } else { cortado = true; retenidas.push(c.brief_id) }
  }
  const base = { tope, gastado: r2(medido.gastado), comprometido: r2(medido.comprometido), estimado: r2(suma - medido.gastado - medido.comprometido), sueltan }
  return retenidas.length ? { tipo: 'corta', ...base, retenidas } : { tipo: 'cabe', ...base }
}

/** la clave del incidente en el buzón · una por campaña y MONTO de tope (subir el tope abre una pregunta nueva la próxima vez que se llegue) */
export const claveDelTope = (campanaId: string, tope: number | null): string => `cadena:tope-de-campana:${campanaId}:${tope === null ? 'sin-tope' : String(tope)}`
export const claveDelGastoIlegible = (campanaId: string): string => `cadena:gasto-de-campana-ilegible:${campanaId}`

export interface AvisoDelTope { clave: string; tipo: 'pregunta' | 'alarma'; client_id: string; titulo: string; detalle: string }
const usd = (n: number): string => `US$ ${n.toFixed(2)}`
/** el texto del aviso · el buzón manda a Slack solo el primero de cada clave, así que dice la política entera */
export function avisoDelTope(c: { id: string; client_id: string }, d: Exclude<DecisionDelTope, { tipo: 'cabe' }>): AvisoDelTope {
  const camp = c.id.slice(0, 8)
  if (d.tipo === 'sin_tope') return {
    clave: claveDelTope(c.id, null), tipo: 'pregunta', client_id: c.client_id,
    titulo: `La campaña ${camp} no tiene tope de gasto: sus piezas no salen`,
    detalle: `${d.retenidas.length} piezas esperan. Una campaña sin tope de gasto no produce piezas reales. Hace falta decidir su tope; al ponerlo, la siguiente pasada suelta lo que quepa.`,
  }
  return {
    clave: claveDelTope(c.id, d.tope), tipo: 'pregunta', client_id: c.client_id,
    titulo: `La campaña ${camp} llegó a su tope de gasto (${usd(d.tope)}): ${d.retenidas.length} piezas esperan`,
    detalle: `Gastado ${usd(d.gastado)} · comprometido ${usd(d.comprometido)} · salieron ${d.sueltan.length} piezas (${usd(d.estimado)} como máximo). Las ${d.retenidas.length} que no caben quedan retenidas, en el orden del calendario, y no se reintentan solas. Si se sube el tope de la campaña, la siguiente pasada suelta las que quepan. Este aviso no se repite mientras el tope siga igual.`,
  }
}
export function avisoDeGastoIlegible(c: { id: string; client_id: string }, error: string): AvisoDelTope {
  return {
    clave: claveDelGastoIlegible(c.id), tipo: 'alarma', client_id: c.client_id,
    titulo: `No se pudo leer el gasto de la campaña ${c.id.slice(0, 8)}: sus piezas no salen`,
    detalle: `Sin el gasto no se puede saber si cabe en el tope, así que no sale ninguna pieza real hasta que se pueda leer. Error: ${error.slice(0, 300)}`,
  }
}
