/**
 * El texto completo de cada llamada (01-nov · firma de Emilio · observabilidad, punto 1). Nunca lanza ni frena la llamada: el libro de costos ya quedó escrito.
 * Las llaves se ocultan antes de guardar. El corredor tiene la misma lista en `services/agent-runner/src/lib/agent-invocations-log.ts`; una prueba exige que coincidan.
 */
export const LLAVES_A_OCULTAR: readonly RegExp[] = [
  /\b(sk|pk|rk|xox[abps]?|ghp|gho|apify_api)[-_][A-Za-z0-9_-]{8,}/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}(\.[A-Za-z0-9_-]+)?/g,
  /\b[0-9a-f]{40,}\b/gi,
]
export function ocultarLlaves(texto: string): string {
  return LLAVES_A_OCULTAR.reduce((t, re) => t.replace(re, '[oculto]'), texto)
}

/** cuántos días se guardan: a 72 llamadas por día (medido el 01-nov) caben de sobra, y un mes alcanza para investigar una corrida */
export const DIAS_DE_TEXTOS = 30

type Db = { from: (t: string) => { insert: (f: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } }
export async function guardarTextosDeInvocacion(db: Db, invocationId: string, t: { entrada?: string | null; salida?: string | null }): Promise<void> {
  const entrada = typeof t.entrada === 'string' && t.entrada ? ocultarLlaves(t.entrada) : null
  const salida = typeof t.salida === 'string' && t.salida ? ocultarLlaves(t.salida) : null
  if (!entrada && !salida) return
  try {
    const { error } = await db.from('agent_invocation_textos').insert({ invocation_id: invocationId, entrada, salida })
    if (error) console.error(`[textos] no se guardaron los de ${invocationId} · ${error.message}`)
  } catch (e) {
    console.error(`[textos] no se guardaron los de ${invocationId} · ${e instanceof Error ? e.message : String(e)}`)
  }
}
