/**
 * EL COSTO DE UN VIDEO EN EL LIBRO DE INVOCACIONES (mismo patrón que `image-ledger.ts`): el freno §150 suma `agent_invocations.cost_usd` por cliente en 24 h,
 * así que el gasto de video tiene que estar ahí. Diferencia con la imagen: el video se COBRA AL TERMINAR en el proveedor y tarda minutos, así que la fila se escribe
 * al ENVIAR con `status = running` y el costo ESTIMADO (reservado: el freno lo ve desde el primer segundo) y se cierra al leer el estado final:
 * `completed` (costo = el estimado, salvo que el proveedor dé otro) · `failed`/`nsfw`/`canceled` (costo 0: el proveedor no cobra ni reserva).
 * Una sola fila por pedido: `session_id = vid-<request_id>`; el que escribe comprueba antes si ya existe.
 */

export const FLUJO_DE_VIDEO = 'api:video-generate'

export interface DatosDelVideo {
  requestId: string
  clientId: string | null
  agentSlug: string | null
  modelo: string
  ruta: string
  segundos: number
  resolucion: string
  relacion: string
  conFotos: number
  caller: string
  costoEstimadoUsd: number
  startedAtMs: number
  workflowId?: string | null
  workflowExecutionId?: string | null
  claveIdempotente: string
  correlacion?: string | null
}

export const sessionIdDeVideo = (requestId: string) => `vid-${requestId}`

/** la fila de ENVÍO (`running`, costo reservado) */
export function filaDeEnvio(d: DatosDelVideo): Record<string, unknown> {
  const nombre = d.agentSlug ?? 'video-generation'
  return {
    session_id: sessionIdDeVideo(d.requestId),
    agent_id: nombre,
    agent_name: nombre,
    command: null,
    task_id: null,
    workflow_id: d.workflowId || FLUJO_DE_VIDEO,
    workflow_execution_id: d.workflowExecutionId || d.requestId,
    client_id: d.clientId,
    journey_id: null,
    model: d.modelo,
    started_at: new Date(d.startedAtMs).toISOString(),
    ended_at: null,
    cost_usd: d.costoEstimadoUsd,
    tokens_input: null,
    tokens_output: null,
    tokens_cache_read: null,
    tokens_cache_creation: null,
    num_turns: 1,
    status: 'running',
    exit_code: null,
    error_message: null,
    output_summary: `video enviado · ${d.segundos} s · ${d.resolucion} · ${d.relacion} · ${d.conFotos} foto(s) de referencia`,
    metadata: { kind: 'video_generation', source: 'video-generate', request_id: d.requestId, ruta: d.ruta, cost_basis: 'estimate_formula', segundos: d.segundos, resolucion: d.resolucion, relacion: d.relacion, con_fotos: d.conFotos, caller: d.caller, idempotency_key: d.claveIdempotente, correlation_id: d.correlacion ?? null },
  }
}

/** el cierre de la fila al leer un estado terminal */
export function cierreDeFila(estadoFinal: string, p: { videoUrl?: string | null; urlCopiada?: string | null; expiresAt?: string | null; error?: string | null; costoUsd?: number | null; endedAtMs: number }): Record<string, unknown> {
  const exito = estadoFinal === 'completed'
  return {
    status: exito ? 'completed' : 'failed',
    exit_code: exito ? 0 : 1,
    ended_at: new Date(p.endedAtMs).toISOString(),
    ...(exito ? (typeof p.costoUsd === 'number' ? { cost_usd: p.costoUsd } : {}) : { cost_usd: 0 }),
    error_message: exito ? null : `${estadoFinal}${p.error ? ` · ${p.error}` : ''}`.slice(0, 500),
    output_summary: exito ? `video listo · ${p.urlCopiada ?? p.videoUrl ?? 'sin url'}` : `video ${estadoFinal}`,
  }
}

type SupabaseLike = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> }
    select: (c: string) => { eq: (c: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } }
  }
}

/** escribe la fila de envío una sola vez; NUNCA lanza (el pedido ya está en el proveedor): un fallo queda en el registro del servidor */
export async function registrarEnvioEnElLibro(db: SupabaseLike, d: DatosDelVideo): Promise<{ ok: boolean; existia?: boolean; error?: string }> {
  try {
    const ya = await db.from('agent_invocations').select('id').eq('session_id', sessionIdDeVideo(d.requestId)).limit(1)
    if (ya.data && ya.data.length) return { ok: true, existia: true }
    const { error } = await db.from('agent_invocations').insert(filaDeEnvio(d))
    if (error) { console.error(`[video/generate] el envío ${d.requestId} NO entró a agent_invocations · ${error.message}`); return { ok: false, error: error.message } }
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error(`[video/generate] el envío ${d.requestId} NO entró a agent_invocations · ${m}`)
    return { ok: false, error: m }
  }
}

export async function cerrarEnElLibro(db: SupabaseLike, requestId: string, cierre: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await db.from('agent_invocations').update(cierre).eq('session_id', sessionIdDeVideo(requestId))
    if (error) { console.error(`[video/generate] el cierre ${requestId} NO se escribió en agent_invocations · ${error.message}`); return { ok: false, error: error.message } }
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { ok: false, error: m }
  }
}
