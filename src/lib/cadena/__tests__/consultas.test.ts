/**
 * Las lecturas que la puerta y el vigía hacen a la cadena: modo efectivo, viaje de la sala, campañas activas, tanda siguiente, tipos de fechas que pidió la estrategia.
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, campanasActivas, estadoDeLaCadena, verificarViaje, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, calendarioSiguiente } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'e1', ...extra })
const almacen = (config: Record<string, unknown> = {}) => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena'], ...config }, journeys: [{ journeyId: 'j1', clientId: A.clientId }],
})

describe('modo efectivo de la puerta', () => {
  it('apagada → pasarela; ensayo → pasarela salvo cliente de la lista; encendida → cadena (no depende del seco del pedido)', async () => {
    const q = (al: AlmacenMemoria, extra = {}) => estadoDeLaCadena(al, { ...wf(), client_id: A.clientId, ...extra })
    expect((await q(almacen())).cuerpo).toMatchObject({ modo: 'pasarela', admitido: false, estado_cadena: 'apagada' })
    expect((await q(almacen(), { seco: true })).cuerpo.modo).toBe('pasarela')
    expect((await q(almacen({ estado_cadena: 'ensayo' }))).cuerpo.modo).toBe('pasarela')
    expect((await q(almacen({ estado_cadena: 'ensayo', clientes_ensayo: [A.clientId] }))).cuerpo.modo).toBe('cadena')
    expect((await q(almacen({ estado_cadena: 'encendida' }))).cuerpo.modo).toBe('cadena')
  })
  it('sin workflow ids: 400', async () => {
    expect((await estadoDeLaCadena(almacen(), { client_id: A.clientId })).status).toBe(400)
  })
})

describe('el viaje de la sala', () => {
  it('existe para ESE cliente o no existe (la sala no firma el cuerpo)', async () => {
    const al = almacen()
    expect((await verificarViaje(al, { ...wf(), client_id: A.clientId, journey_id: 'j1' })).cuerpo.existe).toBe(true)
    expect((await verificarViaje(al, { ...wf(), client_id: A.clientId, journey_id: 'j-falso' })).cuerpo.existe).toBe(false)
    expect((await verificarViaje(al, { ...wf(), client_id: 'otro', journey_id: 'j1' })).cuerpo.existe).toBe(false)
    expect((await verificarViaje(al, { ...wf(), client_id: A.clientId })).status).toBe(400)
  })
})

describe('campañas activas para el vigía', () => {
  async function conActiva(config: Record<string, unknown>, seco: boolean) {
    const al = almacen({ estado_cadena: 'encendida', ...config })
    await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    al.campanas[0].seco = seco
    al.campanas[0].estado = 'activa'
    return al
  }
  it('solo un flujo de la cadena lo llama', async () => {
    expect((await campanasActivas(almacen(), { workflow_id: 'ajeno', workflow_execution_id: '1' })).status).toBe(403)
  })
  it('encendida: las activas; apagada: solo las de ensayo en seco; ensayo: las de la lista', async () => {
    const q = (al: AlmacenMemoria) => campanasActivas(al, { workflow_id: 'wf-cadena', workflow_execution_id: '1' }).then((r) => (r.cuerpo.campanas as unknown[]).length)
    expect(await q(await conActiva({}, false))).toBe(1)
    expect(await q(await conActiva({ estado_cadena: 'apagada' }, false))).toBe(0)
    expect(await q(await conActiva({ estado_cadena: 'apagada' }, true))).toBe(1)
    expect(await q(await conActiva({ estado_cadena: 'ensayo', clientes_ensayo: [A.clientId] }, false))).toBe(1)
    expect(await q(await conActiva({ estado_cadena: 'ensayo', clientes_ensayo: [] }, false))).toBe(0)
  })
})

describe('estrategia: los tipos de fechas que pidió (la lista vacía es lo normal)', () => {
  it('guardar devuelve fechas_pedidas por tipo y año de la campaña; vacía si el cliente no declaró', async () => {
    for (const [declara, esperado] of [[true, 2], [false, 0]] as const) {
      const al = almacen()
      const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
      const id = (c.cuerpo.campana as { id: string }).id
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
      const e = { ...A.estrategia, fechas_que_importan: declara ? A.estrategia.fechas_que_importan : [] }
      const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: e } }, AHORA)
      expect(g.cuerpo.ok).toBe(true)
      expect((g.cuerpo.fechas_pedidas as unknown[]).length).toBe(esperado) // 2026 y 2027
    }
  })
})

describe('calendario rodante: ¿toca otra tanda?', () => {
  async function activa() {
    const al = almacen({ estado_cadena: 'encendida' })
    const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: A.estrategia } }, AHORA)
    const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: { success: true, structured_output: tandaBuena(A) } }, AHORA)
    return { al, id }
  }
  it('lejos del final de la tanda no; a ≤ 14 días del final sí (tanda 2); la tanda 1 termina el 8 nov', async () => {
    const { al, id } = await activa()
    const lejos = await calendarioSiguiente(al, { ...wf(), campana_id: id, hoy: '2026-10-12' }, AHORA)
    expect(lejos.cuerpo.tanda).toBeNull()
    expect(String(lejos.cuerpo.motivo)).toMatch(/faltan 27 días/)
    const cerca = await calendarioSiguiente(al, { ...wf(), campana_id: id, hoy: '2026-10-25' }, AHORA)
    expect(cerca.cuerpo).toMatchObject({ tanda: 2, faltan_dias: 14 })
  })
  it('una campaña que no está activa o sin primera tanda no pide nada', async () => {
    const al = almacen()
    const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    expect((await calendarioSiguiente(al, { ...wf(), campana_id: id }, AHORA)).cuerpo.tanda).toBeNull()
    al.campanas[0].estado = 'activa'
    expect(String((await calendarioSiguiente(al, { ...wf(), campana_id: id }, AHORA)).cuerpo.motivo)).toMatch(/primera tanda/)
  })
})
