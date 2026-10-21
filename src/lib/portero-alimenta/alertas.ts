/**
 * SLACK SIN RUIDO (21-oct · firma de Emilio 16:56 Berlín): lo que el cerebro/portero publica en Slack va SOLO a `#alertas`, UN mensaje por incidente;
 * las repeticiones y los cambios son respuestas en el HILO de ese mensaje, y al resolverse el incidente se cierra con una respuesta en el hilo. Nada a `#equipo`; los reportes van al vault.
 * Es la misma regla de `scripts/ops/alarma-por-incidente.mjs` (CC#1), pero con el estado en la base (`cerebro_alertas`): aquí cada llamada es una función de Vercel sin memoria.
 *  · Un incidente = una `clave`. Sin clave explícita se deriva del TEXTO sin números ni emojis (la misma alarma con otras cifras es el mismo incidente).
 *  · Abierto (sin cerrar y con actividad en las últimas 24 h): lo mismo de nuevo NO se publica (solo se cuenta); un detalle distinto va como respuesta en el hilo.
 *  · Si Slack no confirma (`ok:true`), el aviso NO se da por entregado; si la base no se puede leer, se publica como alarma nueva (un aviso perdido no se calla: mejor un mensaje de más que ninguno).
 */
import { createHash } from 'node:crypto'
import type { Db } from './alimentar'
import { CANAL_DE_ALERTAS } from './vigilante'
import { normalizar } from '../manual/texto'

type Traer = (u: string, i?: RequestInit) => Promise<Response>
type Fila = Record<string, unknown>
export const HORAS_PARA_CERRAR_UN_INCIDENTE = 24
export type AccionDeAlerta = 'abrio' | 'hilo' | 'repetida' | 'cerro' | 'sin_incidente' | 'fallo'
export interface ResultadoDeAlerta { ok: boolean; detalle: string; accion: AccionDeAlerta; ts?: string }

/** la clave de un incidente a partir de su texto: sin emojis, cifras ni espacios de más, en minúsculas */
export function claveDeIncidente(texto: string): string {
  const base = normalizar(texto).replace(/[0-9]+([.,][0-9]+)?/g, '#').replace(/[^a-z#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
  return `auto:${createHash('sha1').update(base).digest('hex').slice(0, 12)}`
}
/** el mismo detalle, con las mismas cifras (una cifra distinta es un cambio y va al hilo) */
const mismoDetalle = (a: string, b: string): boolean => normalizar(a).replace(/\s+/g, ' ') === normalizar(b).replace(/\s+/g, ' ')

export interface OpcionesDeAlerta { db?: Db; token?: string; canal?: string; fetchImpl?: Traer; ahora?: () => Date }

async function publicar(o: OpcionesDeAlerta, text: string, thread_ts?: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = o.token ?? process.env.SLACK_BOT_TOKEN
  if (!token) return { ok: false, error: 'sin SLACK_BOT_TOKEN' }
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  try {
    const r = await traer('https://slack.com/api/chat.postMessage', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: o.canal ?? CANAL_DE_ALERTAS, text, ...(thread_ts ? { thread_ts, reply_broadcast: false } : {}) }),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; ts?: string }
    return j.ok === true ? { ok: true, ts: j.ts } : { ok: false, error: `Slack respondió ${r.status} ${j.error ?? 'sin ok'}` }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** UN aviso con su incidente. `clave` explícita o derivada del texto. Nunca lanza. */
export function avisarPorIncidente(o: OpcionesDeAlerta = {}) {
  return async (texto: string, claveDada?: string): Promise<ResultadoDeAlerta> => {
    const clave = (claveDada ?? '').trim().slice(0, 160) || claveDeIncidente(texto)
    const ahora = (o.ahora ?? (() => new Date()))()
    const canal = o.canal ?? CANAL_DE_ALERTAS
    let fila: Fila | null = null
    let sinBase = !o.db
    if (o.db) {
      try {
        const q = await o.db.from('cerebro_alertas').select('*').eq('clave', clave).limit(1)
        if (q.error) sinBase = true
        else fila = (Array.isArray(q.data) ? (q.data as Fila[]) : [])[0] ?? null
      } catch { sinBase = true }
    }
    const abierto = !!fila && !fila.cerrado_en && typeof fila.thread_ts === 'string' && !!fila.thread_ts && ahora.getTime() - Date.parse(String(fila.ultima_en)) < HORAS_PARA_CERRAR_UN_INCIDENTE * 3_600_000
    try {
      if (abierto && fila && o.db) {
        if (mismoDetalle(texto, String(fila.ultimo_detalle ?? ''))) {
          await o.db.from('cerebro_alertas').update({ repeticiones: (Number(fila.repeticiones) || 0) + 1, ultima_en: ahora.toISOString() }).eq('clave', clave)
          return { ok: true, detalle: 'repetida: el incidente ya está avisado, no se publicó otro mensaje', accion: 'repetida' }
        }
        const r = await publicar(o, texto, String(fila.thread_ts))
        if (!r.ok) return { ok: false, detalle: r.error ?? 'Slack no confirmó', accion: 'fallo' }
        await o.db.from('cerebro_alertas').update({ ultimo_detalle: texto.slice(0, 1000), ultima_en: ahora.toISOString() }).eq('clave', clave)
        return { ok: true, detalle: 'entregado en el hilo del incidente', accion: 'hilo', ts: r.ts }
      }
      const r = await publicar(o, texto)
      if (!r.ok) return { ok: false, detalle: r.error ?? 'Slack no confirmó', accion: 'fallo' }
      if (o.db && !sinBase && r.ts) {
        const guardar = { clave, canal, thread_ts: r.ts, titulo: texto.slice(0, 200), ultimo_detalle: texto.slice(0, 1000), repeticiones: 0, abierto_en: ahora.toISOString(), ultima_en: ahora.toISOString(), cerrado_en: null }
        const w = fila ? await o.db.from('cerebro_alertas').update(guardar).eq('clave', clave) : await o.db.from('cerebro_alertas').insert(guardar)
        if (w.error) return { ok: true, detalle: `entregado (no se pudo anotar el incidente: ${String(w.error.message).slice(0, 80)})`, accion: 'abrio', ts: r.ts }
      }
      return { ok: true, detalle: sinBase && o.db ? 'entregado (la base no dejó leer los incidentes: se publicó como alarma nueva)' : 'entregado', accion: 'abrio', ts: r.ts }
    } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e), accion: 'fallo' } }
  }
}

/** cierra un incidente con una respuesta en su hilo (no con un mensaje nuevo en el canal) */
export function resolverIncidente(o: OpcionesDeAlerta = {}) {
  return async (clave: string, nota = ''): Promise<ResultadoDeAlerta> => {
    if (!o.db) return { ok: true, detalle: 'sin base: nada que cerrar', accion: 'sin_incidente' }
    try {
      const q = await o.db.from('cerebro_alertas').select('*').eq('clave', clave).limit(1)
      const fila = q.error ? null : (Array.isArray(q.data) ? (q.data as Fila[]) : [])[0] ?? null
      if (!fila || fila.cerrado_en || typeof fila.thread_ts !== 'string') return { ok: true, detalle: 'no había un incidente abierto con esa clave', accion: 'sin_incidente' }
      const r = await publicar(o, `✅ Resuelto${nota ? ` · ${nota}` : ''}`, String(fila.thread_ts))
      if (!r.ok) return { ok: false, detalle: r.error ?? 'Slack no confirmó', accion: 'fallo' }
      await o.db.from('cerebro_alertas').update({ cerrado_en: (o.ahora ?? (() => new Date()))().toISOString() }).eq('clave', clave)
      return { ok: true, detalle: 'incidente cerrado en su hilo', accion: 'cerro', ts: r.ts }
    } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e), accion: 'fallo' } }
  }
}
