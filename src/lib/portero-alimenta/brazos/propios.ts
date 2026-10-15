/**
 * BRAZO · DATOS PROPIOS DEL CLIENTE (cifras MEDIDAS, no supuestos) · lectores con la llave DEL CLIENTE.
 *  · Punto de venta (Loyverse): ventas del mes por ítem, por hora y por día de la semana. SOLO ingreso: los costos del punto de venta suelen estar en cero (Náufrago: 68 artículos sin costo),
 *    así que ninguna ficha dice «margen». Los nombres de ítem son los del punto de venta; la equivalencia con la carta web la confirma el dueño (`config.apify.loyverse_mapa_de_items`), nunca se deduce por parecido.
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
export const MAX_PAGINAS_DE_VENTAS = 20
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
  recortado: boolean
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** el primer instante del mes local de `ahora`, en UTC */
export function inicioDelMes(ahora: Date, desfaseHoras = DESFASE_HORARIO_POR_DEFECTO_HORAS): { periodo: string; desde: Date } {
  const local = new Date(ahora.getTime() + desfaseHoras * 3_600_000)
  const a = local.getUTCFullYear(), m = local.getUTCMonth()
  return { periodo: `${a}-${String(m + 1).padStart(2, '0')}`, desde: new Date(Date.UTC(a, m, 1) - desfaseHoras * 3_600_000) }
}
export function resumirVentas(recibos: Array<Record<string, unknown>>, o: { periodo: string; desfaseHoras?: number; recortado?: boolean }): ResumenDeVentas {
  const dh = o.desfaseHoras ?? DESFASE_HORARIO_POR_DEFECTO_HORAS
  let tickets = 0, ingreso = 0, reembolsos = 0, anuladas = 0
  const items = new Map<string, LineaDeVenta>()
  const horas = new Map<number, { tickets: number; ingreso: number }>()
  const dias = new Map<string, { tickets: number; ingreso: number }>()
  for (const r of recibos) {
    if (r.cancelled_at) { anuladas++; continue }
    const total = num(r.total_money)
    if (String(r.receipt_type ?? 'SALE').toUpperCase() === 'REFUND') { reembolsos += Math.abs(total); continue }
    tickets++; ingreso += total
    const t = new Date(String(r.created_at ?? r.receipt_date ?? ''))
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
    por_item: [...items.values()].map((x) => ({ ...x, ingreso: r2(x.ingreso) })).sort((a, b) => b.ingreso - a.ingreso),
    por_hora: [...horas.entries()].map(([hora, v]) => ({ hora, tickets: v.tickets, ingreso: r2(v.ingreso) })).sort((a, b) => b.tickets - a.tickets),
    por_dia: [...dias.entries()].map(([dia, v]) => ({ dia, tickets: v.tickets, ingreso: r2(v.ingreso) })).sort((a, b) => b.tickets - a.tickets),
  }
}

/** lee los recibos del mes (hasta 20 páginas de 250); un error HTTP se DICE con su código, nunca se lee como «sin ventas» */
export async function leerVentasDeLoyverse(o: { token: string; ahora: Date; fetch: Fetch }): Promise<{ ok: true; resumen: ResumenDeVentas } | { ok: false; error: string }> {
  const { periodo, desde } = inicioDelMes(o.ahora)
  const recibos: Array<Record<string, unknown>> = []
  let cursor = ''
  let recortado = false
  for (let p = 0; p < MAX_PAGINAS_DE_VENTAS; p++) {
    const url = `${LOYVERSE_BASE}/receipts?created_at_min=${encodeURIComponent(desde.toISOString())}&created_at_max=${encodeURIComponent(o.ahora.toISOString())}&limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    let r
    try { r = await o.fetch(url, { headers: { Authorization: `Bearer ${o.token}` } }) } catch (e) { return { ok: false, error: `Loyverse no respondió: ${String((e as Error).message).replace(o.token, '***').slice(0, 120)}` } }
    if (!r.ok) return { ok: false, error: `Loyverse respondió ${r.status} (${r.status === 401 || r.status === 403 ? 'la llave no sirve o no tiene permiso de lectura de recibos' : 'error del proveedor'})` }
    const b = obj(await r.json())
    recibos.push(...arr(b.receipts))
    cursor = typeof b.cursor === 'string' ? b.cursor : ''
    if (!cursor) break
    if (p === MAX_PAGINAS_DE_VENTAS - 1) recortado = true
  }
  return { ok: true, resumen: resumirVentas(recibos, { periodo, recortado }) }
}

export interface EntradaDeFichasDeVentas { client_id: string; resumen: ResumenDeVentas; ahora: Date; mapaDeItems?: Record<string, string> }
export function fichasDeVentas(e: EntradaDeFichasDeVentas): FichaDeBrazo[] {
  const r = e.resumen
  const iso = e.ahora.toISOString()
  const hasta = new Date(e.ahora.getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  const sello = `Periodo ${r.periodo}, medido en el punto de venta del cliente el ${iso.slice(0, 10)}. Solo ingreso: el punto de venta no trae costos, no es margen.${r.recortado ? ` LECTURA RECORTADA a ${MAX_PAGINAS_DE_VENTAS * 250} recibos: las cifras pueden ser menores a las reales.` : ''}`
  const mapa = e.mapaDeItems ?? {}
  const nombreDe = (n: string) => (mapa[n] ? `${mapa[n]} (en el punto de venta: «${n}»)` : n)
  const sinMapa = r.por_item.filter((x) => !mapa[x.item]).length
  const ficha = (tipo: string, titulo: string, contenido: string): FichaDeBrazo => ({
    brazo: 'propios', alcance: 'cliente', client_id: e.client_id, ref: `brazo:propios:loyverse:${tipo}:${r.periodo}:${iso.slice(0, 10)}`, atributo: `propios:loyverse:${tipo}:${r.periodo}`, clase: 'propios_ventas',
    titulo, contenido, origen: 'plataforma', fuente_url: null, fecha_fuente: iso.slice(0, 10), observado_en: iso, vigente_hasta: hasta, decision: 'reemplaza',
  })
  const top = r.por_item.slice(0, 10).map((x) => `${nombreDe(x.item)}: ${r2(x.unidades)} u., US$ ${coma(x.ingreso)}`).join(' · ')
  const horas = r.por_hora.slice(0, 3).map((h) => `${String(h.hora).padStart(2, '0')}:00 (${h.tickets} tickets)`).join(', ')
  const dias = r.por_dia.slice(0, 3).map((d) => `${d.dia} (${d.tickets} tickets, US$ ${coma(d.ingreso)})`).join(', ')
  return [
    ficha('resumen', `Ventas del punto de venta · ${r.periodo}`,
      `Ventas del mes ${r.periodo}: US$ ${coma(r.ingreso)} en ${r.tickets} tickets (ticket medio US$ ${coma(r.ticket_medio)}); reembolsos US$ ${coma(r.reembolsos)}; ${r.anuladas} recibos anulados no cuentan. ${sello}`),
    ...(r.por_item.length ? [ficha('items', `Ventas por ítem · ${r.periodo}`,
      `Los 10 ítems que más ingreso dejaron en ${r.periodo}: ${top}. ${sinMapa ? `${sinMapa} ítem(s) sin equivalencia confirmada con la carta web: son nombres del punto de venta. ` : ''}${sello}`)] : []),
    ...(r.por_hora.length ? [ficha('horas', `Horas y días fuertes · ${r.periodo}`,
      `Horas con más tickets en ${r.periodo} (hora local): ${horas}. Días con más tickets: ${dias}. ${sello}`)] : []),
  ]
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

/** una sola función para el orquestador: lee con las llaves del cliente y devuelve las fichas; sin llave es «sin material» y dice cuál variable falta */
export async function brazoDePropios(o: { client_id: string; slug: string; config?: unknown; ahora: Date; env: Record<string, string | undefined>; fetch: Fetch }): Promise<ResultadoDeUnBrazo> {
  const cred = credencialesDe(o.slug, o.env)
  const declarado: string[] = []
  const fichas: FichaDeBrazo[] = []
  const mapa = obj(obj(obj(o.config).apify).loyverse_mapa_de_items) as Record<string, string>
  if (cred.loyverse_token) {
    const v = await leerVentasDeLoyverse({ token: cred.loyverse_token, ahora: o.ahora, fetch: o.fetch })
    if (v.ok) fichas.push(...fichasDeVentas({ client_id: o.client_id, resumen: v.resumen, ahora: o.ahora, mapaDeItems: mapa }))
    else declarado.push(v.error)
  } else declarado.push(`punto de venta: falta ${cred.prefijo}LOYVERSE_TOKEN`)
  if (cred.meta_token && (cred.meta_ad_account_id || cred.meta_ig_user_id)) {
    const m = await leerMeta({ token: cred.meta_token, adAccountId: cred.meta_ad_account_id, igUserId: cred.meta_ig_user_id, fetch: o.fetch })
    fichas.push(...fichasDeMeta({ client_id: o.client_id, ahora: o.ahora, anuncios: m.anuncios, instagram: m.instagram }))
    declarado.push(...m.errores)
  } else declarado.push(`Meta: falta ${cred.meta_token ? `${cred.prefijo}META_AD_ACCOUNT_ID o ${cred.prefijo}META_IG_USER_ID` : `${cred.prefijo}META_TOKEN`}`)
  return { brazo: 'propios', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado, ...(fichas.length ? {} : { detalle: declarado.join(' · ') }) }
}
