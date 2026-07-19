/**
 * Ledger de INTENCIÓN de despacho · `agent_dispatches` · fix raíz (a) 2026-07-19.
 *
 * Spec convergida (consejero+arquitecto · #equipo 13:24 → 14:22). Cierra la clase
 * "accepted-sin-invocación": run-sdk (Track-O fast-ack) insertaba `agent_invocations`
 * DENTRO de `waitUntil` (best-effort post-202) → si Vercel reclama la función tras el
 * 202, la fila nunca aterriza. La corrección: registrar la INTENCIÓN de forma SÍNCRONA
 * en un ledger SEPARADO ANTES del 202 · si no confirma → 5xx (JAMÁS 202-sin-fila).
 *
 * `agent_invocations` NO se toca (queda completed-only · cero ripple). El ledger es la
 * semilla del event-log de despacho de la sala (ADR-018).
 *
 * Idempotencia · el `dispatch_key` se ancla en `workflow_id` estable (el re-dispatch
 * del rescate reusa el mismo workflow_id ⇒ mismo key ⇒ MISMA fila). El índice único es
 * PARCIAL (`WHERE dispatch_key IS NOT NULL`) → PostgREST `.upsert(onConflict)` no puede
 * emitir el predicado del índice parcial, así que la idempotencia se hace con
 * INSERT + captura de `23505` (unique_violation): 2 dispatches misma key ⇒ 1 fila,
 * el 2º se trata como éxito idempotente (NO como error que haría 5xx a un retry legítimo).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const DISPATCHES_TABLE = 'agent_dispatches'

export type DispatchStatus = 'accepted' | 'running' | 'completed' | 'error'

export interface DispatchIntent {
  /** Key explícito del caller (si lo manda) · si no, se deriva. */
  readonly dispatch_key?: string | null
  readonly workflow_id?: string | null
  readonly workflow_execution_id?: string | null
  readonly agent_name?: string | null
  readonly client_id?: string | null
  readonly metadata?: Record<string, unknown>
}

export interface RecordDispatchResult {
  readonly dispatch_key: string
  /** true cuando la fila YA existía (misma key · el 2º de la carrera) · idempotente. */
  readonly idempotent: boolean
}

/**
 * Deriva un `dispatch_key` ESTABLE anclado en `workflow_id` (idempotente en el
 * re-dispatch del rescate). Si el caller manda un key, se respeta tal cual. El key
 * derivado NO cambia por intento (mismo dispatch lógico ⇒ mismo key ⇒ misma fila).
 */
export function deriveDispatchKey(intent: DispatchIntent): string {
  const explicit = (intent.dispatch_key ?? '').trim()
  if (explicit) return explicit
  const wf = (intent.workflow_id ?? '').trim() || 'no-wf'
  const agent = (intent.agent_name ?? '').trim() || 'no-agent'
  const exec = (intent.workflow_execution_id ?? '').trim()
  // Ancla en workflow_id estable · agent + exec afinan la unicidad sin cambiar por
  // reintento del rescate (que reusa el mismo workflow_id + exec).
  return exec ? `dispatch:${wf}:${agent}:${exec}` : `dispatch:${wf}:${agent}`
}

/** Código PostgREST/Postgres de violación de unicidad. */
const UNIQUE_VIOLATION = '23505'

/**
 * INSERT SÍNCRONO de la intención (status `accepted`) ANTES del 202. Idempotente por
 * `dispatch_key` vía INSERT + captura de 23505. Si el DB devuelve CUALQUIER otro error
 * → THROW → el caller DEBE responder 5xx (nunca 202). El éxito garantiza que la
 * intención es durable y visible antes de que la respuesta salga.
 */
export async function recordDispatchIntent(
  supabase: SupabaseClient,
  intent: DispatchIntent,
): Promise<RecordDispatchResult> {
  const dispatch_key = deriveDispatchKey(intent)
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from(DISPATCHES_TABLE).insert({
    dispatch_key,
    workflow_id: intent.workflow_id ?? null,
    workflow_execution_id: intent.workflow_execution_id ?? null,
    agent_name: intent.agent_name ?? null,
    client_id: intent.client_id ?? null,
    status: 'accepted' as DispatchStatus,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: intent.metadata ?? {},
  })

  if (error) {
    // Misma key ya registrada (la carrera del upsert) ⇒ idempotente, NO es fallo.
    if (error.code === UNIQUE_VIOLATION) return { dispatch_key, idempotent: true }
    // Cualquier otro error = la intención NO se confirmó ⇒ el caller responde 5xx.
    throw new Error(`dispatch_intent_insert_failed: ${error.message}`)
  }
  return { dispatch_key, idempotent: false }
}

/**
 * Transición PROMPT a `running` (segundos) · habilita la detección de flake a
 * ~90-120s (D2). Best-effort (post-202 · dentro del waitUntil) · si no corre, la fila
 * queda en `accepted` y el rescate la caza. NUNCA throwea (no debe tumbar el trabajo).
 */
export async function markDispatchRunning(
  supabase: SupabaseClient,
  dispatch_key: string,
): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    await supabase
      .from(DISPATCHES_TABLE)
      .update({ status: 'running' as DispatchStatus, running_at: nowIso, updated_at: nowIso })
      .eq('dispatch_key', dispatch_key)
  } catch {
    /* best-effort · el estado accepted sigue siendo la señal durable */
  }
}

/**
 * Transición terminal (`completed` | `error`) del despacho en el ledger. Best-effort ·
 * `agent_invocations` sigue siendo la fuente del RESULTADO · esto sólo cierra el ledger.
 */
export async function markDispatchTerminal(
  supabase: SupabaseClient,
  dispatch_key: string,
  status: 'completed' | 'error',
): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    await supabase
      .from(DISPATCHES_TABLE)
      .update({ status, completed_at: nowIso, updated_at: nowIso })
      .eq('dispatch_key', dispatch_key)
  } catch {
    /* best-effort */
  }
}
