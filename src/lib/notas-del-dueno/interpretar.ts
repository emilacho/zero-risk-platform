/**
 * INTERPRETAR lo que manda Slack · puro (sin red). Tres entradas:
 *   · interactividad (`payload=` JSON): el clic en [Aprobar] o [Rechazar], y el envío del formulario del motivo del rechazo;
 *   · eventos (JSON): `url_verification` (se contesta el reto) y un mensaje en el hilo de la pieza (el comentario);
 * Devuelve una INTENCIÓN tipada o `ignorar` con el motivo. No decide nada: eso es de `recibir.ts`.
 */
import { ACCION_APROBAR, ACCION_RECHAZAR } from './mensaje-pieza'

export const CALLBACK_DEL_RECHAZO = 'nota_rechazo'
export const BLOQUE_DEL_MOTIVO = 'motivo'
export const CAMPO_DEL_MOTIVO = 'valor'
const MAX_COMENTARIO = 2000

export type Intencion =
  | { tipo: 'reto'; challenge: string }
  | { tipo: 'aprobar'; hitl_id: string; autor: string; canal: string | null; ts: string | null }
  | { tipo: 'abrir_rechazo'; hitl_id: string; autor: string; canal: string | null; ts: string | null; trigger_id: string }
  | { tipo: 'rechazar'; hitl_id: string; autor: string; canal: string | null; ts: string | null; comentario: string | null }
  | { tipo: 'comentar'; canal: string; hilo_ts: string; ts: string; autor: string; texto: string }
  | { tipo: 'ignorar'; motivo: string }

const ignorar = (motivo: string): Intencion => ({ tipo: 'ignorar', motivo })
const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const campo = (o: unknown, k: string): unknown => (esObjeto(o) ? o[k] : undefined)

/** el cuerpo de la interactividad llega como formulario: `payload=<json>` */
export function payloadDeInteractividad(cuerpoCrudo: string): unknown {
  try {
    const crudo = new URLSearchParams(cuerpoCrudo).get('payload')
    return crudo ? JSON.parse(crudo) : null
  } catch { return null }
}

export function interpretarInteractividad(payload: unknown): Intencion {
  if (!esObjeto(payload)) return ignorar('payload ilegible')
  const autor = texto(campo(payload.user, 'id'))
  if (!autor) return ignorar('sin usuario')
  if (payload.type === 'block_actions') {
    const accion = Array.isArray(payload.actions) && esObjeto(payload.actions[0]) ? payload.actions[0] : null
    if (!accion) return ignorar('sin acción')
    const hitl_id = texto(accion.value)
    if (!hitl_id || !UUID.test(hitl_id)) return ignorar('la acción no trae un id de pieza válido')
    const canal = texto(campo(payload.container, 'channel_id')) ?? texto(campo(payload.channel, 'id'))
    const ts = texto(campo(payload.container, 'message_ts')) ?? texto(campo(payload.message, 'ts'))
    if (accion.action_id === ACCION_APROBAR) return { tipo: 'aprobar', hitl_id, autor, canal, ts }
    if (accion.action_id === ACCION_RECHAZAR) {
      const trigger_id = texto(payload.trigger_id)
      return trigger_id ? { tipo: 'abrir_rechazo', hitl_id, autor, canal, ts, trigger_id } : ignorar('sin trigger_id para abrir el formulario')
    }
    return ignorar(`acción desconocida «${String(accion.action_id)}»`)
  }
  if (payload.type === 'view_submission') {
    const vista = esObjeto(payload.view) ? payload.view : null
    if (!vista || vista.callback_id !== CALLBACK_DEL_RECHAZO) return ignorar('formulario desconocido')
    let meta: Record<string, unknown> = {}
    try { const m: unknown = JSON.parse(String(vista.private_metadata ?? '{}')); if (esObjeto(m)) meta = m } catch { /* meta vacío */ }
    const hitl_id = texto(meta.hitl_id)
    if (!hitl_id || !UUID.test(hitl_id)) return ignorar('el formulario no trae un id de pieza válido')
    const valor = campo(campo(campo(campo(vista, 'state'), 'values'), BLOQUE_DEL_MOTIVO), CAMPO_DEL_MOTIVO)
    const comentario = texto(campo(valor, 'value'))
    return { tipo: 'rechazar', hitl_id, autor, canal: texto(meta.canal), ts: texto(meta.ts), comentario: comentario ? comentario.slice(0, MAX_COMENTARIO) : null }
  }
  return ignorar(`tipo «${String(payload.type)}» no atendido`)
}

export function interpretarEvento(cuerpo: unknown): Intencion {
  if (!esObjeto(cuerpo)) return ignorar('evento ilegible')
  if (cuerpo.type === 'url_verification') {
    const challenge = texto(cuerpo.challenge)
    return challenge ? { tipo: 'reto', challenge } : ignorar('reto vacío')
  }
  if (cuerpo.type !== 'event_callback' || !esObjeto(cuerpo.event)) return ignorar('no es un evento de mensaje')
  const ev = cuerpo.event
  if (ev.type !== 'message') return ignorar('no es un mensaje')
  // nada de ediciones, borrados ni mensajes de bots (incluido el nuestro): solo lo que escribe una persona
  if (ev.subtype || ev.bot_id) return ignorar('mensaje con subtipo o de un bot')
  const canal = texto(ev.channel), hilo_ts = texto(ev.thread_ts), ts = texto(ev.ts), autor = texto(ev.user), t = texto(ev.text)
  if (!canal || !ts || !autor) return ignorar('mensaje incompleto')
  if (!hilo_ts || hilo_ts === ts) return ignorar('no es una respuesta dentro de un hilo')
  if (!t) return ignorar('mensaje sin texto')
  return { tipo: 'comentar', canal, hilo_ts, ts, autor, texto: t.slice(0, MAX_COMENTARIO) }
}

/** «general: …» al inicio hace que la nota valga para todos los clientes; sin eso es del cliente de la pieza */
export function alcanceYComentario(t: string): { alcance: 'cliente' | 'general'; comentario: string } {
  const m = /^\s*(general|para todos)\s*:\s*([\s\S]+)$/i.exec(t)
  return m && m[2].trim() ? { alcance: 'general', comentario: m[2].trim() } : { alcance: 'cliente', comentario: t.trim() }
}
