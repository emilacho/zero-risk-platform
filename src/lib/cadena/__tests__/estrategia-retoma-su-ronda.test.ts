/**
 * RETOMAR DONDE SE CAYÓ · entrega 2b: la corrección de la estrategia · GO Lenovo 24-nov 11:16Z (decisión de Emilio).
 * El subflujo de n8n lleva las fichas de la ronda en su memoria; si se cae, se pausa o se relanza, vuelve a llamar a `preparar` SIN `correccion`.
 * Antes eso era la primera pasada `v1:c0` otra vez (23-nov: ≈ US$ 5 de más). Ahora la corrección en curso se retoma de la BASE (las rondas guardadas).
 * Cliente sintético, almacén en memoria, US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar } from '../index'
import { fichasDeLaCorreccionEnCurso } from '../pasos'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const ABRE = '2026-10-12T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (estrategia: unknown, costo = 0.3) => ({ success: true, structured_output: estrategia, cost_usd: costo })
const mala = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 9999 })) }

function almacen() {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
async function abierta(al: AlmacenMemoria) {
  const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
  return (r.cuerpo.campana as { id: string }).id
}
const clave = (al: AlmacenMemoria, p: { cuerpo: Record<string, unknown> }) => al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia
const tarea = (p: { cuerpo: Record<string, unknown> }) => (p.cuerpo.run_sdk as { task: string }).task
/** la primera pasada sale bloqueada: queda la ronda 0 guardada con sus fichas y `guardar` pide la ronda 1 */
async function conLaPrimeraBloqueada(al: AlmacenMemoria) {
  const id = await abierta(al)
  const p0 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g0 = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p0.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
  expect(g0.cuerpo).toMatchObject({ correccion: true, ronda: 1 })
  return { id, g0 }
}

describe('la corrección de la estrategia se retoma de la base, no de la memoria del subflujo', () => {
  it('🔴 tras la ronda 0 bloqueada, un `preparar` SIN `correccion` (el subflujo se cayó) sigue con la ronda 1 y las fichas guardadas · no repite `v1:c0`', async () => {
    const al = almacen()
    const { id, g0 } = await conLaPrimeraBloqueada(al)
    const corridasAntes = al.corridas.length
    const p = await estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'ex-relanzado' }), campana_id: id }, AHORA)
    expect(p.status).toBe(200)
    expect(clave(al, p)).toBe('v1:c1')
    expect(tarea(p)).toContain('CORRECCIÓN')
    expect(p.cuerpo.retoma_la_correccion).toEqual({ ronda: 1 })
    expect(al.corridas.length).toBe(corridasAntes + 1)
    expect(al.corridas.filter((c) => c.clave_idempotencia === 'v1:c0')).toHaveLength(1)
    // las fichas son las MISMAS que habría mandado el subflujo
    const conFichas = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g0.cuerpo.fichas } }, AHORA)
    expect(conFichas.status).toBe(409) // la corrida v1:c1 ya está en curso: el MISMO paso
  })
  it('control: lo de siempre · el subflujo que manda sus fichas recibe la misma ronda (sin la marca de retomada)', async () => {
    const al = almacen()
    const { id, g0 } = await conLaPrimeraBloqueada(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g0.cuerpo.fichas } }, AHORA)
    expect(clave(al, p)).toBe('v1:c1')
    expect(tarea(p)).toContain('CORRECCIÓN')
    expect(p.cuerpo.retoma_la_correccion).toBeUndefined()
  })
  it('control: una campaña sin rondas guardadas hace la primera pasada de siempre (`v1:c0`, sin corrección)', async () => {
    const al = almacen()
    const id = await abierta(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(clave(al, p)).toBe('v1:c0')
    expect(tarea(p)).not.toContain('CORRECCIÓN')
    expect(p.cuerpo.retoma_la_correccion).toBeUndefined()
  })
  it('se retoma desde la ÚLTIMA ronda guardada: tras la ronda 1, un relanzamiento pide la ronda 2 con las fichas de la 1, y la corrección termina igual que sin caídas', async () => {
    const al = almacen()
    const { id } = await conLaPrimeraBloqueada(al)
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const g1 = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p1.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
    expect(g1.cuerpo).toMatchObject({ correccion: true, ronda: 2 })
    const fichasDeLa1 = al.rondasDeLaEstrategia.find((r) => r.ronda === 1)!.fichas
    expect(await fichasDeLaCorreccionEnCurso(al, id, 1)).toEqual(fichasDeLa1)
    const p2 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(clave(al, p2)).toBe('v1:c2')
    expect(p2.cuerpo.retoma_la_correccion).toEqual({ ronda: 2 })
    const g2 = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p2.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    expect(g2.cuerpo.ok).toBe(true)
    expect(al.estrategias.map((e) => [e.version, e.estado])).toEqual([[1, 'validada']])
    expect(al.corridas.map((c) => c.clave_idempotencia)).toEqual(['v1:c0', 'v1:c1', 'v1:c2'])
    // ya validada: otro relanzamiento no gasta nada
    expect((await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo).toMatchObject({ ya_hecha: true })
  })
  it('fichasDeLaCorreccionEnCurso: solo de ESA versión y de la última ronda; sin rondas o sin fichas = null', async () => {
    const al = almacen()
    const f = (que: string) => ({ que, donde: 'tanda', contra_que: 'x', gravedad: 'bloquea', propuesta: 'x' }) as never
    expect(await fichasDeLaCorreccionEnCurso(al, 'c', 1)).toBeNull()
    await al.guardarRondaDeEstrategia({ campana_id: 'c', version: 1, ronda: 1, contenido: A.estrategia, bloqueos: 1, fichas: [f('de la 1')], seco: true })
    await al.guardarRondaDeEstrategia({ campana_id: 'c', version: 1, ronda: 0, contenido: A.estrategia, bloqueos: 2, fichas: [f('de la 0')], seco: true })
    await al.guardarRondaDeEstrategia({ campana_id: 'c', version: 2, ronda: 2, contenido: A.estrategia, bloqueos: 1, fichas: [f('otra versión')], seco: true })
    expect((await fichasDeLaCorreccionEnCurso(al, 'c', 1))!.map((x) => (x as { que: string }).que)).toEqual(['de la 1'])
    expect((await fichasDeLaCorreccionEnCurso(al, 'c', 3))).toBeNull()
    await al.guardarRondaDeEstrategia({ campana_id: 'd', version: 1, ronda: 0, contenido: A.estrategia, bloqueos: 0, fichas: [], seco: true })
    expect(await fichasDeLaCorreccionEnCurso(al, 'd', 1)).toBeNull()
  })
})

