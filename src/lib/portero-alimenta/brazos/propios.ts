/**
 * BRAZO · DATOS PROPIOS DEL CLIENTE (cifras MEDIDAS, no supuestos) · lectores con la llave DEL CLIENTE.
 *  · Punto de venta (Loyverse): ventas del mes por ítem, por hora y por día de la semana. SOLO ingreso: los costos del punto de venta suelen estar en cero (Náufrago: 68 artículos sin costo),
 *    así que ninguna ficha dice «margen». Los nombres de ítem son los del punto de venta; la equivalencia con la carta web está en `config.apify.loyverse_mapa_de_items` (la arma `mapa-de-items.ts` por sinónimo, con su `_meta`: origen y lo dudoso; o la confirma el dueño). Nada se deduce por parecido de un solo golpe: lo dudoso se muestra como «podría ser».
 *  · Meta (cuenta de anuncios y cuenta de Instagram del cliente): gasto, alcance, clics y resultados de los últimos 30 días; seguidores y alcance de la cuenta. Es el mismo contrato que
 *    `/api/meta-ads/spend-data`, pero con la llave y la cuenta DEL CLIENTE (esa ruta usa una sola cuenta de entorno).
 *  · Nunca se pide la llave por el chat ni se escribe en una ficha, un error o un rastro: viven en variables de entorno del servidor, una por cliente (`credencialesDe`).
 *  · Sin llave NO es un error: es «sin material» con el nombre de la variable que falta.
 * Las dos lecturas reciben `fetch` por parámetro: se prueban con una llave falsa y respuestas simuladas, sin red.
 */
import { DIA_EN_MS, slugDe, type FichaDeBrazo, type ResultadoDeUnBrazo } from './tipos'

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const arr = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const num = (x: unknown): number => { const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN; return Number.isFinite(n) ? n : 0 }
const r2 = (n: number): number => Math.round(n * 100) / 100
const coma = (n: number): string => r2(n).toFixed(2).replace('.', ',')
const VIGENCIA_DIAS = 3
/** Ecuador continental (UTC−5, sin horario de verano): es el huso del dato · se toma de la ficha si algún día hay otro país */
export const DESFASE_HORARIO_POR_DEFECTO_HORAS = -5

export interface CredencialesDelCliente { loyverse_token: string | null; meta_token: string | null; meta_ad_account_id: string | null; meta_ig_user_id: string | null; faltan: string[]; prefijo: string }
/** variables del servidor (Vercel): CLIENTE_<SLUG>_LOYVERSE_TOKEN · CLIENTE_<SLUG>_META_TOKEN · CLIENTE_<SLUG>_META_AD_ACCOUNT_ID · CLIENTE_<SLUG>_META_IG_USER_ID */
export function credencialesDe(slug: string, env: Record<string, string | undefined>): CredencialesDelCliente {
  const S = slugDe(slug).toUpperCase().replace(/-/g, '_') || 'SIN_SLUG'
  const prefijo = `CLIENTE_${S}_`
  const v = (k: string) => { const x = String(env[prefijo + k] ?? '').trim(); return x || null }
  const c = { loyverse_token: v('LOYVERSE_TOKEN'), meta_token: v('META_TOKEN'), meta_ad_account_id: v('META_AD_ACCOUNT_ID'), meta_ig_user_id: v('META_IG_USER_ID') }
  const faltan: string[] = []
  if (!c.loyverse_token) faltan.push(`${prefijo}LOYVERSE_TOKEN`)
  if (!c.meta_token) faltan.push(`${prefijo}META_TOKEN`)
  if (!c.meta_ad_account_id && !c.meta_ig_user_id) faltan.push(`${prefijo}META_AD_ACCOUNT_ID o ${prefijo}META_IG_USER_ID`)
  return { ...c, faltan, prefijo }
}

// ── Loyverse ─────────────────────────────────────────────────────────────────────────────────────
export const LOYVERSE_BASE = 'https://api.loyverse.com/v1.0'
/** páginas de 250 recibos: en régimen (solo el mes en curso) y en el relleno de 12 meses (una vez) */
export const MAX_PAGINAS_DE_VENTAS = 20
export const MAX_PAGINAS_DEL_RELLENO = 120
/** meses CERRADOS que el brazo mantiene hacia atrás (más el mes en curso, parcial) */
export const MESES_DE_HISTORIA = 12
export interface LineaDeVenta { item: string; unidades: number; ingreso: number }
export interface ResumenDeVentas {
  periodo: string
  tickets: number
  ingreso: number
  reembolsos: number
  ticket_medio: number
  anuladas: number
  por_item: LineaDeVenta[]
  por_hora: Array<{ hora: number; tickets: number; ingreso: number }>
  por_dia: Array<{ dia: string; tickets: number; ingreso: number }>
  /** por fecha local (AAAA-MM-DD): con esto se puede cerrar un mes cuyo comienzo ya no se puede volver a leer */
  por_fecha: DiaDeVentas[]
  recortado: boolean
}
export interface DiaDeVentas { f: string; ingreso: number; tickets: number; reembolsos: number; anuladas: number }
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const aMes = (a: number, m0: number): string => `${a}-${String(m0 + 1).padStart(2, '0')}`
/** el mes local («AAAA-MM») de un instante */
export function mesLocalDe(t: Date, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): string {
  const l = new Date(t.getTime() + desfaseHoras * 3_600_000)
  return aMes(l.getUTCFullYear(), l.getUTCMonth())
}
/** el primer instante (UTC) de un mes local «AAAA-MM» */
export function inicioDelPeriodo(periodo: string, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): Date {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 1) - desfaseHoras * 3_600_000)
}
/** el primer instante del mes local de `ahora`, en UTC */
export function inicioDelMes(ahora: Date, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): { periodo: string; desde: Date } {
  const periodo = mesLocalDe(ahora, desfaseHoras)
  return { periodo, desde: inicioDelPeriodo(periodo, desfaseHoras) }
}
/** los `n` meses cerrados anteriores al mes de `ahora`, del más viejo al más nuevo */
export function mesesCerradosHasta(ahora: Date, n = MESES_DE_HISTORIA, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): string[] {
  const l = new Date(ahora.getTime() + desfaseHoras * 3_600_000)
  const out: string[] = []
  for (let k = n; k >= 1; k--) { const d = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - k, 1)); out.push(aMes(d.getUTCFullYear(), d.getUTCMonth())) }
  return out
}
export function resumirVentas(recibos: Array<Record<string, unknown>>, o: { periodo: string; desfaseHoras?: number; recortado?: boolean }): ResumenDeVentas {
  const dh = o.desfaseHoras ?? DESFASE_HORARIO_POR_DEFECTO_HORAS
  let tickets = 0, ingreso = 0, reembolsos = 0, anuladas = 0
  const items = new Map<string, LineaDeVenta>()
  const horas = new Map<number, { tickets: number; ingreso: number }>()
  const dias = new Map<string, { tickets: number; ingreso: number }>()
  const fechas = new Map<string, DiaDeVentas>()
  for (const r of recibos) {
    const t = new Date(String(r.created_at ?? r.receipt_date ?? ''))
    const f = Number.isNaN(t.getTime()) ? null : new Date(t.getTime() + dh * 3_600_000).toISOString().slice(0, 10)
    const dia = f ? (fechas.get(f) ?? fechas.set(f, { f, ingreso: 0, tickets: 0, reembolsos: 0, anuladas: 0 }).get(f)!) : null
    if (r.cancelled_at) { anuladas++; if (dia) dia.anuladas++; continue }
    const total = num(r.total_money)
    if (String(r.receipt_type ?? 'SALE').toUpperCase() === 'REFUND') { reembolsos += Math.abs(total); if (dia) dia.reembolsos += Math.abs(total); continue }
    tickets++; ingreso += total
    if (dia) { dia.tickets++; dia.ingreso += total }
    if (!Number.isNaN(t.getTime())) {
      const l = new Date(t.getTime() + dh * 3_600_000)
      const h = horas.get(l.getUTCHours()) ?? { tickets: 0, ingreso: 0 }; h.tickets++; h.ingreso += total; horas.set(l.getUTCHours(), h)
      const d = dias.get(DIAS[l.getUTCDay()]) ?? { tickets: 0, ingreso: 0 }; d.tickets++; d.ingreso += total; dias.set(DIAS[l.getUTCDay()], d)
    }
    for (const li of arr(r.line_items)) {
      const nombre = String(li.item_name ?? '').trim() || '(sin nombre)'
      const x = items.get(nombre) ?? { item: nombre, unidades: 0, ingreso: 0 }
      x.unidades += num(li.quantity); x.ingreso += num(li.total_money)
      items.set(nombre, x)
    }
  }
  return {
    periodo: o.periodo, tickets, ingreso: r2(ingreso), reembolsos: r2(reembolsos), ticket_medio: tickets ? r2(ingreso / tickets) : 0, anuladas, recortado: !!o.recortado,
    por_item: [...items.values()].map((x) => ({ ...x, ingreso: r2(x.ingreso) })).sort((a, b) => b.ingreso - a.ingreso || (a.item < b.item ? -1 : 1)),
    por_hora: [...horas.entries()].map(([hora, v]) => ({ hora, tickets: v.tickets, ingreso: r2(v.ingreso) })).sort((a, b) => b.tickets - a.tickets || a.hora - b.hora),
    por_dia: [...dias.entries()].map(([dia, v]) => ({ dia, tickets: v.tickets, ingreso: r2(v.ingreso) })).sort((a, b) => b.tickets - a.tickets || (a.dia < b.dia ? -1 : 1)),
    por_fecha: [...fechas.values()].map((d) => ({ ...d, ingreso: r2(d.ingreso), reembolsos: r2(d.reembolsos) })).sort((a, b) => (a.f < b.f ? -1 : 1)),
  }
}

/** lo mínimo de un mes en curso para poder CERRARLO después sin volver a leer su comienzo (va en `datos.snapshot` de la ficha de ingreso) */
export interface SnapshotDeVentas {
  cubre_hasta: string
  tickets: number
  ingreso: number
  reembolsos: number
  anuladas: number
  dias: DiaDeVentas[]
  por_item: LineaDeVenta[]
  por_hora: Array<{ hora: number; tickets: number; ingreso: number }>
  por_dia: Array<{ dia: string; tickets: number; ingreso: number }>
}
export function snapshotDe(r: ResumenDeVentas, cubreHasta: string): SnapshotDeVentas {
  return { cubre_hasta: cubreHasta, tickets: r.tickets, ingreso: r.ingreso, reembolsos: r.reembolsos, anuladas: r.anuladas, dias: r.por_fecha, por_item: r.por_item.slice(0, 10), por_hora: r.por_hora.slice(0, 3), por_dia: r.por_dia.slice(0, 3) }
}
/** lee un snapshot guardado; lo que no tenga la forma exacta no se usa (un mes no se cierra con datos dudosos) */
export function leerSnapshot(x: unknown): SnapshotDeVentas | null {
  const o = obj(x)
  if (typeof o.cubre_hasta !== 'string' || Number.isNaN(Date.parse(o.cubre_hasta))) return null
  if (!Array.isArray(o.dias) || !o.dias.every((d) => typeof obj(d).f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(obj(d).f)))) return null
  for (const k of ['tickets', 'ingreso', 'reembolsos', 'anuladas']) if (typeof o[k] !== 'number') return null
  return {
    cubre_hasta: o.cubre_hasta, tickets: o.tickets as number, ingreso: o.ingreso as number, reembolsos: o.reembolsos as number, anuladas: o.anuladas as number,
    dias: (o.dias as DiaDeVentas[]).map((d) => ({ f: d.f, ingreso: num(d.ingreso), tickets: num(d.tickets), reembolsos: num(d.reembolsos), anuladas: num(d.anuladas) })),
    por_item: arr(o.por_item).map((i) => ({ item: String(i.item ?? ''), unidades: num(i.unidades), ingreso: num(i.ingreso) })),
    por_hora: arr(o.por_hora).map((h) => ({ hora: num(h.hora), tickets: num(h.tickets), ingreso: num(h.ingreso) })),
    por_dia: arr(o.por_dia).map((d) => ({ dia: String(d.dia ?? ''), tickets: num(d.tickets), ingreso: num(d.ingreso) })),
  }
}
/** el día local (AAAA-MM-DD) de un instante */
export const diaLocalDe = (t: Date, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): string => new Date(t.getTime() + desfaseHoras * 3_600_000).toISOString().slice(0, 10)
/** el instante (UTC) en que empieza el día local AAAA-MM-DD */
export const inicioDelDiaLocal = (dia: string, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): Date => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d) - desfaseHoras * 3_600_000) }
/**
 * CIERRA un mes que ya terminó cuando su comienzo no se puede volver a leer (el plan de Loyverse solo deja leer 31 días atrás): toma lo guardado hasta la última lectura,
 * cambia los días desde el de esa lectura por los recién leídos y suma. Ingreso, tickets, reembolsos y ticket promedio quedan EXACTOS; las listas de días, horas e ítems
 * son las de la última lectura (`aproximado` = la fecha hasta la que llegan), y la ficha lo dice.
 */
export function cerrarPorFusion(s: SnapshotDeVentas, fresco: ResumenDeVentas | null, periodo: string, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): ResumenDeVentas & { aproximado: string } {
  const corte = diaLocalDe(new Date(s.cubre_hasta), desfaseHoras)
  const dias = [...s.dias.filter((d) => d.f < corte), ...(fresco?.por_fecha ?? []).filter((d) => d.f >= corte && d.f.startsWith(periodo))]
  const sum = (k: 'ingreso' | 'tickets' | 'reembolsos' | 'anuladas') => dias.reduce((a, d) => a + d[k], 0)
  const tickets = sum('tickets'), ingreso = r2(sum('ingreso'))
  return {
    periodo, tickets, ingreso, reembolsos: r2(sum('reembolsos')), ticket_medio: tickets ? r2(ingreso / tickets) : 0, anuladas: sum('anuladas'), recortado: false,
    por_item: s.por_item, por_hora: s.por_hora, por_dia: s.por_dia, por_fecha: dias, aproximado: corte,
  }
}


export interface RecibosLeidos { recibos: Array<Record<string, unknown>>; recortado: boolean; paginas: number }
/** lee los recibos desde `desde` hasta `ahora` (páginas de 250 por cursor); un error HTTP se DICE con su código, nunca se lee como «sin ventas» */
export async function leerVentasDeLoyverse(o: { token: string; ahora: Date; desde?: Date; fetch: Fetch; maxPaginas?: number }): Promise<({ ok: true } & RecibosLeidos) | { ok: false; error: string }> {
  const desde = o.desde ?? inicioDelMes(o.ahora).desde
  const max = o.maxPaginas ?? MAX_PAGINAS_DE_VENTAS
  const recibos: Array<Record<string, unknown>> = []
  let cursor = ''
  let recortado = false
  let paginas = 0
  for (let p = 0; p < max; p++) {
    const url = `${LOYVERSE_BASE}/receipts?created_at_min=${encodeURIComponent(desde.toISOString())}&created_at_max=${encodeURIComponent(o.ahora.toISOString())}&limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    let r
    try { r = await o.fetch(url, { headers: { Authorization: `Bearer ${o.token}` } }) } catch (e) { return { ok: false, error: `Loyverse no respondió: ${String((e as Error).message).split(o.token).join('***').slice(0, 120)}` } }
    paginas++
    if (!r.ok) return { ok: false, error: `Loyverse respondió ${r.status} (${r.status === 401 || r.status === 403 ? 'la llave no sirve o no tiene permiso de lectura de recibos' : r.status === 429 ? 'demasiadas llamadas: se reintenta mañana' : r.status === 402 ? 'el plan del punto de venta no deja leer tan atrás: pide «Unlimited sales history»' : 'error del proveedor'})` }
    const b = obj(await r.json())
    recibos.push(...arr(b.receipts))
    cursor = typeof b.cursor === 'string' ? b.cursor : ''
    if (!cursor) break
    if (p === max - 1) recortado = true
  }
  return { ok: true, recibos, recortado, paginas }
}

/** las tiendas (sedes) del punto de venta: id → nombre. Una falla NO frena las ventas: sin nombres, las tiendas se rotulan por su número */
export async function leerTiendasDeLoyverse(o: { token: string; fetch: Fetch }): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  try {
    const r = await o.fetch(`${LOYVERSE_BASE}/stores`, { headers: { Authorization: `Bearer ${o.token}` } })
    if (!r.ok) return m
    for (const s of arr(obj(await r.json()).stores)) { const id = String(s.id ?? ''); const n = String(s.name ?? '').trim(); if (id && n) m.set(id, n) }
  } catch { /* sin nombres */ }
  return m
}

/** un grupo = el total del negocio ('') o una tienda (`tienda-<slug>`); las cifras de cada mes, por grupo */
export interface VentasDelMes {
  periodo: string
  grupo: string
  rotulo: string
  resumen: ResumenDeVentas
  /** mes cerrado por fusión: la fecha hasta la que llegan sus listas de días, horas e ítems */
  aproximado?: string
  /** ventana móvil (no es un mes): los 30 días hasta esta fecha */
  ventana?: string
  /** la fuente no trae el número de tickets (resumen por día de una exportación sin esa columna): no se inventan tickets ni ticket promedio */
  sinTickets?: boolean
}
/**
 * Agrupa los recibos por mes local y, si el punto de venta distingue más de una tienda, también por tienda.
 * Con la lectura RECORTADA (tope de páginas) el mes más viejo —o el más nuevo, si Loyverse entrega del más viejo al más nuevo— queda incompleto y NO se archiva: se declara.
 */
export function ventasPorMes(recibos: Array<Record<string, unknown>>, o: { tiendas?: Map<string, string>; recortado?: boolean; desfaseHoras?: number; /** meses que se pidieron y deben quedar archivados aunque no tengan un solo recibo (un mes sin ventas se dice, no se omite) */ asegurar?: string[] }): { meses: VentasDelMes[]; incompletos: string[] } {
  const dh = o.desfaseHoras ?? DESFASE_HORARIO_POR_DEFECTO_HORAS
  const porMes = new Map<string, Array<Record<string, unknown>>>()
  const ids = new Set<string>()
  let primero = '', ultimo = ''
  for (const r of recibos) {
    const t = new Date(String(r.created_at ?? r.receipt_date ?? ''))
    if (Number.isNaN(t.getTime())) continue
    const mes = mesLocalDe(t, dh)
    ;(porMes.get(mes) ?? porMes.set(mes, []).get(mes)!).push(r)
    if (typeof r.store_id === 'string' && r.store_id) ids.add(r.store_id)
    if (!primero) primero = String(r.created_at ?? ''); ultimo = String(r.created_at ?? '')
  }
  const incompletos: string[] = []
  // lo pedido que no trajo recibos: mes vacío (salvo que la lectura quedó recortada: ahí no se sabe)
  if (!o.recortado) for (const m of o.asegurar ?? []) if (!porMes.has(m)) porMes.set(m, [])
  if (o.recortado && porMes.size) {
    const orden = [...porMes.keys()].sort()
    // entrega del más nuevo al más viejo (lo habitual): el mes más viejo leído quedó a medias
    incompletos.push(primero >= ultimo ? orden[0] : orden[orden.length - 1])
  }
  const tiendas = [...ids].sort()
  const nombreDe = (id: string) => o.tiendas?.get(id) || `tienda ${tiendas.indexOf(id) + 1}`
  const meses: VentasDelMes[] = []
  for (const [periodo, rs] of [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (incompletos.includes(periodo)) continue
    meses.push({ periodo, grupo: '', rotulo: '', resumen: resumirVentas(rs, { periodo, desfaseHoras: dh }) })
    if (tiendas.length > 1) for (const id of tiendas) {
      const rt = rs.filter((r) => r.store_id === id)
      if (!rt.length) continue
      const n = nombreDe(id)
      meses.push({ periodo, grupo: `tienda-${slugDe(n) || String(tiendas.indexOf(id) + 1)}`, rotulo: n, resumen: resumirVentas(rt, { periodo, desfaseHoras: dh }) })
    }
  }
  return { meses, incompletos }
}

/** lo que acompaña al mapa de ítems armado por sinónimo (`config.apify.loyverse_mapa_de_items_meta`): de dónde salió y lo que quedó sin afirmar */
export interface MetaDelMapaDeItems { origen?: string; probables?: Record<string, string>; dudosos?: Record<string, string[]>; sin_equivalente?: string[] }
/** el nombre de un ítem del punto de venta con su equivalencia en la carta web: afirmada, «probable» o «podría ser» (nunca se afirma lo dudoso) */
export function nombreDeItem(n: string, mapa: Record<string, string>, meta?: MetaDelMapaDeItems | null): string {
  if (mapa[n]) return `${mapa[n]}${meta?.probables?.[n] ? ' (probable)' : ''} (en el punto de venta: «${n}»)`
  const cand = meta?.dudosos?.[n]
  if (cand?.length) return `${n} (podría ser ${cand.map((c) => `«${c}»`).join(' o ')}; sin afirmar)`
  return n
}
export interface EntradaDeFichasDeVentas { client_id: string; meses: VentasDelMes[]; ahora: Date; mapaDeItems?: Record<string, string>; mapaMeta?: MetaDelMapaDeItems | null; /** las cifras vienen de una exportación del Back Office (no de la API): se dice y se fecha con la de la exportación */ exportacion?: { fecha: string } }
/** el prefijo único de las cifras del punto de venta: `metrica:loyverse:<métrica>:<AAAA-MM>[:<tienda>]` */
export const PREFIJO_DE_VENTAS = 'metrica:loyverse:'
/**
 * UNA ficha por mes, por métrica (y por tienda si el punto de venta distingue tiendas): ingreso, tickets, ticket promedio, días y horas fuertes, ítems más vendidos.
 *  · SOLO ingreso (los costos del punto de venta están en cero: ninguna ficha dice margen); la moneda es la del punto de venta;
 *  · mes CERRADO: ficha que no vence y no se reescribe (la misma `ref`); mes EN CURSO: parcial, rotulado, se reemplaza cada día y vence en 3 días si el brazo deja de correr.
 */
export function fichasDeVentas(e: EntradaDeFichasDeVentas): FichaDeBrazo[] {
  const iso = e.ahora.toISOString()
  const dia = iso.slice(0, 10)
  const mesEnCurso = mesLocalDe(e.ahora)
  const hasta = new Date(e.ahora.getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  const mapa = e.mapaDeItems ?? {}
  const meta = e.mapaMeta ?? null
  const automatico = !!meta?.origen
  const nombreDe = (n: string) => nombreDeItem(n, mapa, meta)
  const out: FichaDeBrazo[] = []
  for (const m of e.meses) {
    const r = m.resumen
    const enCurso = m.periodo === mesEnCurso
    if (!m.ventana && m.periodo > mesEnCurso) continue
    const parcial = enCurso || !!m.ventana
    // el período que cubre la cifra (fechas locales): quien la lea como ventana de tiempo no tiene que interpretar el atributo
    const [pa, pm] = m.periodo.split('-').map(Number)
    const periodoDesde = m.ventana ? diaLocalDe(new Date(e.ahora.getTime() - VENTANA_MOVIL_DIAS * DIA_EN_MS)) : `${m.periodo}-01`
    const periodoHasta = m.ventana ? m.ventana : enCurso ? dia : `${m.periodo}-${String(new Date(Date.UTC(pa, pm, 0)).getUTCDate()).padStart(2, '0')}`
    const pTxt = m.ventana ? 'los últimos 30 días' : m.periodo
    const sufijo = m.grupo ? `:${m.grupo}` : ''
    const dondeTxt = m.rotulo ? ` · tienda «${m.rotulo}»` : ''
    const estado = m.ventana ? `ventana móvil de los 30 días hasta el ${m.ventana}` : enCurso ? `MES EN CURSO, parcial al ${dia}` : 'mes cerrado'
    const nota = m.aproximado ? ` Ingreso, tickets y ticket promedio completos; las listas de días, horas e ítems llegan hasta el ${m.aproximado} (el plan del punto de venta solo deja leer 31 días atrás).` : ''
    const deDonde = e.exportacion ? `tomado de la exportación del Back Office de Loyverse del ${e.exportacion.fecha} (no de la API)` : 'medido en el punto de venta del cliente'
    const sello = `Periodo ${pTxt} (${estado}), ${deDonde}. Solo ingresos: el punto de venta no trae costos, no es margen. Moneda del punto de venta.${nota}`
    const ficha = (metrica: string, titulo: string, contenido: string, extra: Partial<FichaDeBrazo> = {}): FichaDeBrazo => ({
      brazo: 'propios', alcance: 'cliente', client_id: e.client_id, ref: `brazo:propios:loyverse:${metrica}:${m.periodo}${sufijo}${parcial ? `:${dia}` : ''}`,
      atributo: `${PREFIJO_DE_VENTAS}${metrica}:${m.periodo}${sufijo}`, clase: 'metrica', titulo: `${titulo} · ${pTxt}${dondeTxt}`.slice(0, 160), contenido,
      origen: 'plataforma', fuente_url: null, fecha_fuente: e.exportacion?.fecha ?? dia, observado_en: e.exportacion ? `${e.exportacion.fecha}T12:00:00.000Z` : iso, vigente_hasta: parcial ? hasta : null, decision: 'reemplaza', ...(parcial ? { renueva_vigencia: true } : {}),
      datos: { periodo: m.periodo, desde: periodoDesde, hasta: periodoHasta, en_curso: enCurso, ...(m.ventana ? { ventana_hasta: m.ventana } : {}), ...(m.aproximado ? { aproximado_hasta: m.aproximado } : {}), ...(enCurso && !m.grupo ? { snapshot: snapshotDe(r, iso) } : {}), tienda: m.rotulo || null, fuente: e.exportacion ? 'loyverse_exportacion' : 'loyverse', ...(e.exportacion ? { exportado_en: e.exportacion.fecha } : {}), tickets: m.sinTickets ? null : r.tickets, ingreso: r.ingreso, ticket_promedio: m.sinTickets ? null : r.ticket_medio, reembolsos: r.reembolsos },
      ...extra,
    })
    out.push(ficha('ingreso', 'Ventas del punto de venta',
      `${m.sinTickets ? `Ventas de ${pTxt}${dondeTxt}: ${coma(r.ingreso)}; reembolsos ${coma(r.reembolsos)} (la exportación no trae el número de tickets).` : r.tickets ? `Ventas de ${pTxt}${dondeTxt}: ${coma(r.ingreso)} en ${r.tickets} tickets (ticket promedio ${coma(r.ticket_medio)}); reembolsos ${coma(r.reembolsos)}; ${r.anuladas} recibos anulados no cuentan.` : `Sin ventas registradas en el punto de venta en ${pTxt}${dondeTxt}.`} ${sello}`,
      { metrica: { nombre: 'loyverse:ingreso', valor: r.ingreso, unidad: 'moneda del punto de venta' } }))
    if (m.sinTickets ? !r.ingreso : !r.tickets) continue
    if (!m.sinTickets) out.push(ficha('tickets', 'Tickets del punto de venta', `Tickets de ${pTxt}${dondeTxt}: ${r.tickets}. ${sello}`, { metrica: { nombre: 'loyverse:tickets', valor: r.tickets, unidad: 'tickets' } }))
    if (!m.sinTickets) out.push(ficha('ticket_promedio', 'Ticket promedio del punto de venta', `Ticket promedio de ${pTxt}${dondeTxt}: ${coma(r.ticket_medio)}. ${sello}`, { metrica: { nombre: 'loyverse:ticket_promedio', valor: r.ticket_medio, unidad: 'moneda del punto de venta' } }))
    const horas = r.por_hora.slice(0, 3).map((h) => `${String(h.hora).padStart(2, '0')}:00 (${h.tickets} tickets)`).join(', ')
    const dias = r.por_dia.slice(0, 3).map((d) => (m.sinTickets ? `${d.dia} (${coma(d.ingreso)})` : `${d.dia} (${d.tickets} tickets, ${coma(d.ingreso)})`)).join(', ')
    if (dias || horas) out.push(ficha('dias_y_horas', 'Días y horas fuertes', `${dias ? `Días con más ${m.sinTickets ? 'ingreso' : 'tickets'} en ${pTxt}${dondeTxt}: ${dias}. ` : ''}${horas ? `Horas con más tickets (hora local): ${horas}. ` : ''}${sello}`))
    if (r.por_item.length) {
      const sinMapa = r.por_item.slice(0, 10).filter((x) => !mapa[x.item]).length
      const top = r.por_item.slice(0, 10).map((x) => `${nombreDe(x.item)}: ${r2(x.unidades)} u., ${coma(x.ingreso)}`).join(' · ')
      out.push(ficha('items', 'Ítems más vendidos', `Los 10 ítems que más ingreso dejaron en ${pTxt}${dondeTxt}: ${top}. ${automatico ? `Equivalencias con la carta web armadas automáticamente por sinónimo (no las confirmó el dueño). ${sinMapa ? `${sinMapa} ítem(s) sin equivalente afirmado en la carta web: son nombres del punto de venta. ` : ''}` : sinMapa ? `${sinMapa} ítem(s) sin equivalencia confirmada con la carta web: son nombres del punto de venta. ` : ''}${sello}`))
    }
  }
  return out
}

// ── Meta ─────────────────────────────────────────────────────────────────────────────────────────
export const META_GRAPH = 'https://graph.facebook.com/v21.0'
const accion = (a: unknown, tipo: string): number => num(arr(a).find((x) => x.action_type === tipo)?.value)
export async function leerMeta(o: { token: string; adAccountId?: string | null; igUserId?: string | null; fetch: Fetch }): Promise<{ anuncios: Record<string, unknown> | null; instagram: Record<string, unknown> | null; errores: string[] }> {
  const errores: string[] = []
  const limpia = (m: string) => m.split(o.token).join('***').slice(0, 140)
  const pedir = async (ruta: string): Promise<Record<string, unknown> | null> => {
    // el token va en la cabecera: nunca en la URL (las URL se registran)
    try {
      const r = await o.fetch(`${META_GRAPH}/${ruta}`, { headers: { Authorization: `Bearer ${o.token}` } })
      const b = obj(await r.json())
      if (!r.ok) { errores.push(`Meta respondió ${r.status}${b.error ? `: ${limpia(String(obj(b.error).message ?? 'sin detalle'))}` : ''}`); return null }
      return b
    } catch (e) { errores.push(`Meta no respondió: ${limpia(String((e as Error).message))}`); return null }
  }
  let anuncios: Record<string, unknown> | null = null
  let instagram: Record<string, unknown> | null = null
  if (o.adAccountId) {
    const cuenta = o.adAccountId.startsWith('act_') ? o.adAccountId : `act_${o.adAccountId}`
    const b = await pedir(`${cuenta}/insights?fields=spend,impressions,reach,clicks,ctr,cpc,actions,cost_per_action_type&date_preset=last_30d&level=account`)
    const f = arr(b?.data)[0]
    if (f) anuncios = { gasto: num(f.spend), impresiones: num(f.impressions), alcance: num(f.reach), clics: num(f.clicks), ctr: num(f.ctr), cpc: num(f.cpc), leads: accion(f.actions, 'lead'), compras: accion(f.actions, 'purchase'), mensajes: accion(f.actions, 'onsite_conversion.messaging_conversation_started_7d') }
    else if (b) anuncios = { sin_gasto: true }
  }
  if (o.igUserId) {
    const b = await pedir(`${o.igUserId}?fields=followers_count,media_count`)
    if (b) instagram = { seguidores: num(b.followers_count), publicaciones: num(b.media_count) }
  }
  return { anuncios, instagram, errores }
}
export function fichasDeMeta(e: { client_id: string; ahora: Date; anuncios: Record<string, unknown> | null; instagram: Record<string, unknown> | null }): FichaDeBrazo[] {
  const iso = e.ahora.toISOString()
  const hasta = new Date(e.ahora.getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  const mes = iso.slice(0, 7)
  const out: FichaDeBrazo[] = []
  const base = { brazo: 'propios' as const, alcance: 'cliente' as const, client_id: e.client_id, origen: 'plataforma' as const, fuente_url: null, fecha_fuente: iso.slice(0, 10), observado_en: iso, vigente_hasta: hasta, decision: 'reemplaza' as const }
  if (e.anuncios) {
    const a = e.anuncios
    out.push({ ...base, ref: `brazo:propios:meta:anuncios:${iso.slice(0, 10)}`, atributo: 'propios:meta:anuncios:ultimos_30d', clase: 'propios_meta', titulo: 'Anuncios en Meta · últimos 30 días',
      contenido: a.sin_gasto === true
        ? `Cuenta de anuncios de Meta del cliente: sin gasto en los últimos 30 días (medido ${iso.slice(0, 10)}).`
        : `Cuenta de anuncios de Meta del cliente, últimos 30 días (medido ${iso.slice(0, 10)}): gasto US$ ${coma(num(a.gasto))}, alcance ${num(a.alcance)}, impresiones ${num(a.impresiones)}, clics ${num(a.clics)} (CTR ${coma(num(a.ctr))} %, costo por clic US$ ${coma(num(a.cpc))}), `
          + `${num(a.mensajes)} conversaciones iniciadas, ${num(a.leads)} contactos, ${num(a.compras)} compras. Cifras de la propia cuenta del cliente.` })
  }
  if (e.instagram) {
    out.push({ ...base, ref: `brazo:propios:meta:instagram:${iso.slice(0, 10)}`, atributo: `propios:meta:instagram:cuenta:${mes}`, clase: 'propios_meta', titulo: 'Cuenta de Instagram · API de Meta',
      contenido: `Cuenta de Instagram del cliente (API de Meta, medido ${iso.slice(0, 10)}): ${num(e.instagram.seguidores)} seguidores y ${num(e.instagram.publicaciones)} publicaciones.` })
  }
  return out
}

/**
 * Cuántos días hacia atrás deja leer el plan de Loyverse del cliente (el plan básico: 31; con «Unlimited sales history»: sin tope). Es DATO del entorno
 * (`PORTERO_LOYVERSE_HISTORIAL_DIAS`), no una constante: cuando el dueño amplíe el plan se sube el número y el relleno de 12 meses corre solo.
 */
export const HISTORIAL_DE_LOYVERSE_DIAS_POR_OMISION = 31
export const VENTANA_MOVIL_DIAS = 30
/** una sola función para el orquestador: lee con las llaves del cliente y devuelve las fichas; sin llave es «sin material» y dice cuál variable falta */
export interface EntradaDelBrazoPropios {
  client_id: string
  slug: string
  config?: unknown
  ahora: Date
  env: Record<string, string | undefined>
  fetch: Fetch
  /** los meses cerrados que YA están archivados (del total): no se piden ni se reescriben */
  mesesCerrados?: ReadonlySet<string>
  /** meses que terminaron y solo tienen la lectura parcial guardada: si su comienzo ya no se puede leer, se cierran por fusión con lo recién leído */
  parciales?: ReadonlyMap<string, SnapshotDeVentas>
}
export async function brazoDePropios(o: EntradaDelBrazoPropios): Promise<ResultadoDeUnBrazo> {
  const cred = credencialesDe(o.slug, o.env)
  const declarado: string[] = []
  const fichas: FichaDeBrazo[] = []
  const mapa = obj(obj(obj(o.config).apify).loyverse_mapa_de_items) as Record<string, string>
  if (cred.loyverse_token) {
    const enCurso = mesLocalDe(o.ahora)
    const dias = Number(o.env.PORTERO_LOYVERSE_HISTORIAL_DIAS)
    const historial = Number.isFinite(dias) && dias > 0 ? dias : HISTORIAL_DE_LOYVERSE_DIAS_POR_OMISION
    // el proveedor rechaza TODO pedido que empiece antes de su límite (402): se pide desde un poco después
    const minDesde = new Date(o.ahora.getTime() - historial * DIA_EN_MS + 3_600_000)
    const pendientes = mesesCerradosHasta(o.ahora).filter((m) => !o.mesesCerrados?.has(m))
    const directos = pendientes.filter((m) => inicioDelPeriodo(m) >= minDesde)
    const parciales = o.parciales ?? new Map<string, SnapshotDeVentas>()
    const porFusion = pendientes.filter((m) => !directos.includes(m) && parciales.has(m))
    const sinRecuperar = pendientes.filter((m) => !directos.includes(m) && !parciales.has(m))
    const inicios = [inicioDelPeriodo(enCurso), new Date(o.ahora.getTime() - VENTANA_MOVIL_DIAS * DIA_EN_MS), ...directos.map((m) => inicioDelPeriodo(m)), ...porFusion.map((m) => inicioDelDiaLocal(diaLocalDe(new Date(parciales.get(m)!.cubre_hasta))))]
    const desde = new Date(Math.max(Math.min(...inicios.map((d) => d.getTime())), minDesde.getTime()))
    const v = await leerVentasDeLoyverse({ token: cred.loyverse_token, ahora: o.ahora, desde, fetch: o.fetch, maxPaginas: directos.length ? MAX_PAGINAS_DEL_RELLENO : MAX_PAGINAS_DE_VENTAS })
    if (v.ok) {
      // si hay más de una tienda, los nombres (una llamada más; sin ellas se rotulan por número)
      const variasTiendas = new Set(v.recibos.map((r) => r.store_id).filter((x) => typeof x === 'string' && x)).size > 1
      const tiendas = variasTiendas ? await leerTiendasDeLoyverse({ token: cred.loyverse_token, fetch: o.fetch }) : undefined
      const agrupado = ventasPorMes(v.recibos, { recortado: v.recortado, tiendas, asegurar: directos })
      // solo lo que se leyó ENTERO y no está ya archivado: el mes en curso y los cerrados que caben en la ventana (un mes que la ventana corta a la mitad no se archiva)
      const meses: VentasDelMes[] = agrupado.meses.filter((m) => m.periodo === enCurso || directos.includes(m.periodo))
      if (!v.recortado) {
        for (const p of porFusion) {
          const snap = parciales.get(p)!
          const fresco = agrupado.meses.find((m) => m.periodo === p && m.grupo === '')?.resumen ?? null
          const f = cerrarPorFusion(snap, fresco, p)
          meses.push({ periodo: p, grupo: '', rotulo: '', resumen: f, aproximado: f.aproximado })
        }
        // la ventana móvil de los últimos 30 días (lo único que hoy cubre «el mes pasado» mientras el plan no deja leer más atrás)
        const hace30 = new Date(o.ahora.getTime() - VENTANA_MOVIL_DIAS * DIA_EN_MS).toISOString()
        const rv = v.recibos.filter((r) => String(r.created_at ?? '') >= hace30)
        meses.push({ periodo: 'ultimos_30_dias', grupo: '', rotulo: '', resumen: resumirVentas(rv, { periodo: 'ultimos_30_dias' }), ventana: diaLocalDe(o.ahora) })
      } else if (porFusion.length) declarado.push(`punto de venta: ${porFusion.join(', ')} no se pudo cerrar (la lectura quedó recortada)`)
      fichas.push(...fichasDeVentas({ client_id: o.client_id, meses, ahora: o.ahora, mapaDeItems: mapa, mapaMeta: obj(obj(obj(o.config).apify).loyverse_mapa_de_items_meta) as MetaDelMapaDeItems }))
      if (agrupado.incompletos.length) declarado.push(`punto de venta: ${v.paginas} páginas leídas (tope); ${agrupado.incompletos.join(', ')} quedó incompleto y no se archivó`)
      if (directos.length) declarado.push(`punto de venta: relleno de ${directos.length} mes(es) cerrado(s) en ${v.paginas} llamada(s)`)
      if (porFusion.length && !v.recortado) declarado.push(`punto de venta: ${porFusion.join(', ')} cerrado(s) con lo guardado y lo leído desde la última lectura (las listas de días, horas e ítems llegan hasta esa lectura)`)
      if (sinRecuperar.length) declarado.push(`punto de venta: ${sinRecuperar.length} mes(es) cerrado(s) anterior(es) fuera de lo que deja leer el plan (${historial} días): para rellenarlos hace falta ampliar el historial de ventas del punto de venta`)
    } else declarado.push(v.error)
  } else declarado.push(`punto de venta: falta ${cred.prefijo}LOYVERSE_TOKEN`)
  if (cred.meta_token && (cred.meta_ad_account_id || cred.meta_ig_user_id)) {
    const m = await leerMeta({ token: cred.meta_token, adAccountId: cred.meta_ad_account_id, igUserId: cred.meta_ig_user_id, fetch: o.fetch })
    fichas.push(...fichasDeMeta({ client_id: o.client_id, ahora: o.ahora, anuncios: m.anuncios, instagram: m.instagram }))
    declarado.push(...m.errores)
  } else declarado.push(`Meta: falta ${cred.meta_token ? `${cred.prefijo}META_AD_ACCOUNT_ID o ${cred.prefijo}META_IG_USER_ID` : `${cred.prefijo}META_TOKEN`}`)
  return { brazo: 'propios', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado, ...(fichas.length ? {} : { detalle: declarado.join(' · ') }) }
}
