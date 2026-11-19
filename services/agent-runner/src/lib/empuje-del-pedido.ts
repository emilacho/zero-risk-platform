/**
 * Encargo 9 · 18-nov · la mesa que ya recibe la base y el índice de su pieza apaga el EMPUJE con `extra.sin_empuje: true`
 * (contrato con CC2). Solo `true` lo apaga; cualquier otro valor deja el empuje como siempre. Fuera de la mesa no cambia nada.
 * Vive aparte de `brain-enrichment` para que nada que reemplace ese módulo en una prueba apague o rompa esta compuerta.
 */
import type { EnrichmentResult } from './brain-enrichment'

export const empujeApagadoPorElPedido = (extra: unknown): boolean =>
  !!extra && typeof extra === 'object' && !Array.isArray(extra) && (extra as Record<string, unknown>).sin_empuje === true

/** lo que se anota cuando el pedido apagó el empuje: ningún trozo, ningún gasto, y el motivo declarado */
export const enriquecimientoApagadoPorElPedido = (): EnrichmentResult => ({
  enrichment: '', brain_chunks_count: 0, chunks_used: 0, brain_hit: false, brain_query_ms: 0, tokens_used: 0, cost_usd: 0,
  evidence_refs: [], grounding: 'prose_only', brain_push: 'apagado_por_el_pedido',
})
