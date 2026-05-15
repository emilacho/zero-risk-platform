/**
 * image-pricing.test.ts · Sprint #6 Brazo 1
 *
 * Covers the GPT Image (gpt-image-1) pricing table used by
 * /api/images/generate. Pure function, no I/O, no mocks.
 */
import { describe, it, expect } from 'vitest'
import { priceForSize, PRICING_BY_SIZE, DEFAULT_SIZE } from '../src/lib/image-pricing'

describe('priceForSize', () => {
  it('1024x1024 is the cheapest tier at $0.04', () => {
    expect(priceForSize('1024x1024')).toBe(0.04)
  })

  it('1024x1536 (portrait) is $0.06', () => {
    expect(priceForSize('1024x1536')).toBe(0.06)
  })

  it('1536x1024 (landscape) is $0.06', () => {
    expect(priceForSize('1536x1024')).toBe(0.06)
  })

  it('falls back to the 1024x1024 price for unknown sizes', () => {
    // Critical · a $0 fallback would silently break the cost-alerts cron
    // and the /costs dashboard (LOTE-C Fix 1 history).
    expect(priceForSize('999x999')).toBe(0.04)
    expect(priceForSize('')).toBe(0.04)
    expect(priceForSize('garbage')).toBe(0.04)
  })

  it('all configured sizes return non-zero prices', () => {
    for (const size of Object.keys(PRICING_BY_SIZE)) {
      expect(priceForSize(size)).toBeGreaterThan(0)
    }
  })

  it('DEFAULT_SIZE is in the pricing table', () => {
    expect(PRICING_BY_SIZE[DEFAULT_SIZE]).toBeDefined()
    expect(PRICING_BY_SIZE[DEFAULT_SIZE]).toBeGreaterThan(0)
  })

  it('1024x1024 default tier matches OpenAI 2026 list price', () => {
    // Anchor test · if OpenAI re-prices this needs to update along with
    // the pricing table. Catches drift between the pricing constant and
    // any hardcoded $0.04 references in docs / status routes.
    expect(PRICING_BY_SIZE['1024x1024']).toBe(0.04)
  })

  it('portrait and landscape prices are symmetric', () => {
    // gpt-image-1 charges the same for 1024x1536 and 1536x1024 · catches
    // accidental asymmetry from a copy-paste error in the table.
    expect(PRICING_BY_SIZE['1024x1536']).toBe(PRICING_BY_SIZE['1536x1024'])
  })

  it('larger canvases cost more than the base tier', () => {
    expect(PRICING_BY_SIZE['1024x1536']).toBeGreaterThan(PRICING_BY_SIZE['1024x1024'])
    expect(PRICING_BY_SIZE['1536x1024']).toBeGreaterThan(PRICING_BY_SIZE['1024x1024'])
  })

  it('pricing table only contains supported gpt-image-1 sizes', () => {
    // Anchor · catches accidental additions of unsupported sizes that
    // would 400 against the OpenAI API at runtime.
    const supported = ['1024x1024', '1024x1536', '1536x1024']
    for (const size of Object.keys(PRICING_BY_SIZE)) {
      expect(supported).toContain(size)
    }
  })
})
