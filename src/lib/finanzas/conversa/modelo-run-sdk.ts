/**
 * F8 · el adaptador del modelo sobre `/api/agents/run-sdk` (contrato verificado: {agent, task ≤120.000, client_id, workflow_id, workflow_execution_id, dry_run, force_restart}).
 * El `fetch` es INYECTADO: ninguna prueba ni ruta de esta rama lo llama de verdad (la conversación nace apagada). Sin `fetch` ni `base` → «no configurado», sin red.
 */
import type { ModeloPuerto, PedidoAlModelo, RespuestaDeModelo } from './puertos'

export const WORKFLOW_ID_CONVERSA = 'finanzas-conversa'
export const MAX_TAREA_RUN_SDK = 120_000

export interface PedidoRunSdk {
  agent: string
  task: string
  client_id: string
  workflow_id: string
  workflow_execution_id: string
  dry_run: boolean
  force_restart: boolean
}

/** arma el cuerpo; función pura (se prueba sin red). Un turno = una ejecución con id propio, así el libro (agent_invocations) correlaciona por execution id */
export function armarPedidoRunSdk(p: PedidoAlModelo): PedidoRunSdk {
  return {
    agent: p.agente,
    task: p.tarea.length > MAX_TAREA_RUN_SDK ? p.tarea.slice(0, MAX_TAREA_RUN_SDK) : p.tarea,
    client_id: p.client_id,
    workflow_id: WORKFLOW_ID_CONVERSA,
    workflow_execution_id: `${p.encargo_id}:${p.paso}`,
    dry_run: p.dry_run,
    // una vuelta repetida del mismo turno NO debe devolver la respuesta vieja guardada (lección del flujo de prueba)
    force_restart: true,
  }
}

export interface AjustesDelModelo {
  base: string | undefined
  llave: string | undefined
  fetch: typeof fetch | undefined
}

/** extrae el texto de la respuesta de run-sdk sin asumir su forma exacta */
function textoDe(j: unknown): string | null {
  if (typeof j !== 'object' || j === null) return null
  const o = j as Record<string, unknown>
  for (const k of ['output', 'result', 'text', 'response', 'content']) if (typeof o[k] === 'string') return o[k] as string
  if (typeof o.data === 'object' && o.data !== null) return textoDe(o.data)
  return null
}
const costoDe = (j: unknown): number => {
  if (typeof j !== 'object' || j === null) return 0
  const o = j as Record<string, unknown>
  const c = o.cost_usd ?? (typeof o.usage === 'object' && o.usage ? (o.usage as Record<string, unknown>).cost_usd : undefined)
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 ? c : 0
}

export function modeloRunSdk(a: AjustesDelModelo): ModeloPuerto {
  return {
    async invocar(p: PedidoAlModelo): Promise<RespuestaDeModelo> {
      if (!a.base || !a.llave || !a.fetch) return { ok: false, error: 'modelo_no_configurado', costo_usd: 0 }
      try {
        const r = await a.fetch(`${a.base.replace(/\/+$/, '')}/api/agents/run-sdk`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': a.llave },
          body: JSON.stringify(armarPedidoRunSdk(p)),
        })
        const j: unknown = await r.json().catch(() => null)
        if (!r.ok) return { ok: false, error: `run_sdk_${r.status}`, costo_usd: costoDe(j) }
        const t = textoDe(j)
        if (t === null) return { ok: false, error: 'respuesta_sin_texto', costo_usd: costoDe(j) }
        return { ok: true, salida: t, costo_usd: costoDe(j) }
      } catch (e) {
        return { ok: false, error: `red:${e instanceof Error ? e.message : String(e)}`, costo_usd: 0 }
      }
    },
  }
}
