/** El caso «simulación sobre un encargo real» de la puerta abre SU PROPIO encargo y lo cierra (15-oct: dejaba un encargo REAL abierto y `tienda-en-linea` salía 0/20). */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = fs.readFileSync('scripts/ops/finanzas-seco.mjs', 'utf8').split('\r\n').join('\n')
const bloque = src.slice(src.indexOf("simulación sobre un encargo real', status"), src.indexOf("if (orden === 'correr')"))

describe('la puerta cierra su propio encargo', () => {
  it('borra SOLO ese encargo (por id y por cliente de práctica), lo lee de vuelta y cuenta el resultado en `bien`', () => {
    expect(bloque).toContain('method: \'DELETE\'')
    expect(bloque).toContain('id=eq.${a.json.encargo_id}&client_id=eq.${IDS[1]}')
    expect(bloque).toContain("cuenta('finanzas_encargos', `id=eq.${a.json.encargo_id}`)")
    expect(bloque).toMatch(/bien = bien && cerrado/)
  })
  it('ya no deja el aviso de «queda un encargo REAL abierto»', () => {
    expect(src).not.toContain('queda un encargo REAL abierto')
  })
})
