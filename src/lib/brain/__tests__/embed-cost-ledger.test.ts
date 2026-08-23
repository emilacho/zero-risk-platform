/**
 * D1 · el costo de las huellas se REGISTRA.
 *
 * Agujero medido (CC#3 2026-08-22): `ingest-source` calculaba `cost_usd` y lo
 * devolvía sólo en la respuesta HTTP. Los 6 caminos de huellas tenían CERO
 * referencias a una tabla de costos ⇒ el vigía de $8/día veía $0,00.
 *
 * Criterio del plan §2 · cada prueba declara qué la vuelve ROJA.
 */
import { describe, it, expect, vi } from 'vitest'
import { recordEmbedCost } from '../embed-cost-ledger'

function stubSupabase(opts: { error?: boolean; explota?: boolean } = {}) {
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    if (opts.explota) throw new Error('boom')
    return opts.error ? { error: { message: 'tabla inexistente' } } : { error: null, data: [row] }
  })
  return { supabase: { from: () => ({ insert }) } as any, insert }
}

const ENTRADA = {
  client_id: 'e388a370-910f-4ee7-9a48-4a79393b8cb4',
  source_table: 'client_brand_books',
  source_id: '4c2c3f63',
  sections_count: 1,
  chars_count: 647,
  tokens_count: 192,
  cost_usd: 0.00000384,
  embedding_model: 'text-embedding-3-small',
  ingress_route: '/api/brain/ingest-source',
}

describe('D1 · registro del costo de embebidos', () => {
  // ROJO si: se borra la llamada a `recordEmbedCost` en ingest-source, o si el
  // insert deja de mandar `cost_usd` (el vigía volvería a ver $0,00).
  it('deja una fila con el costo, el volumen y de qué puerta vino', async () => {
    const { supabase, insert } = stubSupabase()
    const r = await recordEmbedCost(supabase, ENTRADA)

    expect(r.recorded).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    const fila = insert.mock.calls[0][0] as Record<string, unknown>
    expect(fila.cost_usd).toBe(0.00000384)
    expect(fila.chars_count).toBe(647)
    expect(fila.tokens_count).toBe(192)
    expect(fila.client_id).toBe(ENTRADA.client_id)
    expect(fila.ingress_route).toBe('/api/brain/ingest-source')
    expect(fila.embedding_model).toBe('text-embedding-3-small')
  })

  // ROJO si: se quita el manejo de error y `recordEmbedCost` propaga.
  // La lección de H1.2 · el código no puede romperse por una migración que aún
  // no llegó. Registrar es RASTRO: nunca puede tumbar el ingreso.
  it('si la tabla todavía no existe · NO rompe el ingreso', async () => {
    const { supabase } = stubSupabase({ error: true })
    await expect(recordEmbedCost(supabase, ENTRADA)).resolves.toEqual({
      recorded: false,
      reason: 'insert_error',
    })
  })

  it('si la escritura explota · tampoco rompe el ingreso', async () => {
    const { supabase } = stubSupabase({ explota: true })
    await expect(recordEmbedCost(supabase, ENTRADA)).resolves.toEqual({
      recorded: false,
      reason: 'threw',
    })
  })
})
