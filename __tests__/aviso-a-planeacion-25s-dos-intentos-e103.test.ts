/**
 * 🔴 E103 · EL ÚLTIMO CRISTAL · el aviso a `planeación`: 25 s y dos intentos · y SIGUE DECIDIENDO.
 *
 * Por qué: la tercera bolita murió a los 6 min (US$ 0,46) en una NOTA con 5 s de tope, mientras la
 * puerta tardaba 6 s. E101 blindó las notas, pero **este nodo no es una nota: DECIDE** (sin pedido de
 * planeación el recorrido queda trunco), así que quedó con **15 s y un solo intento**. Es el salto que
 * la cuarta bolita tiene que cruzar (alta → sala → `planeación`).
 *
 * CC#2 lo dejó declarado certificando E101: subirlo a 25 s con dos intentos es seguro **porque la llave
 * anti-repetidos lo protege**. Esta prueba lo fija: el reintento NO genera un segundo despacho.
 *
 * NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIdempotencyKey } from '@/lib/sala-event-log'
import { mintStreamId } from '@/lib/sala-ingress/stream-id'

type Nodo = {
  name: string
  parameters: Record<string, any>
  onError?: string
  retryOnFail?: boolean
  maxTries?: number
  waitBetweenTries?: number
}
type Flujo = { nodes: Nodo[]; connections: Record<string, { main?: Array<Array<{ node: string }>> }>; settings?: unknown }

const DIR = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Flujo
const ANTES = leer('alta-antes-e103-2ebb4d47.json')
const HOY = leer('alta-construida-e103.json')

const SOBRE = 'E57 · sobre · pedir planeación a la sala'
const GUARDA = 'GUARDA · si la puerta rechazó el pedido de planeación'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}

describe('🔴 el rojo · lo publicado antes: 15 s y un solo intento', () => {
  it('el aviso a planeación era el último cristal de la cadena', () => {
    const n = nodo(ANTES, SOBRE)
    expect(n.parameters.options.timeout).toBe(15000)
    expect(n.retryOnFail).toBeUndefined()
    expect(n.maxTries).toBeUndefined()
  })
})

describe('① 25 s y dos intentos', () => {
  const n = nodo(HOY, SOBRE)
  it('tope 25 s · el mismo que E101 · por encima de lo que la puerta tarda reconciliando (~6 s)', () => {
    expect(n.parameters.options.timeout).toBe(25000)
  })
  it('dos intentos, con espera entre ellos', () => {
    expect(n.retryOnFail).toBe(true)
    expect(n.maxTries).toBe(2)
    expect(n.waitBetweenTries).toBe(3000)
  })
})

describe('② 🔴 SIGUE DECIDIENDO · si los dos intentos fallan, la corrida PARA', () => {
  it('no tiene «continuar en error» (a diferencia de las notas de E101)', () => {
    expect(nodo(HOY, SOBRE).onError).toBeUndefined()
  })
  it('las notas de E101 sí lo tienen · la diferencia sigue siendo visible en el flujo', () => {
    const nota = nodo(HOY, '[MODELB] Phase-boundary Emit · cliente_persisted')
    expect(nota.onError).toBe('continueErrorOutput')
    expect(nota.parameters.options.timeout).toBe(25000)
  })
  it('la GUARDA sigue siendo su única salida · un rechazo de la puerta sigue parando', () => {
    expect(HOY.connections[SOBRE]?.main?.[0]?.map((x) => x.node)).toEqual([GUARDA])
    const g = String(nodo(HOY, GUARDA).parameters.jsCode)
    expect(g).toMatch(/throw/)
    expect(g).toMatch(/ok\s*!==\s*true/)
  })
})

describe('③ el segundo intento NO genera un segundo despacho', () => {
  /** el sobre EXACTAMENTE como lo arma el nodo (llave + periodo fijos por recorrido · E73) */
  const JOURNEY = 'sala/v1/peniche/e388a370/onboard/2026-W38/e103'
  const CLIENT = 'e388a370-910f-4ee7-9a48-4a79393b8cb4'
  const sobre = () => ({
    source: 'alta/journey-completed',
    intent: 'planear',
    idempotency_key: `${JOURNEY}:planear`,
    logical_period: `alta:${JOURNEY}`,
    tenant_id: CLIENT,
    client_id: CLIENT,
  })
  const clave = (s: ReturnType<typeof sobre>) =>
    buildIdempotencyKey({
      operation_type: `PRODUCE.intake.${s.source}.${s.intent}`,
      client_id: s.client_id,
      logical_period: s.logical_period,
      idempotency_key: s.idempotency_key,
    } as Parameters<typeof buildIdempotencyKey>[0])
  const hilo = (s: ReturnType<typeof sobre>) =>
    mintStreamId({
      source: s.source,
      intent: s.intent,
      idempotency_key: s.idempotency_key,
      tenant_id: s.tenant_id,
      client_id: s.client_id,
      logical_period: s.logical_period,
    } as Parameters<typeof mintStreamId>[0])

  it('intento 1 e intento 2 del MISMO envío ⇒ misma clave y mismo hilo ⇒ la puerta lo ve duplicado', () => {
    const uno = sobre()
    const dos = sobre() // el reintento arma el mismo cuerpo: todo sale de «Validate Deal Data»
    expect(clave(dos)).toBe(clave(uno))
    expect(hilo(dos)).toBe(hilo(uno))
  })

  it('y sigue valiendo aunque el reintento caiga en otro día (la lección de E72/E73)', () => {
    const uno = sobre()
    const otroDia = { ...sobre() } // logical_period NO lleva fecha: va por recorrido
    expect(clave(otroDia)).toBe(clave(uno))
    expect(String(uno.logical_period)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('otro recorrido del mismo cliente SÍ es un pedido nuevo (no bloquea lo legítimo)', () => {
    const uno = sobre()
    const otro = { ...sobre(), idempotency_key: 'otro-recorrido:planear', logical_period: 'alta:otro-recorrido' }
    expect(clave(otro)).not.toBe(clave(uno))
  })
})

describe('④ cambia SÓLO ese nodo', () => {
  it('el resto del alta queda byte a byte igual · mismas conexiones y ajustes', () => {
    const distintos = ANTES.nodes
      .filter((n) => JSON.stringify(n) !== JSON.stringify(HOY.nodes.find((m) => m.name === n.name)))
      .map((n) => n.name)
    expect(distintos).toEqual([SOBRE])
    expect(HOY.nodes.length).toBe(ANTES.nodes.length)
    expect(HOY.connections).toEqual(ANTES.connections)
    expect(HOY.settings).toEqual(ANTES.settings)
  })
})
