/**
 * LA PUERTA DE INCIDENTES DEL VIGÍA (17-nov · decisión (b) de Lenovo: tabla propia `proveedor_incidentes`, sin depender de `cerebro_alertas`).
 * La misma regla de Slack sin ruido (21-oct) que la puerta del portero, con su propia tabla:
 *  · un incidente = una `clave`. Abierto (sin cerrar, con hilo y con actividad en 24 h): el mismo texto NO se publica (solo se cuenta); un texto distinto va al HILO.
 *  · cerrado, vencido o inexistente: se abre uno nuevo en #alertas.
 *  · si la base no deja leer: se publica igual como alarma nueva (un aviso perdido no se calla: mejor un mensaje de más que ninguno).
 * Y una cosa más que la del portero: dos vigías a la vez NO publican dos mensajes. Antes de publicar se RESERVA la fila (INSERT que choca con 23505, o UPDATE condicionado
 * a lo que se leyó); el que no consigue la reserva no publica. Si Slack no confirma, la reserva se suelta (se cierra) para que la próxima lectura lo vuelva a intentar.
 * Nunca lanza.
 */
export const TABLA = 'proveedor_incidentes'
export const CANAL_ALERTAS = 'C0B7XUUEBHA'
export const HORAS_ABIERTO = 24
/** una reserva sin hilo más vieja que esto es de alguien que se cayó a mitad: se puede volver a tomar */
export const MINUTOS_DE_RESERVA = 5

type Fila = Record<string, unknown>
type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }
/** lo mínimo del cliente de Supabase que usa la puerta (cadena de filtros + `select` al final para saber cuántas filas tocó) */
export interface Filtro extends PromiseLike<Respuesta> { eq(c: string, v: unknown): Filtro; is(c: string, v: null): Filtro; select(c: string): Filtro; limit(n: number): Filtro }
export interface DbDeIncidentes { from(t: string): { select(c: string): Filtro; insert(f: Fila): Filtro; update(f: Fila): Filtro } }
export type Publicar = (texto: string, thread_ts?: string) => Promise<{ ok: boolean; ts?: string; error?: string }>
export interface ResultadoDeIncidente { ok: boolean; accion: 'abrio' | 'hilo' | 'repetida' | 'en_curso' | 'cerro' | 'sin_incidente' | 'fallo'; detalle: string }

/** publicar en #alertas con la llave del bot; nunca lanza */
export function publicarEnSlack(o: { token?: string; canal?: string; fetchImpl?: typeof fetch } = {}): Publicar {
  return async (text, thread_ts) => {
    const token = o.token ?? process.env.SLACK_BOT_TOKEN
    if (!token) return { ok: false, error: 'sin SLACK_BOT_TOKEN' }
    try {
      const r = await (o.fetchImpl ?? fetch)('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: o.canal ?? CANAL_ALERTAS, text, ...(thread_ts ? { thread_ts } : {}) }), signal: AbortSignal.timeout(15_000),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string }
      return j.ok === true ? { ok: true, ts: j.ts } : { ok: false, error: `Slack respondió ${r.status} ${j.error ?? 'sin ok'}` }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
}

const igual = (a: string, b: string): boolean => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
const filas = (r: Respuesta): Fila[] => (Array.isArray(r.data) ? (r.data as Fila[]) : [])
const edadMs = (x: unknown, ahora: Date): number => ahora.getTime() - Date.parse(String(x))

export interface Opciones { db: DbDeIncidentes; publicar: Publicar; ahora?: () => Date; canal?: string }

export function avisar(o: Opciones) {
  return async (texto: string, clave: string): Promise<ResultadoDeIncidente> => {
    const ahora = (o.ahora ?? (() => new Date()))()
    const iso = ahora.toISOString()
    const t = o.db.from(TABLA)
    try {
      const q = await t.select('*').eq('clave', clave).limit(1)
      if (q.error) {
        // la base no deja leer: se publica igual (sin anotar); mejor un mensaje de más que una alarma perdida
        const p = await o.publicar(texto)
        return p.ok ? { ok: true, accion: 'abrio', detalle: 'entregado (la base no dejó leer los incidentes: se publicó como alarma nueva, sin anotar)' } : { ok: false, accion: 'fallo', detalle: p.error ?? 'Slack no confirmó' }
      }
      const fila = filas(q)[0] ?? null
      const hilo = fila && typeof fila.thread_ts === 'string' && fila.thread_ts ? fila.thread_ts : null
      const abierto = !!fila && !fila.cerrado_en && !!hilo && edadMs(fila.ultima_en, ahora) < HORAS_ABIERTO * 3_600_000
      if (abierto && fila && hilo) {
        if (igual(texto, String(fila.ultimo_detalle ?? ''))) {
          await o.db.from(TABLA).update({ repeticiones: (Number(fila.repeticiones) || 0) + 1, ultima_en: iso }).eq('clave', clave)
          return { ok: true, accion: 'repetida', detalle: 'el incidente ya está avisado: no se publicó otro mensaje' }
        }
        const p = await o.publicar(texto, hilo)
        if (!p.ok) return { ok: false, accion: 'fallo', detalle: p.error ?? 'Slack no confirmó' }
        await o.db.from(TABLA).update({ ultimo_detalle: texto.slice(0, 1000), ultima_en: iso }).eq('clave', clave)
        return { ok: true, accion: 'hilo', detalle: 'entregado en el hilo del incidente' }
      }
      // una reserva reciente sin hilo es de otro vigía que está abriendo este mismo incidente: no se publica dos veces
      if (fila && !fila.cerrado_en && !hilo && edadMs(fila.ultima_en, ahora) < MINUTOS_DE_RESERVA * 60_000) return { ok: true, accion: 'en_curso', detalle: 'otro vigía está abriendo este incidente: no se publica dos veces' }
      // RESERVAR antes de publicar: el que no consigue la reserva no publica
      const reserva = { clave, canal: o.canal ?? CANAL_ALERTAS, thread_ts: null, titulo: texto.slice(0, 200), ultimo_detalle: texto.slice(0, 1000), repeticiones: 0, abierto_en: iso, ultima_en: iso, cerrado_en: null }
      const w = fila
        ? await o.db.from(TABLA).update(reserva).eq('clave', clave).eq('ultima_en', fila.ultima_en).select('clave')
        : await o.db.from(TABLA).insert(reserva).select('clave')
      if (w.error?.code === '23505' || (!w.error && filas(w).length === 0)) return { ok: true, accion: 'en_curso', detalle: 'otro vigía ganó la reserva de este incidente: no se publica dos veces' }
      if (w.error) {
        const p = await o.publicar(texto)
        return p.ok ? { ok: true, accion: 'abrio', detalle: `entregado (no se pudo anotar el incidente: ${String(w.error.message ?? '').slice(0, 80)})` } : { ok: false, accion: 'fallo', detalle: p.error ?? 'Slack no confirmó' }
      }
      const p = await o.publicar(texto)
      if (!p.ok || !p.ts) {
        // Slack no confirmó: se suelta la reserva (cerrada), y la próxima lectura vuelve a intentar como alarma nueva
        await o.db.from(TABLA).update({ cerrado_en: iso }).eq('clave', clave).is('thread_ts', null)
        return { ok: false, accion: 'fallo', detalle: p.error ?? 'Slack no devolvió el mensaje' }
      }
      await o.db.from(TABLA).update({ thread_ts: p.ts }).eq('clave', clave)
      return { ok: true, accion: 'abrio', detalle: 'entregado' }
    } catch (e) { return { ok: false, accion: 'fallo', detalle: e instanceof Error ? e.message : String(e) } }
  }
}

/** cierra un incidente abierto con «✅ Resuelto · nota» en su hilo. Se cierra PRIMERO (condicionado a que siga abierto) y después se publica: dos vigías no dicen «volvió» dos veces */
export function resolver(o: Opciones) {
  return async (clave: string, nota = ''): Promise<ResultadoDeIncidente> => {
    const iso = (o.ahora ?? (() => new Date()))().toISOString()
    try {
      const q = await o.db.from(TABLA).select('*').eq('clave', clave).limit(1)
      if (q.error) return { ok: false, accion: 'fallo', detalle: `la base no dejó leer los incidentes: ${String(q.error.message ?? '').slice(0, 80)}` }
      const fila = filas(q)[0] ?? null
      if (!fila || fila.cerrado_en || typeof fila.thread_ts !== 'string' || !fila.thread_ts) return { ok: true, accion: 'sin_incidente', detalle: 'no había un incidente abierto con esa clave' }
      const w = await o.db.from(TABLA).update({ cerrado_en: iso }).eq('clave', clave).is('cerrado_en', null).select('clave')
      if (w.error) return { ok: false, accion: 'fallo', detalle: `no se pudo cerrar: ${String(w.error.message ?? '').slice(0, 80)}` }
      if (filas(w).length === 0) return { ok: true, accion: 'sin_incidente', detalle: 'otro vigía ya lo cerró' }
      const p = await o.publicar(`✅ Resuelto${nota ? ` · ${nota}` : ''}`, fila.thread_ts)
      if (!p.ok) {
        // sin el «volvió» en el hilo, el incidente vuelve a quedar abierto: la próxima lectura buena lo intenta de nuevo
        await o.db.from(TABLA).update({ cerrado_en: null }).eq('clave', clave)
        return { ok: false, accion: 'fallo', detalle: p.error ?? 'Slack no confirmó' }
      }
      return { ok: true, accion: 'cerro', detalle: 'incidente cerrado en su hilo' }
    } catch (e) { return { ok: false, accion: 'fallo', detalle: e instanceof Error ? e.message : String(e) } }
  }
}
