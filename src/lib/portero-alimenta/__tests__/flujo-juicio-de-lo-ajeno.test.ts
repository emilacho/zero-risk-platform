/**
 * El flujo del juicio de lo ajeno (ADENDA 2 · c): toda llamada real del agente pasa por un flujo con su ejecución REAL.
 * Se corre el código VERDADERO del nodo de entrada (el del JSON) con un n8n falso. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/juicio-de-lo-ajeno')
type Nodo = { name: string; type: string; parameters: Record<string, unknown> }
const FLUJO = JSON.parse(fs.readFileSync(path.join(DIR, 'flujo-juicio-de-lo-ajeno.json'), 'utf8')) as { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean }
const nodo = (n: string) => FLUJO.nodes.find((x) => x.name === n)!
const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const LLAVE = 'llave-interna-de-prueba'

function correrEntrada(webhook: { headers?: Record<string, string>; body?: unknown }, env: Record<string, string> = { INTERNAL_API_KEY: LLAVE }) {
  const code = String(nodo('⓪ Entrada').parameters.jsCode)
  const $ = (n: string) => ({ first: () => { if (n !== 'Webhook · a mano (llave interna)') throw new Error(`nodo inesperado ${n}`); return { json: webhook } } })
  const fn = new Function('$', '$env', '$workflow', '$execution', code) as (...a: unknown[]) => Array<{ json: Record<string, unknown> }>
  return fn($, env, { id: 'WfReal123' }, { id: 4242 })[0].json
}
const ok = (body: Record<string, unknown>) => correrEntrada({ headers: { 'x-api-key': LLAVE }, body })

describe('el flujo del juicio de lo ajeno', () => {
  it('el JSON es el que arma construir-flujo con entrada.js (nadie lo editó a mano)', async () => {
    const { armarFlujo } = await import(/* @vite-ignore */ path.join(DIR, 'construir-flujo.mjs'))
    expect(JSON.parse(JSON.stringify(armarFlujo()))).toEqual(FLUJO)
  })
  it('nace sin `active` (crearlo no lo enciende) y es lineal: webhook → entrada → juicio', () => {
    expect(FLUJO.active).toBeUndefined()
    expect(JSON.stringify(FLUJO)).not.toMatch(/"active"\s*:\s*true/)
    expect(FLUJO.connections['Webhook · a mano (llave interna)'].main[0][0].node).toBe('⓪ Entrada')
    expect(FLUJO.connections['⓪ Entrada'].main[0][0].node).toBe('① Juicio de lo ajeno')
    expect(FLUJO.nodes).toHaveLength(3)
    expect(FLUJO.nodes.filter((n) => n.type.endsWith('scheduleTrigger'))).toHaveLength(0)
  })
  it('el juicio entra por la ruta con la llave interna, manda lo que arma la entrada y espera hasta 300 s', () => {
    const p = nodo('① Juicio de lo ajeno').parameters as Record<string, unknown>
    expect(p.url).toBe('https://zero-risk-platform.vercel.app/api/brain/alimentar/juicio-de-lo-ajeno')
    expect(p.method).toBe('POST')
    expect(JSON.stringify(p.headerParameters)).toContain('{{ $env.INTERNAL_API_KEY }}')
    expect(p.jsonBody).toBe('={{ JSON.stringify($json) }}')
    expect((p.options as Record<string, unknown>).timeout).toBe(300000)
  })
  it('el flujo y la ejecución salen de n8n, nunca del cuerpo (aunque el cuerpo los traiga)', () => {
    const j = ok({ client_id: C1, dry_run: false, workflow_id: 'inventado', workflow_execution_id: 'inventada' })
    expect(j.workflow_id).toBe('WfReal123')
    expect(j.workflow_execution_id).toBe('4242')
  })
  it('sin llave, con llave equivocada o sin llave configurada: se detiene', () => {
    expect(() => correrEntrada({ headers: {}, body: { client_id: C1, dry_run: true } })).toThrow(/SIN_LLAVE/)
    expect(() => correrEntrada({ headers: { 'x-api-key': 'otra' }, body: { client_id: C1, dry_run: true } })).toThrow(/SIN_LLAVE/)
    expect(() => correrEntrada({ headers: { 'x-api-key': '' }, body: { client_id: C1, dry_run: true } }, { INTERNAL_API_KEY: '' })).toThrow(/SIN_LLAVE/)
  })
  it('client_id uuid y dry_run booleano son obligatorios', () => {
    expect(() => ok({ dry_run: true })).toThrow(/SIN_CLIENTE/)
    expect(() => ok({ client_id: 'naufrago', dry_run: true })).toThrow(/SIN_CLIENTE/)
    expect(() => ok({ client_id: C1 })).toThrow(/DRY_RUN_OBLIGATORIO/)
    expect(() => ok({ client_id: C1, dry_run: 'false' })).toThrow(/DRY_RUN_OBLIGATORIO/)
  })
  it('escribir solo se apaga con false; ids solo uuid; sin ids no manda la llave', () => {
    expect(ok({ client_id: C1, dry_run: true }).escribir).toBe(true)
    expect(ok({ client_id: C1, dry_run: true, escribir: false }).escribir).toBe(false)
    expect(ok({ client_id: C1, dry_run: true, ids: [C1, 'x', 3] }).ids).toEqual([C1])
    expect('ids' in ok({ client_id: C1, dry_run: true })).toBe(false)
  })
  it('las tandas van de 1 a 6 (si no, 2): nunca más de 6 llamadas por ejecución', () => {
    expect(ok({ client_id: C1, dry_run: true }).tandas).toBe(2)
    expect(ok({ client_id: C1, dry_run: true, tandas: 6 }).tandas).toBe(6)
    expect(ok({ client_id: C1, dry_run: true, tandas: 7 }).tandas).toBe(2)
    expect(ok({ client_id: C1, dry_run: true, tandas: 0 }).tandas).toBe(2)
    expect(ok({ client_id: C1, dry_run: true, tandas: 2.5 }).tandas).toBe(2)
    expect(ok({ client_id: C1, dry_run: true, tandas: 1 }).tandas).toBe(1)
  })
})
