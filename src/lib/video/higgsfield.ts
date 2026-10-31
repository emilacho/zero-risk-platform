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

/** tarifas leídas de la descripción de la estimación: US$ por 1.000 tokens de video, por resolución, con y sin video de entrada */
export interface Tarifas { por_mil_tokens: Record<string, number>; con_video_entrada: Record<string, number>; texto: string }

const num = (s: string) => Number(s.replace(/[$,]/g, ''))

/**
 * Lee las tarifas del texto que devuelve `/estimate` (dos formatos vistos el 31-oct: el de Seedance 2.5 «Each 1,000 video tokens costs $A at 480p or 720p and $B at 1080p»
 * y el de Seedance 2.0 «Per 1,000 video tokens: without video input — 480p/720p/1080p $A, 4K $B; with video input — … $C, 4K $D»). Devuelve null si no entiende el texto.
 */
export function leerTarifas(descripcion: string): Tarifas | null {
  const t = descripcion.replace(/\s+/g, ' ')
  const m25 = t.match(/Each 1,000 video tokens costs \$([\d.]+) at 480p or 720p and \$([\d.]+) at 1080p/)
  if (m25) {
    const base = { '480p': num(m25[1]), '720p': num(m25[1]), '1080p': num(m25[2]) }
    const mv = t.match(/multiplied by 0\.6: \$([\d.]+) per 1,000 tokens at 480p or 720p and \$([\d.]+) at 1080p/)
    const conVideo = mv ? { '480p': num(mv[1]), '720p': num(mv[1]), '1080p': num(mv[2]) } : Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * 0.6 * 1e6) / 1e6]))
    return { por_mil_tokens: base, con_video_entrada: conVideo, texto: descripcion }
  }
  const m20 = t.match(/without video input — 480p\/720p\/1080p \$([\d.]+), 4K \$([\d.]+); with video input — 480p\/720p\/1080p \$([\d.]+), 4K \$([\d.]+)/)
  if (m20) {
    return {
      por_mil_tokens: { '480p': num(m20[1]), '720p': num(m20[1]), '1080p': num(m20[1]), '4k': num(m20[2]) },
      con_video_entrada: { '480p': num(m20[3]), '720p': num(m20[3]), '1080p': num(m20[3]), '4k': num(m20[4]) },
      texto: descripcion,
    }
  }
  // tercer formato visto el 31-oct (2.0 text-to-video, sin entrada de video posible): «Per 1,000 video tokens: 480p/720p/1080p $0.014, 4K $0.008.»
  const m20t = t.match(/Per 1,000 video tokens: 480p\/720p\/1080p \$([\d.]+), 4K \$([\d.]+)\./)
  if (m20t) {
    const base = num(m20t[1]), k4 = num(m20t[2])
    return { por_mil_tokens: { '480p': base, '720p': base, '1080p': base, '4k': k4 }, con_video_entrada: { '480p': base * 0.6, '720p': base * 0.6, '1080p': base * 0.6, '4k': k4 * 0.6 }, texto: descripcion }
  }
  return null
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
