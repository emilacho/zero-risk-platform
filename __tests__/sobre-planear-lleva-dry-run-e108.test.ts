/**
 * 🔴 E108 · EL INTERRUPTOR `dry_run` VIAJA EN EL SOBRE DE LA SALA A PLANEACIÓN.
 *
 * Medido (E107 · planeación 146562): el sobre `planear` del alta no lleva `dry_run`; la sala lo entrega tal cual
 * (payload opaco + campos _sala_*), planeación lee `body.dry_run` para los tres brazos, y el Servicio Apify se negó
 * a los 5 objetivos («falta dry_run explícito · el ensayo se decide, no se asume»). El plan salió con 6 huecos.
 *
 * Fija: (①) el sobre construido lleva `dry_run: false` explícito y NADA más cambió; (②) planeación (foto viva) pasa
 * `body.dry_run` tal cual a los tres brazos; (③) el despachador de la sala esparce el payload entero en el cuerpo,
 * así que el campo llega. NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ALTA_VIVO = leer('LyVoKcrypS5uLyuu/alta-antes-e108-ad844460.json') // lo que corrió en E107
const ALTA_HOY = leer('LyVoKcrypS5uLyuu/alta-construida-e108.json')
const PLANEACION = leer('X9F0zp6LQ2xGEYVS/planeacion-VIVO-2026-09-21.json') // 14951fff · no se toca

const SOBRE = 'E57 · sobre · pedir planeación a la sala'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
/** evalúa el jsonBody del sobre como lo hace el motor: `={ … {{ expr }} … }` con Validate Deal Data simulado */
function sobre(f: Flujo) {
  const plantilla = String(nodo(f, SOBRE).parameters.jsonBody).replace(/^=/, '')
  const deal = { client_id: 'c-1', _journey_id: 'j-1', tenant_id: 't-1', _sala_correlation_id: 'corr-1' }
  const $ = () => ({ first: () => ({ json: deal }) })
  const texto = plantilla.replace(/\{\{([^}]*)\}\}/g, (_, e) => String(new Function('$', `return (${e})`)($)))
  return JSON.parse(texto) as { source: string; intent: string; payload: Record<string, unknown>; idempotency_key: string; logical_period: string; tenant_id: string; client_id: string }
}

describe('el rojo · el sobre de E107 (ad844460) no lleva dry_run', () => {
  it('payload = {pedido, client_id, desde_worker, journey_id} · sin dry_run · planeación recibió undefined', () => {
    const s = sobre(ALTA_VIVO)
    expect(s.intent).toBe('planear')
    expect(Object.keys(s.payload).sort()).toEqual(['client_id', 'desde_worker', 'journey_id', 'pedido'])
    expect(s.payload.dry_run).toBeUndefined()
  })
})

describe('① el arreglo · un campo en el origen', () => {
  it('el sobre construido lleva dry_run:false explícito (booleano, no texto) y el resto del sobre es idéntico', () => {
    const antes = sobre(ALTA_VIVO)
    const hoy = sobre(ALTA_HOY)
    expect(hoy.payload.dry_run).toBe(false)
    const { dry_run: _d, ...restoPayload } = hoy.payload
    expect(restoPayload).toEqual(antes.payload)
    expect({ ...hoy, payload: null }).toEqual({ ...antes, payload: null })
    expect(hoy.idempotency_key).toBe('j-1:planear')
  })
  it('no cambió nada más: 98 nodos · todos los demás nodos y conexiones idénticos · settings iguales', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length)
    for (const v of ALTA_VIVO.nodes) {
      if (v.name === SOBRE) continue
      expect(nodo(ALTA_HOY, v.name).parameters, v.name).toEqual(v.parameters)
    }
    const s = nodo(ALTA_HOY, SOBRE), v = nodo(ALTA_VIVO, SOBRE)
    expect({ ...s.parameters, jsonBody: null }).toEqual({ ...v.parameters, jsonBody: null })
    expect(ALTA_HOY.connections).toEqual(ALTA_VIVO.connections)
    expect(ALTA_HOY.settings.errorWorkflow).toBe(ALTA_VIVO.settings.errorWorkflow)
  })
})

describe('② planeación (foto viva 14951fff · no se toca) pasa body.dry_run tal cual a los tres brazos', () => {
  for (const brazo of ['Brazo · Apify', 'Brazo · PostHog', 'Brazo · cerebro']) {
    it(`«${brazo}» manda dry_run desde el cuerpo del webhook`, () => {
      const body = String(nodo(PLANEACION, brazo).parameters.jsonBody)
      expect(body).toMatch(/dry_run:\s*\$\("Webhook · planeacion"\)\.first\(\)\.json\.body\.dry_run/)
    })
  }
  it('el Servicio Apify exige el booleano · con false se pregunta de verdad · con undefined se niega (su regla, no se toca)', () => {
    const exige = (dry: unknown) => (typeof dry !== 'boolean' ? 'dry_run requerido' : dry ? 'ensayo' : 'real')
    expect(exige(undefined)).toBe('dry_run requerido') // E107
    expect(exige(false)).toBe('real') // E108
    expect(exige(true)).toBe('ensayo')
  })
})

describe('③ la sala entrega el payload entero (esparcido) · el campo llega a planeación', () => {
  it('el despachador esparce business_payload primero y los campos _sala_* después (no pisa dry_run)', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/sala-journey-dispatch/workflow-dispatcher.ts'), 'utf8')
    expect(src).toMatch(/const body = \{\s*\.\.\.\(business && typeof business === 'object'/)
    expect(src).not.toMatch(/dry_run/) // el despachador no lo toca ni lo filtra
  })
  it('el cuerpo que recibió planeación en E107 = payload + campos de la sala · sin dry_run · con dry_run:false sería «real»', () => {
    const recibido = { pedido: 'plan de 90 dias', client_id: 'c', journey_id: 'j', desde_worker: 'LyVoKcrypS5uLyuu', _sala_correlation_id: 'x', _journey_id: 'j2', tenant_id: 't', trigger_source: 'sala-router-dispatch', target_step_id: 'router.dispatch.alta/journey-completed.planear' }
    expect((recibido as any).dry_run).toBeUndefined()
    const conArreglo: Record<string, unknown> = { ...sobre(ALTA_HOY).payload, _sala_correlation_id: 'x', trigger_source: 'sala-router-dispatch' }
    expect(conArreglo.dry_run).toBe(false)
  })
})
