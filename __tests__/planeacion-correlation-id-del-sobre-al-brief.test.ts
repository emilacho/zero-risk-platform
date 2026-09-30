/**
 * EL SOBRE DE PLANEACIÓN AL BRIEF NO MANDA `correlation_id: null` · CC#1 · 2026-09-30 · costo cero.
 * La puerta de la sala rechaza `correlation_id: null` (invalid_envelope). Se evalúa LA expresión real del nodo (foto «construida» del flujo) con un `$` de juguete.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30')
const NODO = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const cuerpoDe = (archivo: string, webhookBody: Record<string, unknown>) => {
  const w = JSON.parse(fs.readFileSync(join(dir, archivo), 'utf8'))
  const expr: string = w.nodes.find((n: { name: string }) => n.name === NODO).parameters.jsonBody
  const dentro = expr.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
  const $ = (nombre: string) => ({ first: () => ({ json: nombre === 'Webhook · planeacion' ? { body: webhookBody } : { id: 'plan-1' } }) })
  return JSON.parse(new Function('$', `return (${dentro})`)($))
}
const BASE = { client_id: 'c1', tenant_id: 't1', _journey_id: 'j1', dry_run: false }
const UUID = '5e1f534a-0000-4000-8000-000000000001'

describe('🔴 el sobre de planeación al brief · correlation_id', () => {
  it('sin _sala_correlation_id el sobre NO lleva la llave (antes: correlation_id:null → la sala lo rechazaba)', () => {
    const c = cuerpoDe('planeacion-construida-correlation-id-2026-09-30.json', BASE)
    expect('correlation_id' in c).toBe(false)
    expect(c).toMatchObject({ source: 'planeacion/plan-listo', intent: 'briefear', client_id: 'c1' })
  })
  it('con _sala_correlation_id lo lleva tal cual · vacío se trata como ausente', () => {
    expect(cuerpoDe('planeacion-construida-correlation-id-2026-09-30.json', { ...BASE, _sala_correlation_id: UUID }).correlation_id).toBe(UUID)
    expect('correlation_id' in cuerpoDe('planeacion-construida-correlation-id-2026-09-30.json', { ...BASE, _sala_correlation_id: '' })).toBe(false)
  })
  it('el resto del sobre no cambió respecto del flujo vivo de antes', () => {
    const antes = cuerpoDe('planeacion-antes-correlation-id-2026-09-30.json', { ...BASE, _sala_correlation_id: UUID })
    const despues = cuerpoDe('planeacion-construida-correlation-id-2026-09-30.json', { ...BASE, _sala_correlation_id: UUID })
    expect(despues).toEqual(antes)
  })
  it('la prueba PUEDE fallar: el flujo de ANTES sí mandaba correlation_id:null', () => {
    expect(cuerpoDe('planeacion-antes-correlation-id-2026-09-30.json', BASE).correlation_id).toBeNull()
  })
  it('sólo cambió ese nodo', () => {
    const a = JSON.parse(fs.readFileSync(join(dir, 'planeacion-antes-correlation-id-2026-09-30.json'), 'utf8'))
    const d = JSON.parse(fs.readFileSync(join(dir, 'planeacion-construida-correlation-id-2026-09-30.json'), 'utf8'))
    const ma = Object.fromEntries(a.nodes.map((n: { name: string }) => [n.name, JSON.stringify(n)]))
    expect(d.nodes.filter((n: { name: string }) => ma[n.name] !== JSON.stringify(n)).map((n: { name: string }) => n.name)).toEqual([NODO])
    expect(JSON.stringify(d.connections)).toBe(JSON.stringify(a.connections))
  })
})
