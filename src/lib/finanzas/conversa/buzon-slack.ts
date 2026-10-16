/**
 * BUZÓN DE SLACK · el adaptador de MENSAJE DIRECTO (CC#1 · 16-oct). La oficina financiera le pregunta al dueño por su bandeja (no por un canal) y recoge sus respuestas sola.
 *  · Enviar: `chat.postMessage` al id del dueño (abre el MD solo; alcance `chat:write`). Leer: `conversations.history` (alcance `im:history`: el bot HOY no lo tiene → «sin acceso» hasta que se agregue).
 *  · Solo cuentan los mensajes POSTERIORES a `desde_ts`, del `dueno_id`, sin `bot_id` y sin subtipo (ediciones, uniones…). El bot y cualquier tercero se ignoran.
 *  · NUNCA lanza: un fallo (sin permiso, red, límite de ritmo) devuelve «sin acceso» con el motivo corto y la conversación sigue con supuestos.
 *  · El `fetch` y la llave entran por parámetro; aquí no hay nada que se llame solo. La llave NUNCA se escribe en papel ni en registros.
 */
import type { LecturaDeHilo } from '../hilo-slack'
import type { SlackPuerto } from './puertos'

type Fetch = typeof fetch
type Msg = { ts?: string; user?: string; bot_id?: string; text?: string; subtype?: string }

export type EnvioAlDueno = { ok: true; canal: string; ts: string } | { ok: false; motivo: string }
export interface SlackMd extends SlackPuerto {
  /** manda el texto al dueño por MD: `chat.postMessage` con su id de usuario como destino abre el MD SIN `conversations.open` (solo pide `chat:write`); devuelve el canal `D…` y el `ts` */
  enviarAlDueno(texto: string): Promise<EnvioAlDueno>
}

const esTs = (t: unknown): t is string => typeof t === 'string' && /^\d+(?:\.\d+)?$/.test(t)
const mayor = (a: string, b: string) => Number(a) > Number(b)
/** los motivos que Slack devuelve cuando falta un permiso o el MD no se puede abrir: se reportan tal cual, una sola vez */
const motivo = (e: unknown) => (typeof e === 'string' && e ? e : 'desconocido')

async function llamar(f: Fetch, token: string, metodo: string, init: { cuerpo?: Record<string, unknown>; consulta?: Record<string, string> }): Promise<{ ok: true; j: Record<string, any> } | { ok: false; motivo: string }> {
  try {
    const url = new URL(`https://slack.com/api/${metodo}`)
    for (const [k, v] of Object.entries(init.consulta ?? {})) url.searchParams.set(k, v)
    const r = await f(url.toString(), init.cuerpo
      ? { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(init.cuerpo) }
      : { headers: { authorization: `Bearer ${token}` } })
    if (r.status === 429) return { ok: false, motivo: 'limite_de_ritmo' }
    const j = (await r.json().catch(() => ({}))) as Record<string, any>
    return j.ok ? { ok: true, j } : { ok: false, motivo: motivo(j.error) }
  } catch { return { ok: false, motivo: 'red' } }
}

export function slackMdPuerto(p: { token: string; dueno_id: string; fetch?: Fetch }): SlackMd {
  const f = p.fetch ?? fetch
  const sinLlave = !p.token || !p.dueno_id
  return {
    async enviarAlDueno(texto) {
      if (sinLlave) return { ok: false, motivo: 'no_configurado' }
      const r = await llamar(f, p.token, 'chat.postMessage', { cuerpo: { channel: p.dueno_id, text: texto } })
      if (!r.ok) return r
      const canal = r.j.channel
      return esTs(r.j.ts) && typeof canal === 'string' && /^D[A-Z0-9]+$/.test(canal) ? { ok: true, canal, ts: r.j.ts } : { ok: false, motivo: 'sin_canal_de_md' }
    },
    async publicar(x) {
      if (sinLlave || !x.canal) return { ok: false }
      const r = await llamar(f, p.token, 'chat.postMessage', { cuerpo: { channel: x.canal, text: x.texto, ...(x.thread_ts ? { thread_ts: x.thread_ts } : {}) } })
      return r.ok && esTs(r.j.ts) ? { ok: true, ts: r.j.ts } : { ok: false }
    },
    async leer(x): Promise<LecturaDeHilo> {
      const base = { ok: false as const, mensajes: [], leido_hasta: x.desde_ts }
      if (sinLlave) return { ...base, sin_acceso: 'no_configurado' }
      if (!x.canal) return { ...base, sin_acceso: 'falta_canal' }
      const desde = x.desde_ts && esTs(x.desde_ts) ? x.desde_ts : x.thread_ts && esTs(x.thread_ts) ? x.thread_ts : '0'
      const todos: Msg[] = []
      let cursor: string | undefined
      for (let pagina = 0; pagina < 5; pagina++) {
        const r = await llamar(f, p.token, 'conversations.history', { consulta: { channel: x.canal, oldest: desde, limit: '200', inclusive: 'false', ...(cursor ? { cursor } : {}) } })
        if (!r.ok) return { ...base, sin_acceso: r.motivo }
        todos.push(...((r.j.messages as Msg[] | undefined) ?? []))
        cursor = r.j.response_metadata?.next_cursor || undefined
        if (!cursor || r.j.has_more !== true) break
      }
      const nuevos = todos.filter((m) => esTs(m.ts) && mayor(m.ts, desde))
      const mensajes = nuevos
        .filter((m) => m.user === p.dueno_id && !m.bot_id && !m.subtype && typeof m.text === 'string' && m.text.trim())
        .sort((a, b) => Number(a.ts) - Number(b.ts))
        .map((m) => ({ ts: m.ts as string, texto: String(m.text).trim() }))
      const leido = todos.reduce<string | null>((acc, m) => (esTs(m.ts) && (acc === null || mayor(m.ts, acc)) ? m.ts : acc), x.desde_ts)
      return { ok: true, mensajes, leido_hasta: leido }
    },
  }
}
