/**
 * ALARMA POR INCIDENTE (CC#1 · 21-oct · encargo «menos ruido en Slack», firma Emilio 16:56).
 *
 * Regla: a Emilio le llega UNA alarma por incidente en `#alertas`; lo repetido y los cambios van como respuesta en el HILO de esa alarma,
 * y al resolverse el incidente se cierra con una respuesta en el hilo (no con un mensaje nuevo en el canal).
 *
 *   const alarmas = crearAlarmas({ publicar: publicarEnSlack({ token, canal: CANAL_ALERTAS }) })
 *   await alarmas.avisar({ clave: 'gasto:prueba', titulo: 'La prueba llegó al aviso de gasto', detalle: 'US$ 10,4 de 13' })   // 1.ª vez → mensaje nuevo
 *   await alarmas.avisar({ clave: 'gasto:prueba', titulo: '…', detalle: 'US$ 11,2 de 13' })                                  // misma clave → respuesta en el hilo
 *   await alarmas.resolver('gasto:prueba', 'apagado')                                                                         // cierra el incidente
 *
 * Contrato:
 *  · Un incidente = una `clave`. Abierto, cada `avisar` con la misma clave es una respuesta en su hilo (nunca otro mensaje en el canal).
 *  · El mismo detalle repetido NO se vuelve a publicar (se cuenta en `repeticiones`).
 *  · Si Slack no confirma (`ok:true`) la apertura, el incidente NO queda abierto: el próximo `avisar` vuelve a intentarlo como alarma nueva (un aviso perdido no se calla).
 *  · Un incidente sin actividad por `cierraTrasMs` (24 h por omisión) se da por cerrado: la siguiente alarma con esa clave abre una nueva.
 *  · Nunca lanza: devuelve `{ accion }` ∈ abrio | hilo | repetida | cerro | fallo | sin_incidente.
 * Estado en memoria del proceso (los vigías son procesos largos); para otros usos hay que pasar un `almacen` propio.
 */
export const CANAL_ALERTAS = 'C0B7XUUEBHA'

/** adaptador real: chat.postMessage con la llave del bot (chat:write). `fetchImpl` se inyecta en pruebas. */
export function publicarEnSlack({ token, canal = CANAL_ALERTAS, fetchImpl = fetch }) {
  return async ({ text, thread_ts }) => {
    try {
      const r = await fetchImpl('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ channel: canal, text, ...(thread_ts ? { thread_ts, reply_broadcast: false } : {}) }),
      })
      const j = await r.json().catch(() => ({}))
      return j && j.ok === true ? { ok: true, ts: j.ts } : { ok: false, error: String(j?.error ?? 'sin_respuesta') }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

export function crearAlarmas({ publicar, ahora = () => Date.now(), cierraTrasMs = 24 * 3600 * 1000, almacen = new Map() }) {
  const abierto = (i) => !!i && !i.cerrado && ahora() - i.ultima < cierraTrasMs
  return {
    async avisar({ clave, titulo, detalle = '' }) {
      try {
        const i = almacen.get(clave)
        if (!abierto(i)) {
          const r = await publicar({ text: `🔴 *${titulo}*${detalle ? '\n' + detalle : ''}` })
          if (!r?.ok || !r.ts) return { accion: 'fallo', error: r?.error ?? 'sin_ts' }
          almacen.set(clave, { thread_ts: r.ts, ultima: ahora(), ultimoDetalle: detalle, repeticiones: 0, cerrado: false })
          return { accion: 'abrio', ts: r.ts }
        }
        if (detalle === i.ultimoDetalle) { i.repeticiones++; i.ultima = ahora(); return { accion: 'repetida', repeticiones: i.repeticiones } }
        const r = await publicar({ text: detalle || titulo, thread_ts: i.thread_ts })
        if (!r?.ok) return { accion: 'fallo', error: r?.error ?? 'sin_respuesta' }
        i.ultima = ahora(); i.ultimoDetalle = detalle
        return { accion: 'hilo', ts: r.ts }
      } catch (e) {
        return { accion: 'fallo', error: e instanceof Error ? e.message : String(e) }
      }
    },
    async resolver(clave, nota = '') {
      try {
        const i = almacen.get(clave)
        if (!abierto(i)) return { accion: 'sin_incidente' }
        const r = await publicar({ text: `✅ Resuelto${nota ? ' · ' + nota : ''}`, thread_ts: i.thread_ts })
        if (!r?.ok) return { accion: 'fallo', error: r?.error ?? 'sin_respuesta' }
        i.cerrado = true
        return { accion: 'cerro' }
      } catch (e) {
        return { accion: 'fallo', error: e instanceof Error ? e.message : String(e) }
      }
    },
    estado: (clave) => almacen.get(clave) ?? null,
  }
}
