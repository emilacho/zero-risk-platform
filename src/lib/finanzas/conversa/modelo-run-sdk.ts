/**
 * F8 · el adaptador del modelo sobre `/api/agents/run-sdk` (contrato verificado: {agent, task ≤120.000, client_id, workflow_id, workflow_execution_id, dry_run, force_restart}).
 * El `fetch` es INYECTADO: ninguna prueba ni ruta de esta rama lo llama de verdad (la conversación nace apagada). Sin `fetch` ni `base` → «no configurado», sin red.
 */
import type { ModeloPuerto, PedidoAlModelo, RespuestaDeModelo } from './puertos'

export const MAX_TAREA_RUN_SDK = 120_000

/** el `workflow_id` es el REAL del flujo de n8n que llama (lo manda el flujo en el cuerpo); un literal inventado no pasa la puerta de run-sdk y ensucia el libro */
export const esWorkflowIdValido = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x)

/**
 * La base de `/api/agents/run-sdk`: `FINANZAS_RUN_SDK_BASE` si existe; si no, la de la propia plataforma (`ZERO_RISK_API_URL`); si no, la de producción.
 * (Sin este respaldo el intento 1 de la oficina midió una variable ausente — `modelo_no_configurado` — y no calidad.) El adaptador sigue exigiendo llave y `fetch`.
 */
export function baseDeRunSdk(env: Record<string, string | undefined> = process.env): string {
  const limpio = (x: string | undefined) => (typeof x === 'string' ? x.trim() : '')
  return limpio(env.FINANZAS_RUN_SDK_BASE) || limpio(env.ZERO_RISK_API_URL) || 'https://zero-risk-platform.vercel.app'
}

export interface PedidoRunSdk {
  agent: string
  task: string
  client_id: string
  workflow_id: string
  workflow_execution_id: string
  dry_run: boolean
  force_restart: boolean
  /** tope de gasto de ESTE turno: el corredor corta solo (run-sdk lo acepta entre 0 y 50) */
  max_budget_usd?: number
}

/** arma el cuerpo; función pura (se prueba sin red). Un turno = una ejecución con id propio, así el libro (agent_invocations) correlaciona por execution id */
export function armarPedidoRunSdk(p: PedidoAlModelo, workflow_id: string): PedidoRunSdk {
  return {
    agent: p.agente,
    task: p.tarea.length > MAX_TAREA_RUN_SDK ? p.tarea.slice(0, MAX_TAREA_RUN_SDK) : p.tarea,
    client_id: p.client_id,
    workflow_id,
    workflow_execution_id: `${p.encargo_id}:${p.paso}`,
    dry_run: p.dry_run,
    // una vuelta repetida del mismo turno NO debe devolver la respuesta vieja guardada (lección del flujo de prueba)
    force_restart: true,
    ...(p.tope_usd > 0 && p.tope_usd <= 50 ? { max_budget_usd: p.tope_usd } : {}),
  }
}

export interface AjustesDelModelo {
  base: string | undefined
  llave: string | undefined
  fetch: typeof fetch | undefined
  /** id real del flujo que llama; sin él NO se llama al modelo (run-sdk rechaza lo que no viene de un flujo) */
  workflow_id: string | undefined
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
      if (!esWorkflowIdValido(a.workflow_id)) return { ok: false, error: 'sin_workflow_id', costo_usd: 0 }
      try {
        const r = await a.fetch(`${a.base.replace(/\/+$/, '')}/api/agents/run-sdk`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': a.llave },
          body: JSON.stringify(armarPedidoRunSdk(p, a.workflow_id)),
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
