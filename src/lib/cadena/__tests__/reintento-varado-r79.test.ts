/**
 * r79 · D1 · una corrida `ok` sin el objeto validado NO es «ya hecha»: si la llamada se cayó entre cerrar la corrida y guardar el resultado, el reintento abre el siguiente intento.
 * Contra el almacén en memoria: US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar } from '../index'
import { calendarioPreparar, calendarioGuardar } from '../pasos'
import { prepararCorrida } from '../nucleo'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const almacen = () => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
const ok = (x: unknown) => ({ success: true, structured_output: x, cost_usd: 0.3 })
const abrir = async (al: AlmacenMemoria) => ((await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)).cuerpo.campana as { id: string }).id

describe('D1 · reintento varado', () => {
  it('estrategia: la llamada cerró `ok` pero se cayó antes de guardar → el reintento NO contesta ya_hecha: abre el intento 2 y avanza', async () => {
    const al = almacen(); const id = await abrir(al)
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await al.cerrarCorrida(p1.cuerpo.corrida_id as number, { estado: 'ok', costo_usd: 0.3 }) // caída: ok sin estrategia
    expect(await al.ultimaEstrategia(id)).toBeFalsy()
    const p2 = await estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'ex-2' }), campana_id: id }, AHORA)
    expect(p2.status).toBe(200)
    expect(p2.cuerpo.ya_hecha).toBeUndefined()
    expect(p2.cuerpo.intento).toBe(2)
    const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p2.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    expect(g.cuerpo.ok).toBe(true)
    // y ahora SÍ es ya_hecha (hay estrategia validada)
    expect((await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo.ya_hecha).toBe(true)
  })
  it('el tope de 3 intentos sigue contando las corridas `ok` huecas (no hay bucle infinito)', async () => {
    const al = almacen(); const id = await abrir(al)
    for (let n = 1; n <= 3; n++) {
      const p = await estrategiaPreparar(al, { ...wf({ workflow_execution_id: `ex-${n}` }), campana_id: id }, AHORA)
      expect(p.cuerpo.intento).toBe(n)
      await al.cerrarCorrida(p.cuerpo.corrida_id as number, { estado: 'ok' })
    }
    const cuarta = await estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'ex-4' }), campana_id: id }, AHORA)
    expect(cuarta.cuerpo.error).toBe('intentos_agotados')
  })
  it('calendario: tanda con `ok` sin filas guardadas → el reintento avanza; con filas guardadas → ya_hecha', async () => {
    const al = almacen(); const id = await abrir(al)
    const pe = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    const c1 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await al.cerrarCorrida(c1.cuerpo.corrida_id as number, { estado: 'ok' })
    const c2 = await calendarioPreparar(al, { ...wf({ workflow_execution_id: 'ex-2' }), campana_id: id, tanda: 1 }, AHORA)
    expect(c2.cuerpo.ya_hecha).toBeUndefined()
    expect(c2.cuerpo.intento).toBe(2)
    await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: c2.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)).cuerpo.ya_hecha).toBe(true)
  })
  it('la carrera: sin función de existencia (fechas) la corrida `ok` sigue valiendo ya_hecha', async () => {
    const al = almacen(); const id = await abrir(al)
    const c = al.campanas.find((x) => x.id === id)!
    const l = await prepararCorrida(al, c, 'estrategia', 'k', 'wf-cadena', 'ex-1', AHORA, 'm', 'h')
    if (l.tipo === 'lista') await al.cerrarCorrida(l.corrida.id, { estado: 'ok' })
    expect((await prepararCorrida(al, c, 'estrategia', 'k', 'wf-cadena', 'ex-2', AHORA, 'm', 'h')).tipo).toBe('ya_hecha')
    expect((await prepararCorrida(al, c, 'estrategia', 'k', 'wf-cadena', 'ex-3', AHORA, 'm', 'h', async () => false)).tipo).toBe('lista')
  })
})
