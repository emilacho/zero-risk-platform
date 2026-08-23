/**
 * D1 · registro del costo de generar huellas del CEREBRO.
 *
 * El agujero (CC#3 2026-08-22): `ingest-source` **calcula** `cost_usd` y lo devuelve
 * en la respuesta HTTP · **nunca lo guarda**. Los 6 caminos de huellas tienen cero
 * referencias a una tabla de costos ⇒ **el vigía de $8/día ve $0,00 de todo esto**.
 * Medido: $0,000909 sobre 847 fichas / 153.182 caracteres.
 *
 * Esto es RASTRO, no freno · y la proporción manda el diseño. El modelo de huellas
 * es ~3.000× más barato por unidad que los empleados: para gastar un día de techo
 * harían falta ~1.348 millones de caracteres. Poner un medidor pesado costaría más
 * que lo medido. **El riesgo real es la repetición sin tope** — el incidente de $19
 * fue un bucle, no una llamada cara — y eso se ataca con tope y frecuencia (D2/D3),
 * no con este archivo.
 *
 * Regla dura, igual que el avisador del freno: **registrar NUNCA puede romper el
 * ingreso**. Si la tabla no existe todavía (migración sin aplicar) o la escritura
 * falla, se ignora en silencio y el ingreso sigue. La lección de H1.2: el código no
 * puede romperse por una migración que aún no llegó.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmbedCostEntry {
  readonly client_id: string | null
  readonly source_table: string
  readonly source_id?: string | null
  readonly sections_count: number
  readonly chars_count: number
  readonly tokens_count: number
  readonly cost_usd: number
  readonly embedding_model?: string | null
  readonly ingress_route: string
  readonly metadata?: Record<string, unknown>
}

export interface RecordEmbedCostResult {
  readonly recorded: boolean
  readonly reason?: 'insert_error' | 'threw'
}

/**
 * Escribe una fila de costo de embebido. **Nunca lanza.** El resultado está tipado
 * sólo para que las pruebas puedan exigir que la escritura ocurrió.
 */
export async function recordEmbedCost(
  supabase: SupabaseClient,
  entry: EmbedCostEntry,
): Promise<RecordEmbedCostResult> {
  try {
    const { error } = await supabase.from('brain_embed_costs').insert({
      client_id: entry.client_id,
      source_table: entry.source_table,
      source_id: entry.source_id ?? null,
      sections_count: entry.sections_count,
      chars_count: entry.chars_count,
      tokens_count: entry.tokens_count,
      cost_usd: entry.cost_usd,
      embedding_model: entry.embedding_model ?? null,
      ingress_route: entry.ingress_route,
      metadata: entry.metadata ?? {},
    })
    if (error) return { recorded: false, reason: 'insert_error' }
    return { recorded: true }
  } catch {
    return { recorded: false, reason: 'threw' }
  }
}
