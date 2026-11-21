/**
 * 21-nov 05:18Z (GO Lenovo · opción b de CC7) · «reintentar ahora» LANZA: además del permiso emite el sobre de reintento del reloj, una vez por permiso.
 * Antes (#1262) solo daba el permiso: a una campaña en armado la retoma el sobre del reloj, que en `2fd5f619` no volvía a salir hasta las 12:00Z.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, prepararCorrida } from '../nucleo'
import { reintentarAhora, tramoDelSobreManual } from '../reintento-manual'

const A = clienteA()
// la sala de prueba exige la llave interna, como la real (igual que `autoproducir.test.ts`)
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const ABRE = '2026-10-12T12:00:00Z'
const T1 = '2026-10-13T01:32:00Z', T2 = '2026-10-13T01:38:00Z', T3 = '2026-10-13T01:43:00Z', AHORA = '2026-10-13T03:56:00Z'
const wf = (ex = 'ex-1') => ({ workflow_id: 'wf-cadena', workflow_execution_id: ex })
const OPERADOR = { workflow_id: 'tablero', workflow_execution_id: 'cc7-reintento-1' }
const semilla = (extra: Record<string, unknown> = {}) => ({
  contextos: { [A.clientId]: contextoDe(A) },
  planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
  journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  ...extra,
})
const caida = { success: false, cost_usd: 0.2, error: 'LLAMADA_CORTADA · sin bytes' }

async function conCaidas(n: number, al = new AlmacenMemoria(semilla()), idFijo?: string) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
  let id = (c.cuerpo.campana as { id: string }).id
  if (idFijo) { al.campanas[0].id = idFijo; id = idFijo }
  for (const [i, t] of [T1, T2, T3].slice(0, n).entries()) {
    const p = await estrategiaPreparar(al, { ...wf(`ex-${i}`), campana_id: id }, t)
    expect(p.status).toBe(200)
    await estrategiaGuardar(al, { ...wf(`ex-${i}`), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: caida }, t)
  }
  return { al, id }
}
const pedir = (al: AlmacenMemoria, id: string, ahora = AHORA, extra: Record<string, unknown> = {}) =>
  reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'los 3 intentos cayeron por un error ya arreglado', ...extra }, ahora)
const libreta = (al: AlmacenMemoria) => (al.config.get(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS) ?? []) as unknown[]
type Sobre = { idempotency_key: string; logical_period: string; intent: string; source: string; payload: Record<string, unknown> }
const sobres = (al: AlmacenMemoria) => al.sobresEmitidos as Sobre[]
const sobreDe = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo.sobre as { resultado: string; llave_del_sobre?: string; event_id?: string | null; detalle?: string }

describe('lanza: el sobre de reintento del permiso', () => {
  it('🔴 de punta a punta: permiso → UN sobre con la llave del permiso (el del reloj) → el preparar que dispara usa la llave rmanual', async () => {
    const { al, id } = await conCaidas(3)
    const r = await pedir(al, id)
    expect(r.cuerpo).toMatchObject({ ok: true, permiso: { llave: 'v1:c0:rmanual-20261013t035600' }, sobre: { resultado: 'aceptado', llave_del_sobre: `${id}:reintento:manual-20261013t035600` } })
    expect(sobres(al)).toHaveLength(1)
    expect(sobres(al)[0]).toMatchObject({ source: 'planeacion/plan-listo', intent: 'briefear', idempotency_key: `${id}:reintento:manual-20261013t035600`, logical_period: 'reintento:manual-20261013t035600', payload: { campana_id: id, dry_run: true, desde_worker: 'cadena/reintento' } })
    // lo que hace la puerta al recibir el sobre: retoma la estrategia, y el preparar usa el permiso en el MISMO tramo
    const p = await estrategiaPreparar(al, { ...wf('puerta'), campana_id: id }, '2026-10-13T03:57:00Z')
    expect(p.status).toBe(200)
    expect(al.corridas.find((x) => x.id === p.cuerpo.corrida_id)).toMatchObject({ clave_idempotencia: 'v1:c0:rmanual-20261013t035600', intento: 1 })
  })
  it('🔴 una vez por permiso: pedirlo otra vez (ya_estaba) manda la MISMA llave y la sala la descarta (duplicado, el mismo evento)', async () => {
    const { al, id } = await conCaidas(3)
    const a = await pedir(al, id)
    const b = await pedir(al, id, '2026-10-13T03:58:00Z', { por_que: 'otra' })
    expect(b.cuerpo).toMatchObject({ ya_estaba: true, sobre: { resultado: 'duplicado', llave_del_sobre: sobreDe(a).llave_del_sobre } })
    expect(sobreDe(b).event_id).toBe(sobreDe(a).event_id)
    expect(libreta(al)).toHaveLength(1)
  })
  it('🔴 un permiso concedido ANTES de que la vía lanzara (el de 2fd5f619 a las 04:49Z): pedirlo otra vez lanza su sobre por primera vez, sin abrir llave nueva', async () => {
    const { al, id } = await conCaidas(3)
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [{ campana_id: id, paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t034900', quien: 'CC7', por_que: 'antes de que lanzara', cuando: '2026-10-13T03:49:00Z' }])
    const r = await pedir(al, id)
    expect(r.cuerpo).toMatchObject({ ya_estaba: true, permiso: { llave: 'v1:c0:rmanual-20261013t034900' }, sobre: { resultado: 'aceptado', llave_del_sobre: `${id}:reintento:manual-20261013t034900` } })
    expect(libreta(al)).toHaveLength(1)
  })
  it('🔴 un permiso nuevo (el anterior gastó sus 3) lanza un sobre NUEVO, con su propia llave', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, id)
    for (const [i, t] of ['2026-10-13T03:57:00Z', '2026-10-13T04:05:00Z', '2026-10-13T04:20:00Z'].entries()) {
      const p = await estrategiaPreparar(al, { ...wf(`m-${i}`), campana_id: id }, t)
      await estrategiaGuardar(al, { ...wf(`m-${i}`), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: caida }, t)
    }
    const r = await pedir(al, id, '2026-10-13T04:31:00Z', { por_que: 'segunda' })
    expect(r.cuerpo).toMatchObject({ sobre: { resultado: 'aceptado', llave_del_sobre: `${id}:reintento:manual-20261013t043100` } })
    expect(sobres(al).map((s) => s.idempotency_key)).toEqual([`${id}:reintento:manual-20261013t035600`, `${id}:reintento:manual-20261013t043100`])
  })
  it('🔴 si el sobre no entra, el permiso queda (200 con el sobre rechazado): lo usa el sobre del tramo siguiente', async () => {
    const { al, id } = await conCaidas(3, new AlmacenMemoria(semilla({ intakeApagado: true })))
    const r = await pedir(al, id)
    expect(r).toMatchObject({ status: 200, cuerpo: { ok: true, sobre: { resultado: 'rechazado', detalle: 'intake_apagado' } } })
    expect(libreta(al)).toHaveLength(1)
  })
  it('🔴 si emitir revienta, tampoco cae el permiso', async () => {
    const { al, id } = await conCaidas(3)
    al.emitirSobre = async () => { throw new Error('sala caída') }
    expect((await pedir(al, id)).cuerpo).toMatchObject({ ok: true, sobre: { resultado: 'rechazado', detalle: 'sala caída' } })
    expect(libreta(al)).toHaveLength(1)
  })
  it('🔴 una campaña ACTIVA no recibe sobre (la recorre el vigía); en calendario con el nuevo orden tampoco; sin el nuevo orden, sí', async () => {
    const { al, id } = await conCaidas(0)
    for (const t of [T1, T2, T3]) {
      const r = await prepararCorrida(al, al.campanas[0], 'fichas', 'v1:c0', 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
      if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'fallida', costo_usd: 0.1 })
    }
    const fichas = () => reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'fichas', quien: 'CC7', por_que: 'p' }, AHORA)
    al.campanas[0].estado = 'activa'
    expect((await fichas()).cuerpo).toMatchObject({ ok: true, sobre: { resultado: 'no_hace_falta' } })
    al.campanas[0].estado = 'calendario'
    al.config.set('nuevo_orden', { clientes: [A.clientId] })
    expect((await fichas()).cuerpo).toMatchObject({ ya_estaba: true, sobre: { resultado: 'no_hace_falta' } })
    expect(sobres(al)).toEqual([])
    al.config.set('nuevo_orden', { clientes: [] })
    expect(sobreDe(await fichas()).resultado).toBe('aceptado')
    al.campanas[0].estado = 'pausada'
    expect(sobreDe(await fichas())).toMatchObject({ resultado: 'no_hace_falta', detalle: expect.stringContaining('pausada') })
    expect(sobres(al)).toHaveLength(1)
  })
  it('🔴 m4 de CC6 · una campaña `abierta` (p. ej. reabierta) con la estrategia agotada SÍ lanza: el reloj también la cuenta como armado', async () => {
    const { al, id } = await conCaidas(3)
    al.campanas[0].estado = 'abierta'
    expect(sobreDe(await pedir(al, id))).toMatchObject({ resultado: 'aceptado', llave_del_sobre: `${id}:reintento:manual-20261013t035600` })
  })
  it('🔴 m7 de CC6 · el nuevo orden frena SOLO al calendario: una campaña en `estrategia` con la palanca encendida SÍ lanza', async () => {
    const { al, id } = await conCaidas(3)
    expect(al.campanas[0].estado).toBe('estrategia')
    al.config.set('nuevo_orden', { clientes: [A.clientId] })
    expect(sobreDe(await pedir(al, id))).toMatchObject({ resultado: 'aceptado' })
  })
  it('🔴 los rechazos de siempre no emiten nada (necesita_humano, no agotado, bolsa, 36e66179, flujo desconocido)', async () => {
    const casos: Array<[number, (al: AlmacenMemoria) => void, string | undefined]> = [
      [3, (al) => { al.campanas[0].estado = 'necesita_humano' }, undefined],
      [1, () => {}, undefined],
      [3, (al) => { al.campanas[0].presupuesto_planificacion_usd = 2; al.campanas[0].tope_gasto_usd = 2 }, undefined],
      [3, () => {}, '36e66179-3061-4a7d-94db-932a900d9515'],
    ]
    for (const [n, preparar, idFijo] of casos) {
      const { al, id } = await conCaidas(n, new AlmacenMemoria(semilla()), idFijo)
      preparar(al)
      expect((await pedir(al, id)).status).toBe(409)
      expect(sobres(al)).toEqual([])
    }
    const { al, id } = await conCaidas(3)
    expect((await reintentarAhora(al, { workflow_id: 'otro', workflow_execution_id: 'x', campana_id: id, paso: 'estrategia', quien: 'q', por_que: 'p' }, AHORA)).status).toBe(403)
    expect(sobres(al)).toEqual([])
  })
  it('el tramo del sobre sale de la llave del permiso (y, si no la reconoce, de su hora)', () => {
    const p = { campana_id: 'c', paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261121t044945', quien: 'q', por_que: 'p', cuando: '2026-11-21T04:49:45.000Z' }
    expect(tramoDelSobreManual(p)).toBe('manual-20261121t044945')
    expect(tramoDelSobreManual({ ...p, llave: 'rara' })).toBe('manual-20261121t044945000z')
  })
})
