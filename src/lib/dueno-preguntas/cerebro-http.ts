/**
 * El puerto de la plataforma hacia la puerta del dueño del cerebro (`/api/brain/alimentar/dueno`), por HTTP: la plataforma no nombra tablas del cerebro.
 * La llave entra por parámetro y NUNCA se imprime. Nunca lanza: un fallo es `{ ok: false }` y la pregunta sigue pendiente.
 */
import type { PuertoDelCerebro } from './preguntas'

type Fetch = typeof fetch

export function cerebroPorHttp(p: { base: string; llave: string; fetch?: Fetch }): PuertoDelCerebro {
  const f = p.fetch ?? fetch
  const url = `${p.base.replace(/\/+$/, '')}/api/brain/alimentar/dueno`
  const sin = !p.base || !p.llave
  return {
    async respuestas(q) {
      if (sin) return { ok: false, error: 'cerebro_no_configurado' }
      try {
        const qs = `client_id=${encodeURIComponent(q.client_id)}&tema=${encodeURIComponent(q.tema)}${q.sede_clave ? `&sede_clave=${encodeURIComponent(q.sede_clave)}` : ''}`
        const r = await f(`${url}?${qs}`, { method: 'GET', headers: { 'x-api-key': p.llave } })
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        if (r.status < 200 || r.status >= 300) return { ok: false, error: `http_${r.status}` }
        // con la puerta apagada no se leyó nada: eso no es «no contestó»
        if (j.ok !== true || !Array.isArray(j.respuestas)) return { ok: false, error: j.apagado === true ? 'puerta_apagada' : 'respuesta_no_entendida' }
        return { ok: true, respuestas: (j.respuestas as Array<Record<string, unknown>>).filter((x) => typeof x?.respuesta === 'string' && String(x.respuesta).trim()) }
      } catch { return { ok: false, error: 'red' } }
    },
    async guardar(evento, cuerpo) {
      if (sin) return { ok: false, status: 0, error: 'cerebro_no_configurado' }
      try {
        const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': p.llave }, body: JSON.stringify({ ...cuerpo, evento, dry_run: false }) })
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, error: typeof j.error === 'string' ? j.error : 'sin_detalle' }
        if (j.apagado === true) return { ok: false, status: r.status, error: 'puerta_apagada' }
        if (j.ok !== true) return { ok: false, status: r.status, error: 'no_guardada' }
        return { ok: true, ficha_id: typeof j.ficha_id === 'string' ? j.ficha_id : null }
      } catch { return { ok: false, status: 0, error: 'red' } }
    },
  }
}
