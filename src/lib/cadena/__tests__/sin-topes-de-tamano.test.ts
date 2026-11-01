// 01-nov · firma de Emilio: «darle el tamaño máximo a todo». Lo que le llega al agente no se recorta con un tope propio.
import { describe, expect, it } from 'vitest'
import { tareaDeEstrategia } from '../indicaciones'
import { contextoDe, clienteA } from '../__fixtures__/clientes'

describe('las referencias llegan enteras al agente', () => {
  const base = contextoDe(clienteA())
  const pedido = (referencias: typeof base.referencias) => tareaDeEstrategia({ ctx: { ...base, referencias }, formatosPermitidos: {}, version: 1 })
  const ref = base.referencias[0]
  it('🔴 un texto largo no se corta', () => {
    const largo = 'x'.repeat(3000) + 'FINAL'
    expect(pedido([{ ...ref, texto: largo }])).toContain('FINAL')
  })
  it('🔴 más de 60 referencias: llegan todas', () => {
    const muchas = Array.from({ length: 80 }, (_, i) => ({ ...ref, id: `r-${i}`, texto: `dato ${i}` }))
    expect(pedido(muchas)).toContain('r-79')
  })
})
