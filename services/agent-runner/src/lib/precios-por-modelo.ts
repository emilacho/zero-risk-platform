/**
 * PRECIOS POR MODELO del corredor (USD / 1M tokens) · tabla aparte para poder probarla sin cargar el corredor entero.
 */
// Precios (USD / 1M tokens) · FUENTE OFICIAL: https://platform.claude.com/docs/en/about-claude/pricing (consultada 2026-10-09).
// `cacheRead` = multiplicador de la lectura de caché sobre el precio base de entrada: 0,1 en general; 0,05 en Opus 5.5; 0,025 en Fable 5.1.
// Las escrituras de caché valen 1,25× (5 min) y 2× (1 h) del precio base en todos los modelos de la tabla.
export interface PrecioPorModelo { input: number; output: number; cacheRead: number }
export const COST_PER_M: Record<string, PrecioPorModelo> = {
  sonnet: { input: 3, output: 15, cacheRead: 0.1 }, // Sonnet 4.6 (y el valor de reserva para ids que no conocemos)
  haiku: { input: 1, output: 5, cacheRead: 0.1 }, // Haiku 4.5
  opus: { input: 5, output: 25, cacheRead: 0.1 }, // Opus 5 · 4.8 · 4.7 · 4.6 (antes 15/75 = precio de Opus 4.1/4, ya retirados)
  'opus-5-5': { input: 4, output: 20, cacheRead: 0.05 }, // Opus 5.5
  fable: { input: 10, output: 50, cacheRead: 0.025 }, // Fable 5.1
}

/** @internal Exported for unit testing. Qué fila de `COST_PER_M` cobra un id de modelo (lo desconocido cae en Sonnet, como siempre). */
export function _precioKey(model: string): keyof typeof COST_PER_M {
  const m = model.toLowerCase()
  if (m.includes('fable')) return 'fable'
  if (m.includes('opus-5-5') || m.includes('opus-5.5')) return 'opus-5-5'
  if (m.includes('opus')) return 'opus'
  if (m.includes('haiku')) return 'haiku'
  return 'sonnet'
}

/**
 * @internal Exported for unit testing. Not part of the public API.
 *
 * Sprint 8 · cache-aware cost. Anthropic prompt caching pricing per docs ·
 *   - regular input · 1.0× base
 *   - cache_read    · `cacheRead`× base (0.1× en general · 0.05× Opus 5.5 · 0.025× Fable 5.1)
 *   - cache write 5m TTL · 1.25× base
 *   - cache write 1h TTL · 2.0× base
 *
 * `inTok` from `usage.input_tokens` is the REGULAR input (Anthropic excludes
 * cached portions from this number). Cache reads / writes are billed via the
 * separate counters passed here.
 */
export function _costFor(
  model: string,
  inTok: number,
  outTok: number,
  cacheRead = 0,
  cache5mWrite = 0,
  cache1hWrite = 0,
): number {
  const p = COST_PER_M[_precioKey(model)]
  const baseIn = p.input / 1_000_000
  return (
    inTok * baseIn +
    outTok * (p.output / 1_000_000) +
    cacheRead * baseIn * p.cacheRead +
    cache5mWrite * baseIn * 1.25 +
    cache1hWrite * baseIn * 2.0
  )
}
