/**
 * EL BRAZO DE VIDEO · cliente de la API de Higgsfield (Seedance) · fase 2 del encargo del 31-oct.
 * Puro salvo `fetch` (inyectable): nada aquí escribe en la base ni imprime la llave. Doc oficial: https://docs.higgsfield.ai/docs/authentication.md ·
 * https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md · https://docs.higgsfield.ai/docs/concepts/requests.md
 *
 * Lo que la doc NO dice y se verificó el 31-oct con la llave real (solo estimación, gratis):
 *  · la consola entrega UN valor que ya viene como `id:secreto`; se manda tal cual en `Authorization: Key <valor>`;
 *  · `POST /estimate/{modelo}` NO devuelve un número para Seedance: devuelve `{type:'description', pricing_description:'…'}` con la FÓRMULA
 *    (tokens = ceil(alto × ancho × segundos × 24 / 1024) y precio por 1.000 tokens según resolución), «antes de cualquier descuento del cliente».
 *    El costo se calcula aquí con esa fórmula; si el texto cambia y no se puede leer, el brazo NO gasta (fallo cerrado).
 */

export const BASE_HIGGSFIELD = 'https://api.higgsfield.ai'
/** el nombre de la credencial en Doppler/Vercel (adenda 2 del encargo, 12:05Z): un solo valor; nunca se lee fuera de `cabeceras` */
export const VARIABLE_DE_LA_LLAVE = 'HIGGSFIELD_API_KEY_V2'

export type Fetch = typeof fetch

export function cabeceras(llave: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Key ${llave}`, 'Content-Type': 'application/json', ...extra }
}

/**
 * tarifas leídas de la descripción de la estimación, por resolución, con y sin video de entrada. `unidad` dice cómo se cobran:
 *  · `mil_tokens` (lo que publicaba el proveedor el 31-oct): US$ por 1.000 tokens de video (tokens = alto × ancho × segundos × 24 / 1024);
 *  · `segundo` (lo que publica desde el 11-nov, leído con la llave real): US$ por segundo de video generado; la duración del video de entrada NO se cobra.
 */
export interface Tarifas { unidad: 'mil_tokens' | 'segundo'; por_mil_tokens: Record<string, number>; con_video_entrada: Record<string, number>; texto: string }

const RESOLUCION = /\b(480p|720p|1080p|4k)\b/gi
const PRECIO = /\$\s?(\d[\d,]*(?:\.\d+)?)/g
/** lo que puede separar resoluciones de un mismo grupo («480p/720p/1080p», «480p or 720p») */
const ENTRE_RESOLUCIONES = /^\s*(?:\/|,|or|and|y|o)?\s*$/i
/** un precio va DESPUÉS de su resolución («480p: $0.1177», «4K $0.008») si entre ellos solo hay signos */
const RESOLUCION_Y_PRECIO = /^[\s:=–—-]*$/
/** o va ANTES («$0.0214 at 480p») si entre ellos solo hay un «at»/«@» */
const PRECIO_Y_RESOLUCION = /^\s*(?:at|@|en|a)?\s*$/i

interface Pieza { tipo: 'res'; valores: string[]; desde: number; hasta: number }
interface Precio { tipo: 'usd'; valor: number; desde: number; hasta: number }

/** los pares resolución → precio de un trozo de texto, en el orden en que aparecen (sin frases fijas: solo resoluciones, precios en US$ y lo que los separa) */
function paresDe(t: string): Array<{ res: string; usd: number }> {
  const res: Pieza[] = []
  for (const m of t.matchAll(RESOLUCION)) {
    const v = m[1].toLowerCase(), desde = m.index ?? 0, hasta = desde + m[0].length
    const ult = res[res.length - 1]
    if (ult && ENTRE_RESOLUCIONES.test(t.slice(ult.hasta, desde))) { ult.valores.push(v); ult.hasta = hasta } else res.push({ tipo: 'res', valores: [v], desde, hasta })
  }
  const precios: Precio[] = [...t.matchAll(PRECIO)].map((m) => ({ tipo: 'usd', valor: Number(m[1].replace(/,/g, '')), desde: m.index ?? 0, hasta: (m.index ?? 0) + m[0].length }))
  const pares: Array<{ res: string; usd: number; en: number }> = []
  for (const p of precios) {
    if (!(p.valor > 0) || !Number.isFinite(p.valor)) continue
    const antes = [...res].reverse().find((r) => r.hasta <= p.desde)
    const despues = res.find((r) => r.desde >= p.hasta)
    const grupo = antes && RESOLUCION_Y_PRECIO.test(t.slice(antes.hasta, p.desde)) ? antes : despues && PRECIO_Y_RESOLUCION.test(t.slice(p.hasta, despues.desde)) ? despues : null
    if (grupo) for (const v of grupo.valores) pares.push({ res: v, usd: p.valor, en: p.desde })
  }
  return pares.sort((a, b) => a.en - b.en).map(({ res: r, usd }) => ({ res: r, usd }))
}

/**
 * Lee las tarifas del texto libre que devuelve `/estimate`. NO busca frases fijas (11-nov · el proveedor cambió el texto y el brazo dejó de cotizar; regla de Emilio: nada de listas):
 *  · parte el texto en oraciones y en cada una toma los pares resolución → precio en US$;
 *  · la unidad sale de la oración: si nombra «tokens», es por 1.000 tokens; si no, vale la del texto entero (por segundo si el texto habla de segundos);
 *    si hay tarifas por tokens se usan esas (son la fórmula exacta; las «por segundo» de ese mismo texto eran aproximadas para un solo cuadro);
 *  · el PRIMER precio de cada resolución es sin video de entrada; un SEGUNDO precio de la misma resolución es con video de entrada.
 * Devuelve null si no halla ningún precio con su resolución (fallo cerrado: el brazo no envía nada a ciegas).
 */
export function leerTarifas(descripcion: string): Tarifas | null {
  const oraciones = String(descripcion ?? '').split(/(?<=\.)\s+|\n+/)
  const dePorSegundo = /\bsecond/i.test(descripcion)
  const porTokens: Array<{ res: string; usd: number }> = [], porSegundo: Array<{ res: string; usd: number }> = []
  for (const o of oraciones) {
    const pares = paresDe(o)
    if (!pares.length) continue
    if (/\btokens?\b/i.test(o)) porTokens.push(...pares)
    else if (dePorSegundo) porSegundo.push(...pares)
  }
  const unidad: Tarifas['unidad'] | null = porTokens.length ? 'mil_tokens' : porSegundo.length ? 'segundo' : null
  if (!unidad) return null
  const base: Record<string, number> = {}, conVideo: Record<string, number> = {}
  for (const p of unidad === 'mil_tokens' ? porTokens : porSegundo) {
    if (base[p.res] === undefined) base[p.res] = p.usd
    else if (conVideo[p.res] === undefined) conVideo[p.res] = p.usd
  }
  // sin precio con video de entrada: por tokens, la regla publicada (×0,6); por segundo, la misma tarifa (la oficina nunca manda video de entrada)
  for (const [k, v] of Object.entries(base)) if (conVideo[k] === undefined) conVideo[k] = unidad === 'mil_tokens' ? Math.round(v * 0.6 * 1e6) / 1e6 : v
  return { unidad, por_mil_tokens: base, con_video_entrada: conVideo, texto: descripcion }
}

/** alto × ancho de salida por resolución y relación de cuadro (el lado corto es la resolución; el largo sale de la relación, redondeado a par) */
export function dimensiones(resolucion: string, relacion: string): { ancho: number; alto: number } | null {
  const corto = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 }[resolucion.toLowerCase()]
  const m = relacion.match(/^(\d+):(\d+)$/)
  if (!corto || !m) return null
  const a = Number(m[1]), b = Number(m[2])
  if (!(a > 0 && b > 0)) return null
  const par = (x: number) => Math.round(x / 2) * 2
  if (a >= b) return { ancho: par((corto * a) / b), alto: corto }
  return { ancho: corto, alto: par((corto * b) / a) }
}

export const tokensDeVideo = (ancho: number, alto: number, segundos: number) => Math.ceil((alto * ancho * segundos * 24) / 1024)

/** costo en US$ de un pedido según la fórmula publicada; `segundosDeEntrada` = duración de los videos de referencia (también se cobran) */
export function costoEstimadoUsd(t: Tarifas, p: { resolucion: string; relacion: string; segundos: number; segundosDeEntrada?: number }): number | null {
  const d = dimensiones(p.resolucion, p.relacion)
  const conVideo = (p.segundosDeEntrada ?? 0) > 0
  const tarifa = (conVideo ? t.con_video_entrada : t.por_mil_tokens)[p.resolucion.toLowerCase()]
  if (!d || typeof tarifa !== 'number') return null
  // 11-nov · por segundo: tarifa × segundos generados (el video de entrada no se cobra, según el texto del proveedor)
  if (t.unidad === 'segundo') return Math.round(tarifa * p.segundos * 10000) / 10000
  const tokens = tokensDeVideo(d.ancho, d.alto, p.segundos + (p.segundosDeEntrada ?? 0))
  return Math.round((tokens / 1000) * tarifa * 10000) / 10000
}

export interface RespuestaDeEstimacion { usd?: number; tarifas?: Tarifas; descripcion?: string; status: number; correlacion: string | null; error?: string }

/** `POST /estimate/{modelo}` · gratis · no crea pedido. Devuelve `usd` si la API da un número, o `tarifas` si da la descripción con la fórmula. */
export async function estimar(f: Fetch, llave: string, modelo: string, cuerpo: Record<string, unknown>): Promise<RespuestaDeEstimacion> {
  const r = await f(`${BASE_HIGGSFIELD}/estimate/${modelo}`, { method: 'POST', headers: cabeceras(llave), body: JSON.stringify(cuerpo) })
  const correlacion = r.headers.get('x-correlation-id')
  const texto = await r.text()
  if (r.status !== 200) return { status: r.status, correlacion, error: texto.slice(0, 300) }
  let j: Record<string, unknown> = {}
  try { j = JSON.parse(texto) } catch { return { status: r.status, correlacion, error: 'respuesta no es JSON' } }
  if (typeof j.usd === 'string' || typeof j.usd === 'number') return { status: 200, correlacion, usd: Number(j.usd) }
  if (typeof j.pricing_description === 'string') {
    const tarifas = leerTarifas(j.pricing_description)
    return tarifas ? { status: 200, correlacion, tarifas, descripcion: j.pricing_description } : { status: 200, correlacion, descripcion: j.pricing_description, error: 'no pude leer las tarifas de la descripción' }
  }
  return { status: 200, correlacion, error: 'estimación sin usd ni descripción' }
}

export interface PedidoEnviado { request_id: string; status: string; status_url: string; cancel_url?: string; correlacion: string | null }

/** `POST /{modelo}` con `Idempotency-Key` (reintentar con la misma clave devuelve el mismo pedido, no crea otro) */
export async function enviar(f: Fetch, llave: string, modelo: string, cuerpo: Record<string, unknown>, claveIdempotente: string): Promise<{ ok: true; pedido: PedidoEnviado } | { ok: false; status: number; error: string; correlacion: string | null }> {
  const r = await f(`${BASE_HIGGSFIELD}/${modelo}`, { method: 'POST', headers: cabeceras(llave, { 'Idempotency-Key': claveIdempotente }), body: JSON.stringify(cuerpo) })
  const correlacion = r.headers.get('x-correlation-id')
  const texto = await r.text()
  if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, error: texto.slice(0, 300), correlacion }
  let j: Record<string, unknown>
  try { j = JSON.parse(texto) } catch { return { ok: false, status: r.status, error: 'respuesta no es JSON', correlacion } }
  if (typeof j.request_id !== 'string' || typeof j.status_url !== 'string') return { ok: false, status: r.status, error: `respuesta sin request_id/status_url: ${texto.slice(0, 200)}`, correlacion }
  return { ok: true, pedido: { request_id: j.request_id, status: String(j.status ?? 'queued'), status_url: j.status_url, cancel_url: typeof j.cancel_url === 'string' ? j.cancel_url : undefined, correlacion } }
}

export type EstadoDelPedido = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'
export const ESTADOS_TERMINALES: ReadonlySet<string> = new Set(['completed', 'failed', 'nsfw', 'canceled'])

export interface EstadoLeido { status: EstadoDelPedido | string; video_url: string | null; expires_at: string | null; error: string | null; crudo: Record<string, unknown> }

/** `GET /requests/{id}/status` (se usa la `status_url` que devolvió el envío, como pide la doc) */
export async function estado(f: Fetch, llave: string, statusUrl: string): Promise<{ ok: true; estado: EstadoLeido } | { ok: false; status: number; error: string }> {
  const r = await f(statusUrl, { headers: cabeceras(llave) })
  const texto = await r.text()
  if (r.status !== 200) return { ok: false, status: r.status, error: texto.slice(0, 300) }
  let j: Record<string, unknown>
  try { j = JSON.parse(texto) } catch { return { ok: false, status: r.status, error: 'respuesta no es JSON' } }
  const video = j.video as { url?: string } | undefined
  const err = j.error
  return { ok: true, estado: { status: String(j.status ?? ''), video_url: typeof video?.url === 'string' ? video.url : null, expires_at: typeof j.expires_at === 'string' ? j.expires_at : null, error: typeof err === 'string' ? err : err && typeof err === 'object' ? JSON.stringify(err).slice(0, 300) : null, crudo: j } }
}
