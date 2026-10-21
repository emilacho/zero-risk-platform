/**
 * LA PUERTA DEL DUEÑO DEL CEREBRO, DESDE LA OFICINA DE CREATIVOS (firma de Emilio 13:59: «sigue el orden sugerido»; base: RESPUESTA-LENOVO-ANTERIOR-cerebro-notas-del-dueno).
 * Principio: lo que dice el dueño sobre UN cliente tiene UNA sola fuente de verdad: el cerebro. Este módulo solo LLAMA a la puerta ya publicada (`/api/brain/alimentar/dueno`, de CC-CEREBRO); no escribe
 * en ninguna tabla del cerebro. La tabla `notas_del_dueno` queda como REGISTRO (Slack, clics, auditoría y las notas «general:»), no como fuente que lee el productor.
 *  · ENVIAR: cada comentario con texto y cada «Rechazar» con motivo sube con la forma exacta del encargo. Aprobar sin texto y las notas «general:» NO suben.
 *  · LEER: la auto-revisión del productor lee lo último que dijo el dueño (hasta 20, sin tema) del cerebro del cliente.
 * Puro salvo el `fetch` que entra por parámetro. Nunca lanza.
 */

/** los identificadores del flujo con el que se identifica esta llamada (la puerta exige ambos al escribir de verdad) */
export const FLUJO_DE_LAS_NOTAS = 'slack-notas-del-dueno'
export const OFICINA_QUE_PREGUNTA = 'oficina-creativa'
export const AGENTE_QUE_PREGUNTA = 'content-creator'
export const CANAL_QUE_SE_ANOTA = '#oficina-creativa'
const MAX_RESPUESTA = 2000
const MAX_PREGUNTA = 500

type Fetch = typeof fetch

export interface NotaParaLaPuerta {
  client_id: string
  hitl_id: string
  pieza_titulo: string | null
  pieza_familia: string | null
  comentario: string
  /** el `ts` del mensaje de Slack (el del comentario; en un rechazo, el de la pieza) */
  ts: string
  canal_slack: string
  /** cuándo lo dijo (ISO) */
  respondido_en: string
}

/** «oficina creativa · pieza <id> · <ts>»: lleva la pieza Y el ts a propósito, para que cada comentario se acumule y ninguno reemplace a otro */
export const temaDeLaNota = (hitl_id: string, ts: string): string => `oficina creativa · pieza ${hitl_id} · ${ts}`

/** la hora de un mensaje de Slack (segundos.microsegundos desde 1970) como ISO, o null si no es un `ts` válido */
export function isoDeTs(ts: string): string | null {
  if (!/^\d{9,11}\.\d{1,6}$/.test(ts)) return null
  const d = new Date(Number(ts) * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const recortar = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)

export function cuerpoParaLaPuerta(n: NotaParaLaPuerta): Record<string, unknown> {
  const titulo = n.pieza_titulo?.trim() || 'sin título'
  return {
    evento: 'respuesta', client_id: n.client_id, tema: temaDeLaNota(n.hitl_id, n.ts),
    pregunta: recortar(`Revisión de la pieza «${titulo}»${n.pieza_familia ? ` (${n.pieza_familia})` : ''}`, MAX_PREGUNTA),
    respuesta: recortar(n.comentario.trim(), MAX_RESPUESTA),
    canal: CANAL_QUE_SE_ANOTA, mensaje_ref: `${n.canal_slack}:${n.ts}`, respondido_en: n.respondido_en,
    preguntado_por: { oficina: OFICINA_QUE_PREGUNTA, agente: AGENTE_QUE_PREGUNTA },
    dry_run: false, workflow_id: FLUJO_DE_LAS_NOTAS, workflow_execution_id: `slack:${n.canal_slack}:${n.ts}`,
  }
}

export type ResultadoDeEnvio = { ok: true; repetida: boolean } | { ok: false; permanente: boolean; error: string }

export interface EntornoDeLaPuerta { baseUrl: string; internalKey: string }

/**
 * Sube UNA nota. Transitorio (se reintenta en la siguiente vuelta): la red, un 5xx, un 429, la puerta apagada (`PORTERO_DUENO`) o una respuesta que no dice `ok`.
 * Permanente (no se reintenta; queda anotado): un 4xx de entrada inválida o cliente inexistente, y un 401/403 (llave mala: hay que arreglar la configuración).
 */
export async function enviarALaPuerta(env: EntornoDeLaPuerta, f: Fetch, cuerpo: Record<string, unknown>): Promise<ResultadoDeEnvio> {
  try {
    const r = await f(`${env.baseUrl}/api/brain/alimentar/dueno`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.internalKey }, body: JSON.stringify(cuerpo) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (r.status === 429 || r.status >= 500) return { ok: false, permanente: false, error: `la puerta respondió ${r.status}${typeof j.detalle === 'string' ? `: ${j.detalle}` : ''}` }
    if (r.status >= 400) return { ok: false, permanente: true, error: `la puerta rechazó la nota (${r.status}${typeof j.error === 'string' ? ` · ${j.error}` : ''})` }
    if (j.apagado === true) return { ok: false, permanente: false, error: 'la puerta del dueño está apagada (PORTERO_DUENO)' }
    if (j.ok === true) return { ok: true, repetida: j.repetida === true }
    return { ok: false, permanente: false, error: 'la puerta no confirmó la nota (sin ok)' }
  } catch (e) { return { ok: false, permanente: false, error: e instanceof Error ? e.message : String(e) } }
}

export interface RespuestaDelCerebro { ficha_id: string; tema: string; pregunta: string; respuesta: string; canal: string; respondido_en: string }
export type LecturaDelCerebro = { ok: true; respuestas: RespuestaDelCerebro[] } | { ok: false; error: string }

const txt = (x: unknown): string => (typeof x === 'string' ? x : '')

/** Lo último que dijo el dueño de ESTE cliente (hasta 20, de cualquier canal). Apagada o con error ⇒ `ok: false` con el motivo: nunca se lee como «el dueño no ha dicho nada». */
export async function leerDeLaPuerta(env: EntornoDeLaPuerta, f: Fetch, client_id: string): Promise<LecturaDelCerebro> {
  try {
    const r = await f(`${env.baseUrl}/api/brain/alimentar/dueno?client_id=${encodeURIComponent(client_id)}`, { headers: { 'x-api-key': env.internalKey } })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) return { ok: false, error: `la puerta respondió ${r.status}` }
    if (j.apagado === true) return { ok: false, error: 'la puerta del dueño está apagada (PORTERO_DUENO)' }
    if (j.ok !== true || !Array.isArray(j.respuestas)) return { ok: false, error: 'la puerta no devolvió respuestas' }
    const respuestas = (j.respuestas as unknown[])
      .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
      .map((x) => ({ ficha_id: txt(x.ficha_id), tema: txt(x.tema), pregunta: txt(x.pregunta), respuesta: txt(x.respuesta), canal: txt(x.canal), respondido_en: txt(x.respondido_en) }))
      .filter((x) => x.ficha_id && x.respuesta.trim())
    return { ok: true, respuestas }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}
