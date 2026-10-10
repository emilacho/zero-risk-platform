/**
 * EL COSTO DE UNA IMAGEN EN EL LIBRO DE INVOCACIONES (relevo 41). Antes el costo de generar una imagen vivía SOLO en `agent_image_generations`: el freno §150 (que suma
 * `agent_invocations.cost_usd` por cliente en 24 h) no lo veía. Ahora cada imagen generada con éxito deja UNA fila en `agent_invocations`, atada a su `generation_id`
 * (`session_id = img-<generation_id>`, también en `metadata.generation_id`): una sola vez por imagen. Puro: arma la fila; el que llama la escribe.
 *
 * Contabilidad: `agent_image_generations.cost_usd` es el detalle de las imágenes; `agent_invocations.cost_usd` es el TOTAL del gasto de la cuenta e incluye esas mismas
 * imágenes. Quien sume las dos tablas cuenta dos veces (el tablero lo declara).
 */

export interface DatosDeImagen {
  generationId: string
  clientId: string | null
  agentSlug: string | null
  model: string
  size: string
  quality: string | null
  caller: string
  costUsd: number
  costBasis: string
  startedAtMs: number
  endedAtMs: number
  /** si el llamador es un empleado de un flujo, su identificador de flujo y de ejecución (el §149 los pide); si no, el marcador de esta ruta */
  workflowId?: string | null
  workflowExecutionId?: string | null
}

/** marcador del flujo cuando el llamador no manda uno: la ruta de imágenes (nunca NULL: el §149 exige `workflow_id`) */
export const FLUJO_DE_IMAGENES = 'api:images-generate'

/** la fila para `agent_invocations`, o null si la imagen no costó nada (no hay nada que anotar) */
export function filaDeInvocacionDeImagen(d: DatosDeImagen): Record<string, unknown> | null {
  if (!(typeof d.costUsd === 'number' && Number.isFinite(d.costUsd) && d.costUsd > 0)) return null
  const nombre = d.agentSlug ?? 'image-generation'
  return {
    session_id: `img-${d.generationId}`,
    agent_id: nombre,
    agent_name: nombre,
    command: null,
    task_id: null,
    workflow_id: d.workflowId || FLUJO_DE_IMAGENES,
    workflow_execution_id: d.workflowExecutionId || d.generationId,
    client_id: d.clientId,
    journey_id: null,
    model: d.model,
    started_at: new Date(d.startedAtMs).toISOString(),
    ended_at: new Date(d.endedAtMs).toISOString(),
    cost_usd: d.costUsd,
    tokens_input: null,
    tokens_output: null,
    tokens_cache_read: null,
    tokens_cache_creation: null,
    num_turns: 1,
    status: 'completed',
    exit_code: 0,
    error_message: null,
    output_summary: `imagen generada ${d.size}${d.quality ? ` · calidad ${d.quality}` : ''}`,
    metadata: { kind: 'image_generation', source: 'images-generate', generation_id: d.generationId, cost_basis: d.costBasis, size: d.size, quality: d.quality, caller: d.caller },
  }
}

type SupabaseLike = { from: (t: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }> } }

/** escribe la fila; NUNCA lanza ni frena la imagen (la imagen ya se entregó): un fallo queda en el registro del servidor, con la fila a la vista para repararla */
export async function registrarImagenEnElLibro(supabase: SupabaseLike, d: DatosDeImagen): Promise<{ ok: boolean; omitida?: boolean; error?: string }> {
  const fila = filaDeInvocacionDeImagen(d)
  if (!fila) return { ok: true, omitida: true }
  try {
    const { error } = await supabase.from('agent_invocations').insert(fila)
    if (error) {
      console.error(`[images/generate] el costo de la imagen ${d.generationId} NO entró a agent_invocations · ${error.code ?? '-'} · ${error.message} · fila=${JSON.stringify(fila).slice(0, 300)}`)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error(`[images/generate] el costo de la imagen ${d.generationId} NO entró a agent_invocations · ${m}`)
    return { ok: false, error: m }
  }
}
