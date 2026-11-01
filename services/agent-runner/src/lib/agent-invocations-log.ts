/**
 * `agent_invocations` insert helper · 3-retry exponential backoff · Sprint 8D
 * cuenta #1 closure.
 *
 * Sibling of `agents-log-retry.ts` · same retry contract but targets the
 * canonical `agent_invocations` table that Sprint 8D enforcement audits
 * against (`workflow_id IS NULL` queries). The Vercel proxy at
 * `/api/agents/run` writes here for legacy CLI invocations; this helper
 * adds Railway agent-runner write so n8n direct invocations (Sprint 8D
 * Fase 1 bypass) also land on the canonical table.
 *
 * Without this dual write, every modern n8n workflow that calls Railway
 * directly produces a `success` response with cost + tokens but ZERO rows
 * in `agent_invocations` · audit trail BROKEN, canon enforcement query
 * meaningless. See vault doc
 * `raw/qa/2026-05-25-agent-invocations-persistence-regression-fix.md`.
 *
 * Still safe to call fire-and-forget · never throws to caller · success
 * returns void.
 */

/** Exponential backoff delays in ms · 3 attempts total (initial + 2 retries). */
export const AGENT_INVOCATIONS_RETRY_DELAYS_MS = [100, 500, 2000]

// `insert` is typed as PromiseLike (not Promise) so the real Supabase client
// is structurally assignable · supabase-js `.from().insert()` returns a
// PostgrestFilterBuilder which is a thenable but NOT a full Promise (no
// catch/finally/Symbol.toStringTag). `await` only needs `.then()`, so
// PromiseLike is the precise contract this helper actually uses.
type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }>
  }
}

export async function insertAgentInvocationWithRetry(
  supabase: SupabaseLike,
  row: Record<string, unknown>,
  canonicalSlug: string,
): Promise<void> {
  for (let attempt = 0; attempt < AGENT_INVOCATIONS_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { error } = await supabase.from('agent_invocations').insert(row)
      if (!error) return
      const isLastAttempt = attempt === AGENT_INVOCATIONS_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agent-invocations] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENT_INVOCATIONS_RETRY_DELAYS_MS.length} failed for ${canonicalSlug} · code=${error.code ?? '-'} · ${error.message}`,
      )
      if (isLastAttempt) {
        console.error('[agent-invocations] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isLastAttempt = attempt === AGENT_INVOCATIONS_RETRY_DELAYS_MS.length - 1
      const log = isLastAttempt ? console.error : console.warn
      log(
        `[agent-invocations] ${isLastAttempt ? 'ERROR' : 'WARN'} insert attempt ${attempt + 1}/${AGENT_INVOCATIONS_RETRY_DELAYS_MS.length} threw for ${canonicalSlug} · ${msg}`,
      )
      if (isLastAttempt) {
        console.error('[agent-invocations] giving up · row preview·', JSON.stringify(row).slice(0, 400))
        return
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, AGENT_INVOCATIONS_RETRY_DELAYS_MS[attempt]))
  }
}

/** 01-nov · observabilidad, punto 1: la misma lista que `src/lib/textos-de-invocacion.ts` (el corredor no importa de la plataforma; una prueba exige que coincidan) */
export const LLAVES_A_OCULTAR: readonly RegExp[] = [
  /\b(sk|pk|rk|xox[abps]?|ghp|gho|apify_api)[-_][A-Za-z0-9_-]{8,}/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}(\.[A-Za-z0-9_-]+)?/g,
  /\b[0-9a-f]{40,}\b/gi,
]
const ocultarLlaves = (texto: string): string => LLAVES_A_OCULTAR.reduce((t, re) => t.replace(re, '[oculto]'), texto)

/** el texto completo de la llamada, después de escribir el libro. Sin reintentos y sin lanzar: un fallo aquí no toca la corrida ni el costo */
export async function guardarTextosDeInvocacion(supabase: SupabaseLike, invocationId: string, t: { entrada?: string | null; salida?: string | null }): Promise<void> {
  const entrada = typeof t.entrada === 'string' && t.entrada ? ocultarLlaves(t.entrada) : null
  const salida = typeof t.salida === 'string' && t.salida ? ocultarLlaves(t.salida) : null
  if (!entrada && !salida) return
  try {
    const { error } = await supabase.from('agent_invocation_textos').insert({ invocation_id: invocationId, entrada, salida })
    if (error) console.error(`[agent-invocations] textos de ${invocationId} sin guardar · ${error.message}`)
  } catch (e) {
    console.error(`[agent-invocations] textos de ${invocationId} sin guardar · ${e instanceof Error ? e.message : String(e)}`)
  }
}
