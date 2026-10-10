import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { esRechazoDeLlave, resumirRechazos } from '../scripts/ops/verificar-llave-interna.mjs'

describe('verificar la rotación de INTERNAL_API_KEY', () => {
  it('reconoce un rechazo por llave en los mensajes reales de la ruta y de n8n', () => {
    for (const m of ['Missing x-api-key header', 'Invalid x-api-key', 'The service refused the request - 401 - unauthorized', 'Authorization failed - please check your credentials']) expect(esRechazoDeLlave(m), m).toBe(true)
    for (const m of ['', undefined, null, 'timeout of 10000ms exceeded', 'PGRST205 table not found', 'status 4012 not a code']) expect(esRechazoDeLlave(m as never), String(m)).toBe(false)
  })
  it('resume los rechazos por flujo y no cuenta los demás errores', () => {
    expect(resumirRechazos([{ flujo: 'A', mensaje: '401 unauthorized' }, { flujo: 'A', mensaje: 'Invalid x-api-key' }, { flujo: 'B', mensaje: 'timeout' }, { flujo: 'C', mensaje: 'Missing x-api-key header' }])).toEqual({ A: 2, C: 1 })
  })
  it('el script nunca imprime la llave (no hay console.log del valor)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/ops/verificar-llave-interna.mjs'), 'utf8')
    expect(src).not.toMatch(/console\.log\([^)]*\bK\b/)
    expect(src).toMatch(/NUNCA imprime la llave/)
  })
})
