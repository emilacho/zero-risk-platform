/**
 * Tests · el vigía del silencio · un aviso que no llega NO es «avisé».
 *
 * 🔴 EL ROJO · E66 · CC#3 · 2026-09-16 · flujo 0WRWM0cChdiAxfTY · versionId 3737c18d:
 *   `AVISO · #alertas` tiene onError: continueRegularOutput + alwaysOutputData y nadie
 *   mira `ok` ⇒ Slack `ok:false`, 4xx, 5xx o tiempo agotado terminan la corrida en VERDE.
 *
 * NO toca producción · retrato congelado · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

type Nodo = { name: string; type: string; onError?: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }

const DIR = join(process.cwd(), 'scripts/worker-staging/0WRWM0cChdiAxfTY')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Flujo
const VIVO = leer('vigia-VIVO-2026-09-16.json')
const HOY = leer('vigia-construido.json')

const DECIDE = '[SALA] Vigía · decide'
const AVISO = 'AVISO · #alertas'
const CIERRE = 'Cierre · el aviso llegó o la corrida falla'

const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta el nodo ${n}`)
  return x
}

const VEREDICTO = { estado: 'NO_SE_PUDO_SABER', titulo: 'NO SE PUDO SABER SI LA SALA ESTA VIVA', grita: true }

/** corre el cierre con la salida del aviso tal como la entrega n8n */
function cerrar(salidaDelAviso: unknown[]) {
  const $input = { all: () => salidaDelAviso.map((json) => ({ json })) }
  const $ = (n: string) => {
    if (n !== DECIDE) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: VEREDICTO }) }
  }
  return new Function('$input', '$', nodo(HOY, CIERRE).parameters.jsCode)($input, $) as Array<{ json: any }>
}

describe('el rojo · la versión viva no tiene a nadie después del aviso', () => {
  it('el aviso sigue ante cualquier fallo y no tiene salida conectada', () => {
    expect(nodo(VIVO, AVISO).onError).toBe('continueRegularOutput')
    expect(VIVO.connections[AVISO]).toBeUndefined()
  })
})

describe('① ② los cuatro fallos de aviso terminan la corrida en error', () => {
  const casos: Array<[string, unknown[]]> = [
    ['Slack 200 con ok:false (canal)', [{ ok: false, error: 'channel_not_found' }]],
    ['Slack 200 con ok:false (token)', [{ ok: false, error: 'invalid_auth' }]],
    ['4xx · continueRegularOutput', [{ error: { message: '403 - "Forbidden"', name: 'NodeApiError' } }]],
    ['5xx · continueRegularOutput', [{ error: { message: '503 - "<html>…"' } }]],
    ['tiempo agotado', [{ error: 'timeout of 30000ms exceeded' }]],
    ['alwaysOutputData · item vacío', [{}]],
    ['ninguna respuesta', []],
    ['respuesta html sin ok', [{ data: '<html>' }]],
  ]
  for (const [nombre, salida] of casos) {
    it(nombre, () => expect(() => cerrar(salida)).toThrow(/el aviso NO llego a #alertas/))
  }

  it('nombra la causa y el veredicto que no llegó', () => {
    expect(() => cerrar([{ ok: false, error: 'channel_not_found' }])).toThrow(/channel_not_found.*NO_SE_PUDO_SABER/)
  })

  it('Slack confirmó · verde y deja el ts', () => {
    const [r] = cerrar([{ ok: true, channel: 'C0B7XUUEBHA', ts: '1789591560.048889' }])
    expect(r.json).toMatchObject({ estado: 'NO_SE_PUDO_SABER', aviso_ts: '1789591560.048889' })
  })
})

describe('③ no se toca lo que ya estaba bien', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

  it('el decisor es el mismo hash certificado (77f260e230b7c1e7)', () => {
    expect(sha(nodo(HOY, DECIDE).parameters.jsCode)).toBe('77f260e230b7c1e7')
    expect(sha(nodo(VIVO, DECIDE).parameters.jsCode)).toBe('77f260e230b7c1e7')
  })

  it('los 9 nodos vivos quedan idénticos · sólo se agrega el cierre', () => {
    expect(HOY.nodes.slice(0, VIVO.nodes.length)).toEqual(VIVO.nodes)
    expect(HOY.nodes.map((n) => n.name)).toEqual([...VIVO.nodes.map((n) => n.name), CIERRE])
  })

  it('las conexiones vivas quedan idénticas · sólo se agrega aviso → cierre', () => {
    const { [AVISO]: nueva, ...resto } = HOY.connections
    expect(resto).toEqual(VIVO.connections)
    expect(nueva.main[0][0].node).toBe(CIERRE)
  })
})
