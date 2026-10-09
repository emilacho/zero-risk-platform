/**
 * GPT Image (gpt-image-1) USD-per-image pricing · OpenAI 2026 list prices.
 *
 * Sprint #6 Brazo 1 · Extracted from `/api/images/generate/route.ts` so it
 * can be unit-tested without spinning up the route handler (Supabase Storage
 * + service-role mocks are brittle, see LOTE-C Fix 8b history).
 *
 * Quality is hardcoded `medium` for now (the cheapest tier that produces
 * usable marketing collateral). Upgrade path: expose a `quality` parameter
 * on the route and add a `PRICING_BY_QUALITY` multiplier here.
 */

export const PRICING_BY_SIZE: Record<string, number> = {
  '1024x1024': 0.04,
  '1024x1536': 0.06,
  '1536x1024': 0.06,
}

export const DEFAULT_SIZE = '1024x1024'

/**
 * Cost for an image at the given size · falls back to the 1024x1024 price
 * when the caller asks for an unknown size so the audit row always has a
 * non-zero `cost_usd` (a zero would silently break the cost-alerts cron and
 * the /costs dashboard, which is exactly the bug LOTE-C Fix 1 closed).
 */
export function priceForSize(size: string): number {
  return PRICING_BY_SIZE[size] ?? PRICING_BY_SIZE[DEFAULT_SIZE]
}

// ── Precio POR MODELO (relevo 22 · gpt-image-1 se retira el 23-oct-2026) ──────
//
// `priceForSize` de arriba es la tabla de `gpt-image-1` y queda como el precio
// de reserva para cualquier modelo que no conozcamos (nunca 0: un 0 rompería
// la alarma de costos). Los modelos nuevos cobran por TOKENS, no por imagen:
// medida 03-oct, imagen media 1024×1024 = 439 tokens de salida = US$ 0,013845.

/** US$ por 1M de tokens (lista OpenAI, medido 03-oct). */
export interface TokenRates {
  text_in: number
  image_in: number
  out: number
}

export const TOKEN_RATES_BY_MODEL: Record<string, TokenRates> = {
  'gpt-image-2.5-flare': { text_in: 5, image_in: 8, out: 30 },
  'gpt-image-2.5-sunburst': { text_in: 5, image_in: 8, out: 30 },
}

/** Estimación por imagen MEDIA 1:1 cuando la respuesta no trae `usage`. */
export const ESTIMATE_SQUARE_BY_MODEL: Record<string, number> = {
  'gpt-image-2.5-flare': 0.0138,
  'gpt-image-2.5-sunburst': 0.0138,
}

/** Lo que devuelve OpenAI en `usage` (campos que usamos). */
export interface ImageUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { text_tokens?: number; image_tokens?: number }
}

/** Redondeo al sexto decimal: la columna `cost_usd` es NUMERIC(10,6). */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Costo de UNA imagen. Orden: (1) real por tokens si el modelo tiene tarifa y
 * la respuesta trae `usage`; (2) estimación del modelo escalada por tamaño con
 * la misma proporción que la tabla vieja; (3) precio de reserva por tamaño.
 */
export function costForImage(params: {
  model: string
  size: string
  usage?: ImageUsage | null
}): { cost_usd: number; basis: 'usage' | 'estimate' | 'fallback' } {
  const rates = TOKEN_RATES_BY_MODEL[params.model]
  const u = params.usage
  if (rates && u && typeof u.output_tokens === 'number' && u.output_tokens > 0) {
    const imageIn = u.input_tokens_details?.image_tokens ?? 0
    const textIn =
      u.input_tokens_details?.text_tokens ?? Math.max((u.input_tokens ?? 0) - imageIn, 0)
    const usd =
      (textIn * rates.text_in + imageIn * rates.image_in + u.output_tokens * rates.out) / 1e6
    return { cost_usd: round6(usd), basis: 'usage' }
  }
  const square = ESTIMATE_SQUARE_BY_MODEL[params.model]
  if (square) {
    const ratio = priceForSize(params.size) / PRICING_BY_SIZE[DEFAULT_SIZE]
    return { cost_usd: round6(square * ratio), basis: 'estimate' }
  }
  return { cost_usd: priceForSize(params.size), basis: 'fallback' }
}
