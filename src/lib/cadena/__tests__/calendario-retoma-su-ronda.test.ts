/**
 * RETOMAR DONDE SE CAYÓ · el calendario · GO Lenovo 24-nov 11:51Z (decisión de Emilio: «por cualquier razón», sin repetir lo pagado).
 * El subflujo de n8n lleva la corrección de la tanda en su memoria. Si se cae y se relanza, llama a `preparar` SIN `correccion` y a `guardar` con
 * `correccion: false` y `modo: 'tanda'` por defecto. La ronda ya se retomaba de la base (r74), pero SIEMPRE como tanda entera: se volvía a pagar
 * lo que ya había pasado y las filas buenas podían cambiar. Ahora el modo se reconstruye de la base (los bloqueos del último guardado).
 * Cliente sintético, almacén en memoria, US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar } from '../index'
import { correccionPendienteDelCalendario } from '../pasos'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'
import type { Hallazgo } from '../tipos'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const ABRE = '2026-10-12T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (objeto: unknown, costo = 0.3) => ({ success: true, structured_output: objeto, cost_usd: costo })

function almacen() {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
async function conEstrategia(al: AlmacenMemoria) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
  return id
}
const conFormatoMalo = () => ({ ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, formato: 'formato-inexistente' } : p)) })
const tarea = (p: { cuerpo: Record<string, unknown> }) => (p.cuerpo.run_sdk as { task: string }).task
const clave = (al: AlmacenMemoria, p: { cuerpo: Record<string, unknown> }) => al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia
const delaTanda = (al: AlmacenMemoria) => al.filasGuardadas.filter((f) => f.tanda === 1 && f.estado !== 'esquema')
const fila4b = (al: AlmacenMemoria) => delaTanda(al).find((f) => f.semana === 4 && f.id.endsWith('-b'))!

/** la primera pasada sale con UNA fila mala (4b): queda guardada `propuesta` y `guardar` pide la corrección de esa fila */
async function conUnaFilaMala(al: AlmacenMemoria) {
  const id = await conEstrategia(al)
  const p0 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
  const g0 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p0.cuerpo.corrida_id, resultado: ok(conFormatoMalo()) }, AHORA)
  expect(g0.cuerpo).toMatchObject({ correccion: true, modo: 'filas', fila_ids: [fila4b(al).id] })
  return id
}

describe('el calendario retoma la corrección de la tanda con el modo que tocaba', () => {
  it('🔴 relanzado SIN `correccion`: sigue con la ronda 1, pide SOLO la fila que falló (no la tanda entera) y lo marca', async () => {
    const al = almacen()
    const id = await conUnaFilaMala(al)
    const p = await calendarioPreparar(al, { ...wf({ workflow_execution_id: 'ex-relanzado' }), campana_id: id, tanda: 1 }, AHORA)
    expect(p.status).toBe(200)
    expect(clave(al, p)).toBe('t1:v1:c1')
    expect(p.cuerpo.retoma_la_correccion).toEqual({ ronda: 1, modo: 'filas' })
    expect(tarea(p)).toContain('Devuelve SOLO las piezas que fallaron')
    expect(tarea(p)).not.toContain('vuelve a entregarla ENTERA')
    expect(tarea(p)).toContain(fila4b(al).id)
  })
  it('🔴 y `guardar` como lo manda el subflujo relanzado (`correccion: false`, `modo: \'tanda\'`) parchea SOLO esa fila: la tanda cierra con las otras 15 intactas', async () => {
    const al = almacen()
    const id = await conUnaFilaMala(al)
    const antes = new Map(delaTanda(al).filter((f) => f.id !== fila4b(al).id).map((f) => [f.id, `${f.fecha}|${f.hora}|${f.formato}|${f.tema}`]))
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: false, modo: 'tanda', resultado: ok({ piezas: [piezaBuena(A, 4, 'b', 'Tema corregido')], ajustes_al_patron: [] }) }, AHORA)
    expect(g.cuerpo).toMatchObject({ ok: true })
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    expect(delaTanda(al)).toHaveLength(16)
    for (const [fid, huella] of antes) {
      const f = delaTanda(al).find((x) => x.id === fid)!
      expect(`${f.fecha}|${f.hora}|${f.formato}|${f.tema}`).toBe(huella)
    }
    expect(fila4b(al).formato).not.toBe('formato-inexistente')
  })
  it('control: el subflujo que SÍ recuerda su corrección (`correccion` en el pedido, `correccion: true` al guardar) sigue igual, sin la marca de retomada y con SU modo', async () => {
    const al = almacen()
    const id = await conUnaFilaMala(al)
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: [], fila_ids: [], modo: 'tanda' } }, AHORA)
    expect(p.cuerpo.retoma_la_correccion).toBeUndefined()
    expect(tarea(p)).toContain('vuelve a entregarla ENTERA')
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: true, modo: 'tanda', resultado: ok(tandaBuena(A)) }, AHORA)
    expect(g.cuerpo).toMatchObject({ ok: true })
  })
  it('🔴 si el subflujo SÍ dice que es corrección (`correccion: true`), vale SU modo aunque la base diga otro: `tanda` con una sola pieza no cierra (faltan las demás)', async () => {
    const al = almacen()
    const id = await conUnaFilaMala(al) // la base dice `filas`
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: [], fila_ids: [], modo: 'tanda' } }, AHORA)
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: true, modo: 'tanda', resultado: ok({ piezas: [piezaBuena(A, 4, 'b', 'Tema corregido')], ajustes_al_patron: [] }) }, AHORA)
    expect(g.cuerpo.ok).not.toBe(true)
    expect(al.campanas.find((c) => c.id === id)!.estado).not.toBe('activa')
  })
  it('🔴 la PRIMERA pasada (`c0`) nunca toma el modo de la base, aunque queden bloqueos viejos de fila guardados: guarda la tanda entera y cierra', async () => {
    const al = almacen()
    const id = await conEstrategia(al)
    const viejo: Hallazgo = { chequeo: 'V02', severidad: 'bloquea', fila_id: 's4-d4-b', alcance: 'fila', ficha: { que: 'viejo', donde: 'fila s4-d4-b', contra_que: 'x', gravedad: 'bloquea', propuesta: 'x' } }
    await al.guardarValidaciones(id, 'calendario', 1, 1, 1, [viejo])
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(clave(al, p)).toBe('t1:v1:c0')
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: false, modo: 'tanda', resultado: ok(tandaBuena(A)) }, AHORA)
    expect(g.cuerpo).toMatchObject({ ok: true })
    expect(delaTanda(al)).toHaveLength(16)
  })
  it('control: una tanda sin filas guardadas hace la primera pasada de siempre (`c0`, sin corrección ni marca)', async () => {
    const al = almacen()
    const id = await conEstrategia(al)
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(clave(al, p)).toBe('t1:v1:c0')
    expect(p.cuerpo.retoma_la_correccion).toBeUndefined()
    expect(tarea(p)).not.toContain('# CORRECCIÓN')
  })
})

describe('correccionPendienteDelCalendario: el modo sale de los bloqueos del ÚLTIMO guardado', () => {
  const b = (chequeo: string | undefined, fila_id: string | null): Hallazgo =>
    ({ chequeo: chequeo as string, severidad: 'bloquea', fila_id, alcance: 'fila', ficha: { que: `${chequeo}-${fila_id}`, donde: 'x', contra_que: 'x', gravedad: 'bloquea', propuesta: 'x' } })
  const aviso: Hallazgo = { chequeo: 'V11', severidad: 'aviso', fila_id: null, alcance: 'tanda', ficha: { que: 'aviso', donde: 'tanda', contra_que: 'x', gravedad: 'aviso', propuesta: 'x' } }
  const con = async (...guardados: Hallazgo[][]) => {
    const al = almacen()
    for (const hs of guardados) await al.guardarValidaciones('c', 'calendario', 1, 1, 1, hs)
    return correccionPendienteDelCalendario(al, 'c', 1)
  }
  it('todos los bloqueos de fila → `filas`, con sus filas (sin repetir) y todas las fichas; los avisos no cuentan', async () => {
    expect(await con([b('V02', 'f1'), b('V13', 'f2'), b('V02', 'f1'), aviso])).toEqual({ modo: 'filas', fila_ids: ['f1', 'f2'], fichas: [b('V02', 'f1').ficha, b('V13', 'f2').ficha, b('V02', 'f1').ficha] })
  })
  it('un bloqueo de CONJUNTO (sin fila) → `tanda`', async () => {
    expect((await con([b('V02', 'f1'), b('V11', null)])).modo).toBe('tanda')
  })
  it('un chequeo de alcance de FILA que vino SIN fila → `tanda` (no hay fila que parchear)', async () => {
    expect((await con([b('V02', 'f1'), b('V13', null)])).modo).toBe('tanda')
  })
  it('un chequeo que no está en el mapa cuenta como de fila, IGUAL que en el validador (`h`), para que el modo reconstruido sea el que planeó `guardar`', async () => {
    expect((await con([b('V02', 'f1'), b('V99-nuevo', 'f2')])).modo).toBe('filas')
  })
  it('un chequeo de alcance de tanda aunque traiga fila → `tanda`', async () => {
    expect((await con([b('V02', 'f1'), b('V08', 'f2')])).modo).toBe('tanda')
  })
  it('un bloqueo SIN chequeo → `tanda` (lo seguro: lo de antes)', async () => {
    expect((await con([b('V02', 'f1'), b(undefined, 'f2')])).modo).toBe('tanda')
  })
  it('sin bloqueos → `tanda` y vacío (lo de antes)', async () => {
    expect(await con([aviso])).toEqual({ modo: 'tanda', fila_ids: [], fichas: [] })
  })
  it('vale solo el último guardado: una ronda vieja de tanda no tiñe una nueva de filas', async () => {
    expect((await con([b('V11', null)], [b('V02', 'f9')])).modo).toBe('filas')
  })
})
