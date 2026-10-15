/**
 * J6 cuarto · la falla SEMBRADA a propósito (herramienta de prueba): una frase con palabras que el manual del cliente prohíbe, en UNA pieza, para ejercer el camino de corrección.
 * Núcleo puro: US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { CLIENTES_REALES, correrLaPruebaReal, sembrarFalla, sobreReal, TOPES } from '../scripts/ops/jefatura-prueba-real/nucleo.mjs'

type Cliente = { id: string; prohibidas?: string[] }
const clientes = CLIENTES_REALES as unknown as Cliente[]
const sembrar = sembrarFalla as unknown as (c: Cliente, t: string) => { texto: string; frase: string; palabras_prohibidas: string[] }
const sobre = sobreReal as unknown as (c: unknown, o: { corrida: string; tope_usd: number }) => { payload: { texto: string } }

describe('sembrarFalla', () => {
  for (const [i, c] of clientes.entries()) {
    it(`cliente ${i + 1} (${c.id}): la frase usa palabras de SU lista prohibida y el resto de la pieza queda igual`, () => {
      const original = sobre(c, { corrida: 'x', tope_usd: 0.5 }).payload.texto
      const r = sembrar(c, original)
      expect(r.palabras_prohibidas.length).toBeGreaterThanOrEqual(2)
      for (const w of r.palabras_prohibidas) expect((c.prohibidas ?? []).map((p) => p.toLowerCase())).toContain(w.toLowerCase())
      expect(r.texto).toContain(r.frase)
      // lo original sigue ahí, en orden, y los hashtags (último párrafo) no se tocan
      expect(r.texto.replace(` ${r.frase}`, '')).toBe(original)
      expect(r.texto.split('\n\n').at(-1)).toBe(original.split('\n\n').at(-1))
    })
  }
  it('sin palabras prohibidas en el cliente no inventa nada: se niega', () => {
    expect(() => sembrar({ id: 'x', prohibidas: ['una'] }, 'texto')).toThrow(/no tiene palabras prohibidas/)
    expect(() => sembrar({ id: 'x' }, 'texto')).toThrow(/no tiene palabras prohibidas/)
  })
  it('texto sin párrafo aparte: la frase va al final', () => {
    const r = sembrar(clientes[1], 'Una sola línea.')
    expect(r.texto).toBe(`Una sola línea. ${r.frase}`)
  })
})

describe('el guion', () => {
  it('sin --aplicar solo imprime (la bandera no cambia el modo seco) y los topes son 0,50 / 0,70', async () => {
    expect(TOPES).toMatchObject({ revision: 0.5, total: 0.7 })
    const r = await correrLaPruebaReal({ T: {} as never, aplicar: false, fallaSembrada: true } as never)
    expect(r).toMatchObject({ impreso: true, escrituras: 0 })
  })
})
