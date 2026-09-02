/**
 * Guardia de GEMELO LÓGICO para `sala_event_log`.
 *
 * ── EL DEFECTO, MEDIDO ────────────────────────────────────────────────────
 * En la corrida real de GoEuropeAdventure (2026-09-01) el cierre del alta se
 * escribió DOS VECES, con un segundo de diferencia:
 *
 *   de6fd02b  20:29:20.151  operation_type = sala-callback.run_completed
 *   07423885  20:29:21.218  operation_type = sala-ingress.journey_completed.completed
 *
 *   tenant_id, client_id, stream_id, correlation_id, event_type y step_id
 *   ('journey_completed') · IDÉNTICOS en las dos filas.
 *
 * ── POR QUÉ LA LLAVE DE IDEMPOTENCIA NO LO ATRAPÓ ─────────────────────────
 * `buildIdempotencyKey` mezcla `operation_type` en el hash. Las dos filas son
 * el MISMO hecho pero llegan por dos puertas distintas (`/api/sala/callback` y
 * `/api/sala/ingress`), y cada puerta pone su propio `operation_type` ⇒ dos
 * llaves distintas ⇒ la restricción UNIQUE nunca se entera.
 *
 * No es un doble disparo: son DOS ESCRITORES DISTINTOS declarando el mismo
 * hecho con nombres de operación distintos. El flujo `wu1DUAXIuEG5nNTX` llama
 * a los dos a propósito (nodo 9 "Write-back Callback · run terminal" y nodo 10
 * "Phase-boundary Emit · journey_completed").
 *
 * ── QUÉ HACE ESTA GUARDIA ─────────────────────────────────────────────────
 * Busca una fila YA ESCRITA que sea el mismo hecho lógico, mirando lo que
 * identifica al hecho y NO a quien lo escribe:
 *
 *     (tenant_id, stream_id, correlation_id, step_id, event_type)
 *
 * Es exactamente la intención de la llave de idempotencia vigente MENOS el
 * `operation_type`. El caso «mismo escritor dos veces» ya lo corta la
 * restricción UNIQUE; lo único que agrega esta guardia es el caso
 * «dos escritores, un hecho». Por eso no cambia ningún camino que ya funcione.
 *
 * ── REGLAS ────────────────────────────────────────────────────────────────
 * · NUNCA lanza. Un fallo de consulta devuelve `degraded: true` con
 *   `found: false` ⇒ el que llama escribe igual que hoy (§148 · la red de
 *   seguridad no puede ser un punto de falla nuevo).
 * · NUNCA borra ni pisa nada. Sólo LEE y avisa que ya hay un gemelo.
 * · El que llama decide qué hacer. Esta función no suprime nada por su cuenta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Lo que identifica al HECHO · deliberadamente sin `operation_type`. */
export interface LogicalEventKey {
  tenant_id: string
  stream_id: string
  correlation_id: string
  step_id: string
  event_type: string
}

export interface TwinLookupResult {
  /** true si ya existe una fila con el mismo hecho lógico. */
  found: boolean
  /** `event_id` de la fila que ya estaba · para devolvérselo al que llama. */
  event_id: string | null
  /** Qué escritor la puso primero · queda en la respuesta para forense. */
  operation_type: string | null
  /** true si la consulta falló · el que llama debe seguir como hoy. */
  degraded: boolean
}

const NOT_FOUND: TwinLookupResult = {
  found: false,
  event_id: null,
  operation_type: null,
  degraded: false,
}

/**
 * ¿Ya hay una fila con este mismo hecho lógico?
 *
 * Devuelve `found: false` cuando no la hay Y cuando la consulta falla — la
 * diferencia se lee en `degraded`, para que un fallo nunca se confunda con
 * «no había gemelo» en las métricas.
 */
export async function findLogicalTwin(
  supabase: SupabaseClient,
  key: LogicalEventKey,
): Promise<TwinLookupResult> {
  try {
    const { data, error } = await supabase
      .from('sala_event_log')
      .select('event_id, operation_type')
      .eq('tenant_id', key.tenant_id)
      .eq('stream_id', key.stream_id)
      .eq('correlation_id', key.correlation_id)
      .eq('step_id', key.step_id)
      .eq('event_type', key.event_type)
      .limit(1)

    if (error) return { ...NOT_FOUND, degraded: true }
    if (!Array.isArray(data) || data.length === 0) return NOT_FOUND

    const row = data[0] as { event_id?: string; operation_type?: string }
    return {
      found: true,
      event_id: row.event_id ?? null,
      operation_type: row.operation_type ?? null,
      degraded: false,
    }
  } catch {
    return { ...NOT_FOUND, degraded: true }
  }
}
