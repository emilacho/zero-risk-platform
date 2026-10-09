/**
 * Relevo 22 · costo de imagen POR MODELO. Que el libro no sobrestime con el
 * modelo nuevo y que un modelo desconocido nunca cueste 0.
 */
import { describe, it, expect } from 'vitest'
import { costForImage, priceForSize } from '../src/lib/image-pricing'

describe('costForImage', () => {
  it('gpt-image-1 conserva la tabla vieja por tamaño', () => {
    expect(costForImage({ model: 'gpt-image-1', size: '1024x1024' })).toEqual({ cost_usd: 0.04, basis: 'fallback' })
    expect(costForImage({ model: 'gpt-image-1', size: '1024x1536' }).cost_usd).toBe(0.06)
  })

  it('modelo nuevo con usage: costo REAL por tokens', () => {
    const r = costForImage({
      model: 'gpt-image-2.5-flare',
      size: '1024x1024',
      usage: { input_tokens: 135, output_tokens: 439, input_tokens_details: { text_tokens: 135, image_tokens: 0 } },
    })
    // (135*5 + 439*30) / 1e6 = 0,013845
    expect(r).toEqual({ cost_usd: 0.013845, basis: 'usage' })
  })

  it('suma la foto de entrada a su tarifa (edits)', () => {
    const r = costForImage({
      model: 'gpt-image-2.5-sunburst',
      size: '1024x1024',
      usage: { input_tokens: 1562, output_tokens: 439, input_tokens_details: { text_tokens: 100, image_tokens: 1462 } },
    })
    expect(r.cost_usd).toBe(Math.round(((100 * 5 + 1462 * 8 + 439 * 30) / 1e6) * 1e6) / 1e6)
    expect(r.basis).toBe('usage')
  })

  it('sin detalle de entrada, todo lo de entrada se cobra como texto', () => {
    const r = costForImage({ model: 'gpt-image-2.5-flare', size: '1024x1024', usage: { input_tokens: 200, output_tokens: 100 } })
    expect(r.cost_usd).toBe((200 * 5 + 100 * 30) / 1e6)
  })

  it('modelo nuevo SIN usage: estimación cercana a 0,0138 (no 0,04) y escala con el tamaño', () => {
    const cuadrada = costForImage({ model: 'gpt-image-2.5-flare', size: '1024x1024' })
    expect(cuadrada).toEqual({ cost_usd: 0.0138, basis: 'estimate' })
    expect(cuadrada.cost_usd).toBeLessThan(priceForSize('1024x1024'))
    const vertical = costForImage({ model: 'gpt-image-2.5-flare', size: '1024x1536' })
    expect(vertical.cost_usd).toBeGreaterThan(cuadrada.cost_usd)
  })

  it('usage con 0 tokens de salida no cuenta como real', () => {
    expect(costForImage({ model: 'gpt-image-2.5-flare', size: '1024x1024', usage: { output_tokens: 0 } }).basis).toBe('estimate')
  })

  it('modelo desconocido: precio de reserva, jamás 0', () => {
    const r = costForImage({ model: 'modelo-que-no-existe', size: '999x999', usage: { output_tokens: 500 } })
    expect(r.cost_usd).toBeGreaterThan(0)
    expect(r.basis).toBe('fallback')
  })
})
