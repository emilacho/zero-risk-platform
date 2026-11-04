/**
 * 03-nov · CIERRE DEL ALTA · punto 1 · el plan que espera la firma del dueño deja libre al cliente. US$ 0, sin red.
 * Fija: tras «Compuerta · esperar al dueño» hay un cierre «hecha» (solo corrida real con plan_v3), con HTTP neverError (inofensivo si la segunda mitad cierra después),
 * y el cierre de la segunda mitad sigue igual.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing', 'nuevo')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, f + '.json'), 'utf8'))
const plan = leer('X9F0zp6LQ2xGEYVS'), sub = leer('segundaMitadDelPlan')
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
const sale = (f: any, n: string) => (f.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))
const correr = async (body: Record<string, unknown>) => {
  const fn = new AsyncFunction('$', nodo(plan, 'V9 · armar el cierre al esperar al dueño').parameters.jsCode)
  return (await fn((n: string) => ({ first: () => ({ json: n === 'Webhook · planeacion' ? { body } : {} }) })))[0].json
}
const C = 'cliente-1', R = 'corrida-1'

describe('cierre al esperar al dueño', () => {
  it('cableado: compuerta → armar → ¿cerrar? → HTTP', () => {
    expect(sale(plan, 'Compuerta · esperar al dueño')[0]).toContain('V9 · armar el cierre al esperar al dueño')
    expect(sale(plan, 'V9 · armar el cierre al esperar al dueño')[0]).toEqual(['V9 · ¿cerrar al esperar al dueño?'])
    expect(sale(plan, 'V9 · ¿cerrar al esperar al dueño?')[0]).toEqual(['V9 · cerrar al esperar al dueño'])
  })
  it('corrida real con plan_v3: cierra «hecha» con motivo', async () => {
    const j = await correr({ plan_v3: true, dry_run: false, client_id: C, corrida: R })
    expect(j.aplica).toBe(true)
    expect(j.cuerpo).toMatchObject({ accion: 'cerrar', client_id: C, corrida: R, estado: 'hecha' })
    expect(j.cuerpo.motivo).toMatch(/dueño/)
  })
  it('no actúa en ensayo, sin plan_v3 ni sin corrida/cliente', async () => {
    expect((await correr({ plan_v3: true, dry_run: true, client_id: C, corrida: R })).aplica).toBe(false)
    expect((await correr({ dry_run: false, client_id: C, corrida: R })).aplica).toBe(false)
    expect((await correr({ plan_v3: true, dry_run: false, client_id: C })).aplica).toBe(false)
    expect((await correr({ plan_v3: true, dry_run: false, corrida: R })).aplica).toBe(false)
  })
  it('la condición del «¿cerrar?» exige aplica === true (un plan sin plan_v3 no manda una llamada vacía)', () => {
    expect(JSON.stringify(nodo(plan, 'V9 · ¿cerrar al esperar al dueño?').parameters.conditions.conditions[0].leftValue)).toBe(JSON.stringify('={{ $json.aplica === true }}'))
  })
  it('si la llamada falla, la corrida sigue (continueRegularOutput) y el cierre usa la misma ruta que el de la segunda mitad', () => {
    const h = nodo(plan, 'V9 · cerrar al esperar al dueño'), h2 = nodo(sub, 'V9 · cerrar la corrida')
    expect(h.onError).toBe('continueRegularOutput')
    expect(h.parameters.url).toBe(h2.parameters.url)
    expect(h.parameters.jsonBody).toBe(h2.parameters.jsonBody)
  })
  it('otro plan para un cliente que ya tiene uno lo frena la guarda «¿Ya tiene un plan?», no la corrida viva (así «hecha» no duplica la aprobación)', () => {
    const g = nodo(plan, '⑥ ¿Ya tiene un plan?').parameters.url as string
    expect(g).toContain('output_type=eq.campaign_plan_90d')
    expect(g).toContain('status=not.in.(retired,archived,rejected,deleted)')
  })
  it('el HTTP no falla la corrida si la fila ya está cerrada (neverError + continueRegularOutput)', () => {
    const h = nodo(plan, 'V9 · cerrar al esperar al dueño')
    expect(h.parameters.options.response.response.neverError).toBe(true)
    expect(h.onError).toBe('continueRegularOutput')
    const h2 = nodo(sub, 'V9 · cerrar la corrida')
    expect(h2.parameters.options.response.response.neverError).toBe(true)
  })
})
