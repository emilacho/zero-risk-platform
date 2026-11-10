/**
 * F8 · el adaptador del modelo sobre `/api/agents/run-sdk` (contrato verificado: {agent, task ≤120.000, client_id, workflow_id, workflow_execution_id, dry_run, force_restart}).
 * El `fetch` es INYECTADO: ninguna prueba ni ruta de esta rama lo llama de verdad (la conversación nace apagada). Sin `fetch` ni `base` → «no configurado», sin red.
 */
import type { ColumnasDeLaLlamada } from '@/lib/trabajo-de-la-llamada'
import type { ModeloPuerto, PedidoAlModelo, RespuestaDeModelo } from './puertos'
import { CABECERA_DEL_LATIDO } from '../../latido-hacia-quien-llama'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'

export const MAX_TAREA_RUN_SDK = TOPE_REAL_DEL_PEDIDO

/** el `workflow_id` es el REAL del flujo de n8n que llama (lo manda el flujo en el cuerpo); un literal inventado no pasa la puerta de run-sdk y ensucia el libro */
/** 05-nov · lo pasajero: un corte, una conexión caída o un 5xx. Un 4xx (freno, llave, validación) es una respuesta y no se repite */
/** 05-nov · el corte por tope de gasto del corredor (su `mensajeDeCorte`): repetirlo con el mismo tope se paga y no lo arregla */
export const esCortePorTope = (fallo: string | null | undefined): boolean => typeof fallo === 'string' && fallo.startsWith('error_max_budget_usd')

export const esFallaPasajera = (error: string | null | undefined): boolean => typeof error === 'string' && /^(red:|run_sdk_5\d\d$)/.test(error)

/**
 * #927 · decisión de Lenovo 10-nov 16:08Z (receta de CC1): la falla se separa por CLASE, con señales EXACTAS del proveedor (verificar exacto = código).
 *  · `tope`: el corte por tope de gasto · no se repite (con el mismo tope se paga y termina igual).
 *  · `permanente`: llave mala, saldo agotado, pedido inválido, modelo no soportado, esquema roto… · repetirla no puede salir distinto: se declara al momento.
 *  · `pasajera`: proveedor saturado o caído (`overloaded_error`, `rate_limit_error`, `api_error`, o su 429/5xx) · se repite con espera creciente.
 *  · SIN clase reconocida ⇒ permanente: mejor un aviso de más que tres cobros a ciegas.
 * Sin fallo declarado (un corte, la red, un 5xx del camino) no se sabe si el empleado sigue: es pasajera, como hasta hoy, y la mesa recoge lo que haya terminado.
 */
export type ClaseDeFalla = 'tope' | 'permanente' | 'pasajera'
/** los tipos de error del proveedor que nombran algo que no cambia al repetir (prioridad sobre cualquier código que aparezca en el mismo texto) */
const TIPO_PERMANENTE = /"type"\s*:\s*"(invalid_request_error|authentication_error|permission_error|not_found_error|request_too_large|billing_error)"/
const TIPO_PASAJERO = /"type"\s*:\s*"(overloaded_error|rate_limit_error|api_error|timeout_error)"/
/** el código del PROVEEDOR tal como lo escriben el corredor («API Error: 529 …») y run-sdk («el modelo respondió 529: …») */
const CODIGO_PASAJERO = /(?:API Error: |el modelo respondió )(?:429|5\d\d)(?!\d)/

export function claseDeFalla(error: string | null | undefined, fallo_del_empleado?: string | null): ClaseDeFalla {
  if (esCortePorTope(fallo_del_empleado)) return 'tope'
  if (typeof fallo_del_empleado !== 'string') return esFallaPasajera(error) ? 'pasajera' : 'permanente'
  if (TIPO_PERMANENTE.test(fallo_del_empleado)) return 'permanente'
  if (TIPO_PASAJERO.test(fallo_del_empleado) || CODIGO_PASAJERO.test(fallo_del_empleado)) return 'pasajera'
  return 'permanente'
}

export const esWorkflowIdValido = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x)

/**
 * La base de `/api/agents/run-sdk`: `FINANZAS_RUN_SDK_BASE` si existe; si no, la de la propia plataforma (`ZERO_RISK_API_URL`); si no, la de producción.
 * (Sin este respaldo el intento 1 de la oficina midió una variable ausente — `modelo_no_configurado` — y no calidad.) El adaptador sigue exigiendo llave y `fetch`.
 */
export function baseDeRunSdk(env: Record<string, string | undefined>): string {
  const limpio = (x: string | undefined) => (typeof x === 'string' ? x.trim() : '')
  return limpio(env.FINANZAS_RUN_SDK_BASE) || limpio(env.ZERO_RISK_API_URL) || 'https://zero-risk-platform.vercel.app'
}

export interface PedidoRunSdk extends ColumnasDeLaLlamada {
  agent: string
  task: string
  client_id: string
  workflow_id: string
  workflow_execution_id: string
  dry_run: boolean
  force_restart: boolean
  step_name?: string
  /** tope de gasto de ESTE turno: el corredor corta solo (run-sdk lo acepta entre 0 y 50) */
  max_budget_usd?: number
}

/** arma el cuerpo; función pura (se prueba sin red). Un turno = una ejecución con id propio, así el libro (agent_invocations) correlaciona por execution id */
export function armarPedidoRunSdk(p: PedidoAlModelo, workflow_id: string, trabajo?: ColumnasDeLaLlamada): PedidoRunSdk {
  return {
    // la llamada que sabe de qué corrida es manda sobre el rótulo del puerto
    // 04-nov · de qué trabajo es la llamada, lo trae quien llama · el paso es el de este turno
    ...(p.trabajo ?? trabajo ?? {}),
    paso: p.paso,
    agent: p.agente,
    task: p.tarea.length > MAX_TAREA_RUN_SDK ? p.tarea.slice(0, MAX_TAREA_RUN_SDK) : p.tarea,
    client_id: p.client_id,
    workflow_id,
    workflow_execution_id: `${p.encargo_id}:${p.paso}`,
    dry_run: p.dry_run,
    // una vuelta repetida del mismo turno NO debe devolver la respuesta vieja guardada (lección del flujo de prueba)
    force_restart: p.reanudar !== true,
    ...(p.clave_de_turno ? { step_name: p.clave_de_turno } : {}),
    ...(p.tope_usd > 0 && p.tope_usd <= 50 ? { max_budget_usd: p.tope_usd } : {}),
  }
}

export interface AjustesDelModelo {
  base: string | undefined
  llave: string | undefined
  fetch: typeof fetch | undefined
  /** id real del flujo que llama; sin él NO se llama al modelo (run-sdk rechaza lo que no viene de un flujo) */
  workflow_id: string | undefined
  /** 04-nov · de qué trabajo son las llamadas · sin él, «sin dato» */
  trabajo?: ColumnasDeLaLlamada
}

/** extrae el texto de la respuesta de run-sdk sin asumir su forma exacta */
/** el fallo que declara el corredor: `{ success:false, error }` en un 5xx. Un 502 del camino (`agent-runner upstream failed`) no lo trae: ahí no se sabe si el empleado sigue */
function falloDeclarado(j: unknown): string | null {
  if (typeof j !== 'object' || j === null) return null
  const o = j as Record<string, unknown>
  return o.success === false && typeof o.error === 'string' ? o.error : null
}
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
          // 05-nov · sin latido, el `fetch` de Node corta a los 300 s sin cabeceras (medido: 306 s) y el turno pagado se pierde
          headers: { 'content-type': 'application/json', 'x-api-key': a.llave, [CABECERA_DEL_LATIDO]: '1' },
          body: JSON.stringify(armarPedidoRunSdk(p, a.workflow_id, a.trabajo)),
        })
        const j: unknown = await r.json().catch(() => null)
        // con latido, lo que tardó se compromete en 200 y su código verdadero viaja en el cuerpo; un 200 sin cuerpo es una conexión que murió a medias
        const estado = typeof j === 'object' && j !== null ? (j as { estado_http?: unknown }).estado_http : undefined
        const http = typeof estado === 'number' ? estado : r.status
        if (http < 200 || http >= 300) {
          const fallo = http >= 500 ? falloDeclarado(j) : null
          return { ok: false, error: `run_sdk_${http}`, costo_usd: costoDe(j), ...(fallo !== null ? { fallo_del_empleado: fallo } : {}) }
        }
        if (j === null) return { ok: false, error: 'red:cuerpo_cortado', costo_usd: 0 }
        const t = textoDe(j)
        if (t === null) return { ok: false, error: 'respuesta_sin_texto', costo_usd: costoDe(j) }
        return { ok: true, salida: t, costo_usd: costoDe(j) }
      } catch (e) {
        return { ok: false, error: `red:${e instanceof Error ? e.message : String(e)}`, costo_usd: 0 }
      }
    },
  }
}
