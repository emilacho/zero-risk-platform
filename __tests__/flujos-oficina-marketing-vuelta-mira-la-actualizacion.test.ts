/**
 * 06-nov · DALE (a) de Emilio · la vuelta recogida del punto de control mira la ACTUALIZACIÓN (caso real: corrida r4 de Náufrago, ejecución 220399).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirGoDobleChequeo } from '../scripts/ops/oficina-marketing/plan-go-doble-chequeo.mjs'
import { construirVueltaMiraLaActualizacion, construirTurnoMiraLaActualizacion } from '../scripts/ops/oficina-marketing/vuelta-mira-la-actualizacion.mjs'
import { CODIGO_COMPLETAR_VUELTA } from '../scripts/ops/oficina-marketing/recoger-del-punto-de-control.mjs'
import { CODIGO_COMPLETAR_VUELTA_DEL_TURNO, construirTurnoQueRecoge } from '../scripts/ops/oficina-marketing/jefatura-turno-recoger.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const leer = (n: string) => { const j = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing', n), 'utf8')); return (j.workflow || j) as Flujo }
const PLAN_VIVO = (() => { const f = structuredClone(leer('aplicado/X9F0zp6LQ2xGEYVS-go-doble-chequeo-ANTES-2026-11-05.json')); construirGoDobleChequeo(f); return f })()
const TURNO_VIVO = leer('aplicado/o8qaF7bI0PKv2XGZ-trabajo-por-llamada.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const sel = (mapa: Record<string, any>) => (n: string) => {
  if (!(n in mapa)) throw new Error('no corrió: ' + n)
  return { first: () => ({ json: mapa[n] }), last: () => ({ json: mapa[n] }), all: () => [{ json: mapa[n] }] }
}
const correr = (c: string, mapa: Record<string, any>, input: unknown) => new Function('$', '$input', c)(sel(mapa), { first: () => ({ json: input }) })[0].json

// la fila real de la corrida r4: creada el 03-nov por otra corrida, reescrita con el plan nuevo el 05-nov a las 23:35:23
const ACK = '2026-11-05T23:09:47.600Z'
const TEXTO = '# Plan de 90 días · Náufrago\n**5 de noviembre de 2026 – 27 de enero de 2027**'
const FILA_R4 = { step_status: 'completed', created_at: '2026-11-03T13:04:29.345Z', updated_at: '2026-11-05T23:35:23.381Z', texto: TEXTO, truncado: 'false' }
const leida = (fila: unknown) => ({ statusCode: 200, body: [fila] })
const SIN_CABLE = { body: {} }

const plan = (fila: unknown, codigo: string) => correr(codigo, {
  'Esperar al redactor': SIN_CABLE,
  'Webhook · planeacion': { body: { dry_run: false } },
  'Pedir el plan al redactor': { ack_timestamp: ACK },
  'Redactor · preparar el pedido': { pedido_en: ACK },
}, leida(fila))
const turno = (fila: unknown, codigo: string) => correr(codigo, {
  '② Esperar al agente': SIN_CABLE,
  '② Agente (run-sdk)': { body: { ack_timestamp: ACK } },
}, leida(fila))

const arreglado = () => { const f = structuredClone(PLAN_VIVO); construirVueltaMiraLaActualizacion(f); return f }
const turnoArreglado = () => { const f = structuredClone(TURNO_VIVO); construirTurnoMiraLaActualizacion(f); return f }
const codigoPlan = (f: Flujo) => nodo(f, 'Vuelta · completar').parameters.jsCode as string
const codigoTurno = (f: Flujo) => nodo(f, '② Vuelta · completar').parameters.jsCode as string

describe('planeación · la vuelta del redactor', () => {
  it('reproduce el fallo: el flujo vivo descarta el plan de la r4', () => {
    expect(plan(FILA_R4, codigoPlan(PLAN_VIVO))).toEqual(SIN_CABLE)
  })
  it('arreglado: recoge el plan de la r4 tal cual', () => {
    expect(plan(FILA_R4, codigoPlan(arreglado()))).toEqual({ body: { response: TEXTO, recuperada_del_punto_de_control: true } })
  })
  it('una fila reescrita ANTES de este pedido sigue sin recogerse (es de otro pedido)', () => {
    expect(plan({ ...FILA_R4, updated_at: '2026-11-05T23:09:30.000Z' }, codigoPlan(arreglado()))).toEqual(SIN_CABLE)
  })
  it('sin actualización en la fila, decide la creación (nunca más laxo)', () => {
    const { updated_at: _u, ...sinAct } = FILA_R4
    expect(plan(sinAct, codigoPlan(arreglado()))).toEqual(SIN_CABLE)
    expect(plan({ ...sinAct, created_at: '2026-11-05T23:30:00.000Z' }, codigoPlan(arreglado()))).toMatchObject({ body: { recuperada_del_punto_de_control: true } })
  })
  it('lo demás no cambia: en curso, truncado o vacío no se recogen', () => {
    const c = codigoPlan(arreglado())
    expect(plan({ ...FILA_R4, step_status: 'in_progress' }, c)).toEqual(SIN_CABLE)
    expect(plan({ ...FILA_R4, truncado: 'true' }, c)).toEqual(SIN_CABLE)
    expect(plan({ ...FILA_R4, texto: '  ' }, c)).toEqual(SIN_CABLE)
  })
  it('la lectura trae la actualización y ordena por ella', () => {
    const url = nodo(arreglado(), 'Vuelta · leer el punto de control').parameters.url as string
    expect(url).toContain('select=step_status,created_at,updated_at,')
    expect(url).toContain('order=updated_at.desc')
    expect(url).not.toContain('order=created_at')
  })
  it('cambia solo esos 2 nodos y es idempotente', () => {
    const f = structuredClone(PLAN_VIVO)
    expect(construirVueltaMiraLaActualizacion(f)).toBe(2)
    const antes = JSON.stringify(f)
    expect(construirVueltaMiraLaActualizacion(f)).toBe(0)
    expect(JSON.stringify(f)).toBe(antes)
    const otros = (x: Flujo) => JSON.stringify(x.nodes.filter((n) => !n.name.startsWith('Vuelta · leer') && n.name !== 'Vuelta · completar'))
    expect(otros(f)).toBe(otros(PLAN_VIVO))
    expect(JSON.stringify(f.connections)).toBe(JSON.stringify(PLAN_VIVO.connections))
  })
  it('el constructor original ya sale corregido (una reconstrucción no trae el fallo de vuelta)', () => {
    expect(CODIGO_COMPLETAR_VUELTA).toContain('f.updated_at || f.created_at')
    expect(plan(FILA_R4, CODIGO_COMPLETAR_VUELTA)).toMatchObject({ body: { recuperada_del_punto_de_control: true } })
  })
})

describe('jefatura · la vuelta del turno (mismo mecanismo)', () => {
  it('reproduce el fallo en el flujo vivo y lo arregla', () => {
    expect(turno(FILA_R4, codigoTurno(TURNO_VIVO))).toEqual(SIN_CABLE)
    expect(turno(FILA_R4, codigoTurno(turnoArreglado()))).toEqual({ body: { response: TEXTO, recuperada_del_punto_de_control: true } })
    expect(turno({ ...FILA_R4, updated_at: '2026-11-05T23:09:30.000Z' }, codigoTurno(turnoArreglado()))).toEqual(SIN_CABLE)
  })
  it('la lectura del turno trae la actualización, y el arreglo es idempotente', () => {
    const f = structuredClone(TURNO_VIVO)
    expect(construirTurnoMiraLaActualizacion(f)).toBe(2)
    expect(construirTurnoMiraLaActualizacion(f)).toBe(0)
    expect(nodo(f, '② Vuelta · leer el punto de control').parameters.url).toContain('order=updated_at.desc')
  })
  it('el constructor original del turno ya sale corregido', () => {
    expect(turno(FILA_R4, CODIGO_COMPLETAR_VUELTA_DEL_TURNO)).toMatchObject({ body: { recuperada_del_punto_de_control: true } })
  })
  it('06-nov · menor 1 de CC7: el constructor del turno, reconstruido desde su base, PIDE la actualización y ordena por ella (si dejara de pedirla, el corte caería en silencio a la creación)', () => {
    const f = leer('vivo/o8qaF7bI0PKv2XGZ.json')
    construirTurnoQueRecoge(f)
    const url = nodo(f, '② Vuelta · leer el punto de control').parameters.url as string
    expect(url).toContain('select=step_status,created_at,updated_at,')
    expect(url).toContain('order=updated_at.desc&limit=1')
    expect(codigoTurno(f)).toBe(CODIGO_COMPLETAR_VUELTA_DEL_TURNO)
    // lo que la lectura trae es lo que el corte usa: sin `updated_at` en la fila, la r4 se habría descartado
    const { updated_at: _u, ...sinAct } = FILA_R4
    expect(turno(sinAct, codigoTurno(f))).toEqual(SIN_CABLE)
    expect(turno(FILA_R4, codigoTurno(f))).toMatchObject({ body: { recuperada_del_punto_de_control: true } })
  })
})
