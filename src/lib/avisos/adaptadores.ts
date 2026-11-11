/**
 * AVISOS · adaptadores reales. Este archivo es el ÚNICO que nombra la tabla `avisos` y sus funciones (regla del proyecto).
 * Se usa con la llave del SERVIDOR: con la sesión de un usuario la tabla no se puede leer ni escribir, y es lo correcto (CC6 §2.5).
 */
import { esContestada, type AlmacenDeAvisos, type Dependencias, type EstadoSlack, type Guardado, type PublicarEnSlack, type Tipo } from './nucleo'

export type Db = { from(tabla: string): any; rpc(fn: string, args: Record<string, unknown>): any }
type Traer = (u: string, i?: RequestInit) => Promise<Response>

const CANAL_DE_ALERTAS = 'C0B7XUUEBHA'
const CANAL_DE_LA_OFICINA = 'C0C7XUKNCLS'

export function almacenDeAvisos(db: Db): AlmacenDeAvisos {
  return {
    async avisar(e): Promise<Guardado> {
      const { data, error } = await db.rpc('avisos_avisar', {
        p_clave: e.clave, p_tipo: e.tipo, p_origen: e.origen, p_origen_tipo: e.origen_tipo, p_client_id: e.client_id ?? null,
        p_titulo: e.titulo, p_detalle: e.detalle, p_workflow_id: e.workflow_id ?? null, p_workflow_execution_id: e.workflow_execution_id ?? null,
      })
      if (error) throw new Error(`guardar el aviso: ${String(error.message ?? error).slice(0, 200)}`)
      const f = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
      if (!f || typeof f.aviso_id !== 'string') throw new Error('guardar el aviso: la base no devolvió la fila')
      return { aviso_id: f.aviso_id, accion: f.accion as Guardado['accion'], slack_ts: (f.slack_ts as string | null) ?? null, slack_estado: (f.slack_estado as EstadoSlack) ?? 'pendiente' }
    },
    async cerrar(clave, nota) {
      const { data, error } = await db.rpc('avisos_cerrar', { p_clave: clave, p_nota: nota })
      if (error) throw new Error(`cerrar el aviso: ${String(error.message ?? error).slice(0, 200)}`)
      const f = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
      return f && typeof f.aviso_id === 'string' ? { aviso_id: f.aviso_id, slack_ts: (f.slack_ts as string | null) ?? null, tipo: f.tipo as Tipo } : null
    },
    async contestada(clave) {
      // la ÚLTIMA fila de la clave (abierta o cerrada): solo cuenta si está cerrada y su nota empieza con «Contestada»
      const { data, error } = await db.from('avisos').select('id,cerrado_en,nota_cierre,slack_ts,slack_estado').eq('clave', clave).order('abierto_en', { ascending: false }).limit(1)
      if (error || !Array.isArray(data) || !data.length) return null
      const f = data[0] as Record<string, unknown>
      return f.cerrado_en && esContestada(f.nota_cierre as string | null) && typeof f.id === 'string'
        ? { aviso_id: f.id, slack_ts: (f.slack_ts as string | null) ?? null, slack_estado: (f.slack_estado as EstadoSlack) ?? 'pendiente' }
        : null
    },
    async cerrarFamilia(prefijo, salvo, nota) {
      // update condicional: solo las ABIERTAS de esa familia (las columnas que el servidor puede actualizar: cerrado_en y nota_cierre)
      let q = db.from('avisos').update({ cerrado_en: new Date().toISOString(), nota_cierre: nota }).like('clave', `${prefijo}%`).is('cerrado_en', null)
      if (salvo) q = q.neq('clave', salvo)
      const { data, error } = await q.select('id,slack_ts,tipo')
      if (error) throw new Error(`cerrar la familia: ${String(error.message ?? error).slice(0, 200)}`)
      return (Array.isArray(data) ? data : []).filter((f: Record<string, unknown>) => typeof f.id === 'string').map((f: Record<string, unknown>) => ({ aviso_id: f.id as string, slack_ts: (f.slack_ts as string | null) ?? null, tipo: f.tipo as Tipo }))
    },
    async anotarSlack(aviso_id, estado, ts, error) {
      const r = await db.from('avisos').update({ slack_estado: estado, slack_ts: ts, slack_error: error }).eq('id', aviso_id)
      if (r.error) throw new Error(`anotar Slack: ${String(r.error.message).slice(0, 200)}`)
    },
  }
}

export function slackPorBot(token: string | undefined, fetchImpl?: Traer): PublicarEnSlack {
  const traer = fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (canal, texto, hilo) => {
    if (!token) return { ok: false, error: 'sin SLACK_BOT_TOKEN' }
    try {
      const r = await traer('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: canal, text: texto, ...(hilo ? { thread_ts: hilo, reply_broadcast: false } : {}) }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; ts?: string }
      return j.ok === true && typeof j.ts === 'string' ? { ok: true, ts: j.ts } : { ok: false, error: `Slack respondió ${r.status} ${j.error ?? 'sin ok'}` }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
}

/** el interruptor: encendido salvo `AVISOS_A_SLACK=apagado` (el día del corte se apaga sin tocar código) */
export const slackEncendido = (env: Record<string, string | undefined>): boolean => (env.AVISOS_A_SLACK ?? '').trim().toLowerCase() !== 'apagado'

/** canal por tipo, con las 3 reglas de «menos ruido» · nada a #equipo */
export function canalesDesde(env: Record<string, string | undefined>): Partial<Record<Tipo, string>> {
  const preguntas = (env.FINANZAS_CANAL_PREGUNTAS ?? '').trim()
  return { alarma: CANAL_DE_ALERTAS, pieza: CANAL_DE_LA_OFICINA, ...(preguntas ? { pregunta: preguntas } : {}) }
}

export function dependenciasReales(db: Db, env: Record<string, string | undefined> = process.env, fetchImpl?: Traer): Dependencias {
  return { almacen: almacenDeAvisos(db), slack: slackPorBot(env.SLACK_BOT_TOKEN, fetchImpl), slackEncendido: slackEncendido(env), canales: canalesDesde(env) }
}
