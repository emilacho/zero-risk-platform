/**
 * APROBAR EL MANUAL PIDE EL PLAN (firma de Emilio, 3-nov 14:46Z: «que no siga la cadena hasta que yo apruebe el manual»).
 * El sobre es el mismo que antes mandaba el alta al terminar, con la misma regla de la sala. La clave lleva la versión aprobada del manual: un doble clic o un reintento no pide dos planes.
 * Va con `forzar`: quien aprueba un manual nuevo pide el plan de ESE manual, aunque el cliente ya tenga uno. NUNCA lanza: si falla, el manual ya quedó aprobado y se dice.
 */
import { randomUUID } from 'node:crypto'

export interface PedidoDePlan { client_id: string; manual_id: string }
export type ResultadoDelPedidoDePlan =
  | { pedido: true; repetido: boolean; event_id: string | null }
  | { pedido: false; error: string }

export function sobreDelPlan(p: PedidoDePlan, correlation_id: string = randomUUID()): Record<string, unknown> {
  const corrida = `manual:${p.manual_id}:planear`
  return {
    source: 'alta/journey-completed',
    intent: 'planear',
    payload: { pedido: 'plan de 90 dias', dry_run: false, plan_v3: true, corrida, forzar: true, force_restart: false, client_id: p.client_id, desde_worker: 'tablero-aprobar-manual', journey_id: p.manual_id },
    idempotency_key: corrida,
    logical_period: `manual:${p.manual_id}`,
    tenant_id: p.client_id,
    client_id: p.client_id,
    correlation_id,
  }
}

export interface EntornoDelPedido { url?: string; llave?: string; fetchImpl?: typeof fetch }

export async function pedirPlanDelManual(p: PedidoDePlan, e: EntornoDelPedido = {}): Promise<ResultadoDelPedidoDePlan> {
  const url = e.url ?? process.env.SALA_INTAKE_URL ?? 'https://zero-risk-platform.vercel.app/api/sala/intake'
  const llave = e.llave ?? process.env.SALA_INGRESS_API_KEY ?? process.env.INTERNAL_API_KEY ?? ''
  if (!llave) return { pedido: false, error: 'falta la llave de la sala: no se llamó a nadie' }
  const f = e.fetchImpl ?? fetch
  try {
    const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': llave, 'x-source': 'tablero-aprobar-manual' }, body: JSON.stringify(sobreDelPlan(p)) })
    const j = (await r.json().catch(() => ({}))) as { ok?: unknown; kind?: unknown; event_id?: unknown; code?: unknown; detail?: unknown }
    // la puerta contesta 200 también cuando rechaza: manda `ok`
    if (!r.ok || j.ok !== true) return { pedido: false, error: `la sala no aceptó el pedido: ${String(j.code ?? r.status)}${j.detail ? ` · ${String(j.detail).slice(0, 160)}` : ''}` }
    return { pedido: true, repetido: j.kind === 'duplicate', event_id: typeof j.event_id === 'string' ? j.event_id : null }
  } catch (err) {
    return { pedido: false, error: `no se pudo llegar a la sala: ${err instanceof Error ? err.message.slice(0, 160) : 'error'}` }
  }
}
