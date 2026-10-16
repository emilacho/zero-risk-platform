import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El 16-oct la ruta de procesar fue cortada por Vercel a los 120 s (504) y el vigilante apagó el flujo.
// El nodo ④ del flujo espera 280 s: la ruta no puede tener menos tope que eso.
describe('procesar · tope de tiempo', () => {
  it('maxDuration cubre la espera del nodo (280 s)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/brain/alimentar/procesar/route.ts'), 'utf8')
    const m = src.match(/export const maxDuration = (\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(280)
  })
})
