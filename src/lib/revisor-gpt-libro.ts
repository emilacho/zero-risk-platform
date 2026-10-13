/**
 * EL GASTO DEL REVISOR GPT EN EL LIBRO DE INVOCACIONES (condición 5 de CC#3 · jefatura · 13-oct). Antes el costo de cada llamada a GPT vivía SOLO en el libro propio de la oficina (su tabla de gastos)
 * (concepto `revisor_externo`): el freno de US$ 8 por cliente en 24 h (`run-sdk-spend-gate`, que suma `agent_invocations.cost_usd`) y el vigilante de costos (que lee
 * el rollup de esa misma tabla) no lo veían. Ahora cada llamada a GPT que cuesta algo deja UNA fila en `agent_invocations`, igual que ya hace cada imagen (`image-ledger.ts`).
 *
 * Una fila por llamada (con sus reintentos dentro): `session_id = gpt-<origen>-<ref>-<n>`; si la misma llamada se registra dos veces, la segunda se reconoce (23505) y no suma de nuevo.
 * Contabilidad: el libro propio de la oficina (su tabla de gastos) (o la traza de la jefatura) es el DETALLE por encargo; `agent_invocations` es el TOTAL de la cuenta. Quien sume las dos cuenta dos veces.
 * Puro salvo `registrarRevisorEnElLibro`, que escribe; NUNCA lanza ni frena la revisión (la llamada ya ocurrió): un fallo queda en el registro del servidor con la fila a la vista.
 */
import { llamarRevisorGpt, type OpcionesDeLlamada, type ResultadoDelRevisor } from './revisor-gpt'

/** de quién es la llamada: la oficina (piezas), la jefatura (plan, estrategia, calendario, brief, piezas) o la revisión del manual */
export type OrigenDelRevisor = 'oficina' | 'jefatura' | 'manual'

export interface DatosDelRevisor {
  origen: OrigenDelRevisor
  /** el encargo (oficina), la revisión (jefatura) o el cliente (manual): lo que identifica la llamada junto con `n` */
  refId: string
  /** número de la llamada dentro de su ref (el paso); por omisión 0 */
  n?: number
  clientId: string | null
  modelo: string
  costUsd: number
  /** `usage` si el precio vino del entorno; `estimado` si se usó el valor conservador por omisión */
  costBasis: 'usage' | 'estimado'
  ok: boolean
  intentos: number
  startedAtMs: number
  endedAtMs: number
  workflowId?: string | null
  workflowExecutionId?: string | null
}

/** marcador del flujo cuando quien llama no manda uno (el §149 exige `workflow_id`: nunca NULL) */
export const FLUJO_DEL_REVISOR = 'api:revisor-externo'
export const AGENTE_DEL_REVISOR = 'revisor-externo-gpt'

/** la fila para `agent_invocations`, o null si la llamada no costó nada (no hay nada que anotar) */
export function filaDeInvocacionDelRevisor(d: DatosDelRevisor): Record<string, unknown> | null {
  if (!(typeof d.costUsd === 'number' && Number.isFinite(d.costUsd) && d.costUsd > 0)) return null
  const sesion = `gpt-${d.origen}-${d.refId}-${d.n ?? 0}`
  return {
    session_id: sesion,
    agent_id: AGENTE_DEL_REVISOR,
    agent_name: AGENTE_DEL_REVISOR,
    command: null,
    task_id: null,
    workflow_id: d.workflowId || FLUJO_DEL_REVISOR,
    workflow_execution_id: d.workflowExecutionId || sesion,
    client_id: d.clientId,
    journey_id: null,
    model: d.modelo,
    started_at: new Date(d.startedAtMs).toISOString(),
    ended_at: new Date(d.endedAtMs).toISOString(),
    cost_usd: d.costUsd,
    tokens_input: null,
    tokens_output: null,
    tokens_cache_read: null,
    tokens_cache_creation: null,
    num_turns: d.intentos,
    status: d.ok ? 'completed' : 'failed',
    exit_code: d.ok ? 0 : 1,
    error_message: d.ok ? null : 'el revisor externo no respondió (el costo de los intentos sí se cobró)',
    output_summary: `revisor externo (${d.origen}) · ${d.ok ? 'opinión recibida' : 'sin segunda mirada'} · ${d.intentos} intento(s)`,
    metadata: { kind: 'revisor_externo', source: d.origen, ref_id: d.refId, n: d.n ?? 0, cost_basis: d.costBasis, intentos: d.intentos },
  }
}

type SupabaseLike = { from: (t: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }> } }

export async function registrarRevisorEnElLibro(supabase: SupabaseLike, d: DatosDelRevisor): Promise<{ ok: boolean; omitida?: boolean; repetida?: boolean; error?: string }> {
  const fila = filaDeInvocacionDelRevisor(d)
  if (!fila) return { ok: true, omitida: true }
  try {
    const { error } = await supabase.from('agent_invocations').insert(fila)
    if (error) {
      // la misma llamada ya estaba anotada: no se suma dos veces
      if (error.code === '23505') return { ok: true, repetida: true }
      console.error(`[revisor-gpt] el costo de la llamada ${String(fila.session_id)} NO entró a agent_invocations · ${error.code ?? '-'} · ${error.message} · fila=${JSON.stringify(fila).slice(0, 300)}`)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error(`[revisor-gpt] el costo de la llamada ${String(fila.session_id)} NO entró a agent_invocations · ${m}`)
    return { ok: false, error: m }
  }
}

export interface ContextoDelLibro {
  supabase: SupabaseLike
  origen: OrigenDelRevisor
  refId: string
  n?: number
  clientId: string | null
  workflowId?: string | null
  workflowExecutionId?: string | null
  ahora?: () => number
}

/**
 * `llamarRevisorGpt` + la fila del libro. Devuelve el MISMO resultado que `llamarRevisorGpt` (no cambia nada de lo que ve quien llama); el registro es un efecto aparte.
 * Cuenta también los intentos que fallaron: el costo de los intentos es real aunque no haya opinión.
 */
export async function llamarRevisorGptConLibro(o: OpcionesDeLlamada, libro: ContextoDelLibro): Promise<ResultadoDelRevisor> {
  const reloj = libro.ahora ?? Date.now
  const t0 = reloj()
  const r = await llamarRevisorGpt(o)
  const t1 = reloj()
  await registrarRevisorEnElLibro(libro.supabase, {
    origen: libro.origen, refId: libro.refId, n: libro.n, clientId: libro.clientId,
    modelo: o.modelo ?? 'desconocido', costUsd: r.costo_usd ?? 0, costBasis: o.precioEntrada !== undefined && o.precioSalida !== undefined ? 'usage' : 'estimado',
    ok: r.ok, intentos: r.intentos?.length ?? 1, startedAtMs: t0, endedAtMs: t1, workflowId: libro.workflowId, workflowExecutionId: libro.workflowExecutionId,
  })
  return r
}
