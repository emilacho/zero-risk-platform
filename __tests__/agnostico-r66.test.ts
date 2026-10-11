/** r66 · agnóstico · ni país, ni ciudad, ni zona del piloto dentro de lo que ejecuta o lee un agente (A2–A7 del inventario de CC#1). */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mercadoDelCliente } from '../src/lib/editor-middleware'

const leer = (p: string) => fs.readFileSync(p, 'utf8')
/** el texto SIN comentarios de línea ni de bloque (lo que queda es lo que se ejecuta o se muestra) */
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '')
const FIJOS = /Guayaquil|Ol[oó]n|Santa Elena|Ecuador|America\/Guayaquil|'EC'/

describe('A4 · el revisor de marca recibe el mercado del CLIENTE, no un país fijo', () => {
  it('mercadoDelCliente: país o mercado del contexto (texto o lista); sin dato, pide tomarlo del cliente', () => {
    expect(mercadoDelCliente({ country: 'Perú' })).toBe('Perú')
    expect(mercadoDelCliente({ markets: ['Chile', 'Uruguay'] })).toBe('Chile / Uruguay')
    expect(mercadoDelCliente({ market: '  ' })).toMatch(/client's own market/)
    expect(mercadoDelCliente(undefined)).toMatch(/client's own market/)
  })
  it('editor-middleware.ts no trae ningún país fijo fuera de comentarios', () => {
    expect(sinComentarios(leer('src/lib/editor-middleware.ts'))).not.toMatch(FIJOS)
  })
})

describe('A2 · A3 · A6 · A7 · sin valores del piloto en código ejecutable', () => {
  it.each([
    'src/app/api/calendar/book/route.ts',
    'src/app/api/rank-tracking/initialize/route.ts',
    'services/agent-runner/src/lib/mcp/discovery-output-server.js',
    'services/agent-runner/src/lib/mcp/apify-service-server.js',
  ])('%s', (f) => {
    expect(sinComentarios(leer(f))).not.toMatch(FIJOS)
  })
})
