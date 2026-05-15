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
