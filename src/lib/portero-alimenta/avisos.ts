/**
 * Las dos salidas REALES del vigilante (nada de esto corre en pruebas: allí se inyectan moldes):
 *  · `avisarAAlertas`: UNA línea a #alertas con el bot de Slack; ok solo si Slack confirma `ok:true` (un aviso rechazado no se da por entregado);
 *  · `apagarFlujoDelPortero`: desactiva el flujo por la API de n8n (reversible: se vuelve a activar). Solo apaga flujos cuyo nombre contiene «portero» y verifica que quedó inactivo.
 */
import { CANAL_DE_ALERTAS } from './vigilante'

type Traer = (u: string, i?: RequestInit) => Promise<Response>

export function avisarAAlertas(o: { token?: string; canal?: string; fetchImpl?: Traer } = {}) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (texto: string): Promise<{ ok: boolean; detalle: string }> => {
    const token = o.token ?? process.env.SLACK_BOT_TOKEN
    if (!token) return { ok: false, detalle: 'sin SLACK_BOT_TOKEN' }
    const r = await traer('https://slack.com/api/chat.postMessage', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: o.canal ?? CANAL_DE_ALERTAS, text: texto }),
    })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    return j.ok === true ? { ok: true, detalle: 'entregado' } : { ok: false, detalle: `Slack respondió ${r.status} ${j.error ?? 'sin ok'}` }
  }
}

export function apagarFlujoDelPortero(o: { base?: string; llave?: string; fetchImpl?: Traer } = {}) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (workflowId: string): Promise<{ ok: boolean; detalle: string }> => {
    const base = (o.base ?? process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')
    const llave = o.llave ?? process.env.N8N_API_KEY
    if (!base || !llave) return { ok: false, detalle: 'sin N8N_BASE_URL / N8N_API_KEY' }
    if (!/^[A-Za-z0-9]{8,32}$/.test(workflowId)) return { ok: false, detalle: 'workflow_id inválido' }
    const h = { 'X-N8N-API-KEY': llave, 'Content-Type': 'application/json' }
    const g = await traer(`${base}/api/v1/workflows/${workflowId}`, { headers: h })
    if (!g.ok) return { ok: false, detalle: `no pude leer el flujo (${g.status})` }
    const fl = (await g.json().catch(() => ({}))) as { name?: string; active?: boolean }
    if (!/portero/i.test(String(fl.name ?? ''))) return { ok: false, detalle: 'el flujo no es del portero: no se apaga' }
    if (fl.active === false) return { ok: true, detalle: 'ya estaba inactivo' }
    const d = await traer(`${base}/api/v1/workflows/${workflowId}/deactivate`, { method: 'POST', headers: h })
    if (!d.ok) return { ok: false, detalle: `n8n respondió ${d.status} al desactivar` }
    const r = (await d.json().catch(() => ({}))) as { active?: boolean }
    return r.active === false ? { ok: true, detalle: 'flujo desactivado' } : { ok: false, detalle: 'n8n no confirmó el flujo inactivo' }
  }
}

/** Solo LEE si el flujo está activo en n8n (para la alarma de «no corrió»); no cambia nada. */
export function estadoDelFlujoDelPortero(o: { base?: string; llave?: string; fetchImpl?: Traer } = {}) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (workflowId: string): Promise<{ ok: true; activo: boolean } | { ok: false; detalle: string }> => {
    const base = (o.base ?? process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')
    const llave = o.llave ?? process.env.N8N_API_KEY
    if (!base || !llave) return { ok: false, detalle: 'sin N8N_BASE_URL / N8N_API_KEY' }
    if (!/^[A-Za-z0-9]{8,32}$/.test(workflowId)) return { ok: false, detalle: 'workflow_id inválido' }
    const g = await traer(`${base}/api/v1/workflows/${workflowId}`, { headers: { 'X-N8N-API-KEY': llave } })
    if (!g.ok) return { ok: false, detalle: `n8n respondió ${g.status}` }
    const fl = (await g.json().catch(() => ({}))) as { active?: boolean }
    return typeof fl.active === 'boolean' ? { ok: true, activo: fl.active } : { ok: false, detalle: 'n8n no dijo si está activo' }
  }
}
