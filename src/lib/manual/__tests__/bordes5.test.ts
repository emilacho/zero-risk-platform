import { describe, expect, it } from 'vitest'
import { dudasAtadas } from '..'

describe('R7 · el mínimo de términos compartidos es EXACTO', () => {
  const d = [{ origen: 'x', frase: 'No sé si uno dos', terminos: ['uno', 'dos'] }]
  it('con exactamente 2 términos compartidos se ata; con 1 no; con un mínimo mayor, tampoco', () => {
    expect(dudasAtadas('uno dos tres', d, 2)).toHaveLength(1)
    expect(dudasAtadas('uno tres cuatro', d, 2)).toHaveLength(0)
    expect(dudasAtadas('uno dos tres', d, 3)).toHaveLength(0)
  })
})
