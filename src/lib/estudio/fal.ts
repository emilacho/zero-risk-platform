/**
 * Cliente de la cola de fal.ai para la conversión a 3D del estudio. Puro salvo `fetch` (inyectable). Nunca imprime la llave.
 * Doc: https://fal.ai/docs/model-endpoints/queue (leída 05-nov):
 *  · enviar: `POST https://queue.fal.run/<endpoint>` con `Authorization: Key <FAL_KEY>`; responde `request_id`, `status_url`, `response_url`.
 *  · las direcciones de estado y resultado usan solo dueño/app, no el endpoint entero: se usan TAL CUAL las devuelve el envío (armarlas da 405).
 *  · estados: IN_QUEUE · IN_PROGRESS · COMPLETED (un fallo llega como COMPLETED con `error`).
 *  · `X-Fal-No-Retry: 1` apaga los reintentos automáticos: un reintento silencioso podría cobrar otra vez.
 */
export const VARIABLE_DE_LA_LLAVE_FAL = 'FAL_KEY'
export const BASE_DE_LA_COLA = 'https://queue.fal.run/'

type Fetch = typeof fetch
const cabeceras = (llave: string) => ({ Authorization: `Key ${llave}`, 'Content-Type': 'application/json' })

/** las direcciones que guardamos solo valen si son de la cola de fal (nunca vienen del llamador, pero se comprueba igual antes de mandarles la llave) */
export const esDeLaCola = (u: unknown): u is string => typeof u === 'string' && u.startsWith(BASE_DE_LA_COLA) && !/[\s@]/.test(u)

export interface EnvioFal { request_id: string; status_url: string; response_url: string }

export async function enviarAFal(f: Fetch, llave: string, endpoint: string, entrada: Record<string, unknown>): Promise<{ ok: true; envio: EnvioFal } | { ok: false; status: number; error: string }> {
  const r = await f(`${BASE_DE_LA_COLA}${endpoint}`, { method: 'POST', headers: { ...cabeceras(llave), 'X-Fal-No-Retry': '1' }, body: JSON.stringify(entrada) })
  const t = await r.text()
  if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, error: t.slice(0, 300) }
  let j: Record<string, unknown>
  try { j = JSON.parse(t) } catch { return { ok: false, status: r.status, error: 'respuesta no es JSON' } }
  if (typeof j.request_id !== 'string' || !esDeLaCola(j.status_url) || !esDeLaCola(j.response_url)) return { ok: false, status: r.status, error: `respuesta sin request_id o direcciones de la cola: ${t.slice(0, 200)}` }
  return { ok: true, envio: { request_id: j.request_id, status_url: j.status_url, response_url: j.response_url } }
}

export type EstadoFal = { estado: 'en_cola' | 'en_curso' } | { estado: 'terminado' } | { estado: 'fallido'; error: string }

export async function estadoEnFal(f: Fetch, llave: string, statusUrl: string): Promise<{ ok: true; e: EstadoFal } | { ok: false; status: number; error: string }> {
  if (!esDeLaCola(statusUrl)) return { ok: false, status: 0, error: 'dirección de estado ajena a la cola de fal' }
  const r = await f(statusUrl, { headers: cabeceras(llave) })
  const t = await r.text()
  if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, error: t.slice(0, 300) }
  let j: Record<string, unknown>
  try { j = JSON.parse(t) } catch { return { ok: false, status: r.status, error: 'respuesta no es JSON' } }
  const s = String(j.status ?? '')
  if (s === 'IN_QUEUE') return { ok: true, e: { estado: 'en_cola' } }
  if (s === 'IN_PROGRESS') return { ok: true, e: { estado: 'en_curso' } }
  if (s === 'COMPLETED') {
    if (j.error) return { ok: true, e: { estado: 'fallido', error: `${String(j.error_type ?? 'error')} · ${typeof j.error === 'string' ? j.error : JSON.stringify(j.error)}`.slice(0, 300) } }
    return { ok: true, e: { estado: 'terminado' } }
  }
  return { ok: false, status: r.status, error: `estado desconocido: ${s.slice(0, 40)}` }
}

/** el resultado (la salida del modelo, en la raíz). Un 4xx/5xx con detalle es un fallo del pedido, no de la red */
export async function resultadoDeFal(f: Fetch, llave: string, responseUrl: string): Promise<{ ok: true; salida: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  if (!esDeLaCola(responseUrl)) return { ok: false, status: 0, error: 'dirección de resultado ajena a la cola de fal' }
  const r = await f(responseUrl, { headers: cabeceras(llave) })
  const t = await r.text()
  if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, error: t.slice(0, 300) }
  try { return { ok: true, salida: JSON.parse(t) as Record<string, unknown> } } catch { return { ok: false, status: r.status, error: 'respuesta no es JSON' } }
}
