/** * COLATERALES 2d · pieza D · rehacer UNA vez lo que la jefatura rechazó (las 7 líneas de CC6 del 11-nov · opción 1 de Lenovo 02:15Z). * Dos clientes de rubros distintos, con extractos REALES: Náufrago (restaurante · gran idea en markdown) y el B2B industrial (estrategia en JSON). * La base falsa rechaza columnas que su migración no crea y updates sin `grant update`. */
import { describe, it, expect, vi } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { baseFalsa } from './base-falsa'
import { almacenDeColaterales, type NuevaEdicion, type NuevoRetoque } from '../almacen'
import { aplicarAprobados, type EscritorDeDocumento } from '../aplicar'
import { FACTOR_DE_RESERVA, llaveDeLaSecretaria, TOPE_DE_LA_REVISION_USD, TOPE_POR_EDICION_USD, type GastoDelDia, type GastoDeLaEdicion, type PuertosDelTurno } from '../turno'
import { aplicarVeredictos, recibirVueltaColateral, revisarLaEdicion, type EntradaDeRevisionColateral, type ResultadoDeAbrirColateral } from '../vuelta'
import { entregarRehecho, llaveDelRehacer, rehacer, TOPE_DEL_REHACER_USD } from '../rehacer'
import { atenderColaterales } from '../puerta'
import type { Documento } from '../../cadena/dependencias-de-documentos'

const CLI_A = 'a0000000-0000-4000-8000-00000000000a'
const CLI_B = 'b0000000-0000-4000-8000-00000000000b'
const CAMP_A = 'ca000000-0000-4000-8000-0000000000ca'
const CAMP_B = 'cb000000-0000-4000-8000-0000000000cb'

// A · Náufrago: el dueño cambió el insight del brief; la gran idea lo cita literal
const ANTES_A = 'sabe que el bueno viene de la costa'
const DESPUES_A = 'sabe que el bueno viene de la playa'
const EDIC_A: NuevaEdicion = { client_id: CLI_A, documento: 'brief', documento_ref: CAMP_A, version_base: '2', seccion: 'Insight', antes: ANTES_A, despues: DESPUES_A, llave: 'llave-vuelta-A' }
// B · B2B industrial: el dueño cambió el plan; la estrategia repite la meta de la fase 1
const EST_B = JSON.parse(B.estrategia) as { fases: Array<{ objetivo: string }> }
const OBJ_B = EST_B.fases[0].objetivo
const EDIC_B: NuevaEdicion = { client_id: CLI_B, documento: 'plan', documento_ref: 'plan-b-1', version_base: '1', seccion: 'canales', antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al formulario', llave: 'llave-vuelta-B' }

const pedazo = (id: string, documento: Documento, texto: string, inicio: number, ruta: string | null, seccion: string) => ({ id, documento, seccion, texto, inicio, ruta })
const RET_A: NuevoRetoque[] = [
  { pedazo: pedazo('C1', 'gran_idea', ANTES_A, A.gran_idea_v3.indexOf(ANTES_A), null, 'Por qué funciona'), documento_ref: CAMP_A, version_base: '3', afecta: true, razon: 'cita el insight', antes: ANTES_A, despues: DESPUES_A, porque: 'la gran idea cita literal el insight del brief', estado: 'propuesto' },
]
const RET_B: NuevoRetoque[] = [
  { pedazo: pedazo('C1', 'estrategia', OBJ_B, -1, 'fases[0].objetivo', 'fases.0.objetivo'), documento_ref: CAMP_B, version_base: '1', afecta: true, razon: 'repite el canal', antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al formulario', porque: 'la fase nombra los canales del plan', estado: 'propuesto' },
  { pedazo: pedazo('C2', 'plan', 'consultas', 10, null, 'resumen'), documento_ref: 'plan-b-1', version_base: '1', afecta: true, razon: 'el resumen del plan', antes: 'consultas', despues: 'consultas y formularios', porque: 'el resumen nombra el canal', estado: 'propuesto' },
]

function escritorFalso(texto: string, version: string) {
  const escritas: string[] = []
  const e: EscritorDeDocumento = {
    leerVigente: async () => ({ texto, version }),
    leerVersion: async () => texto,
    escribirSiSigue: async (_ref, base, nuevo) => { if (base !== version) return null; escritas.push(nuevo); return String(Number(version) + 1) },
  }
  return { e, escritas }
}

function armar(o: { abrir?: ResultadoDeAbrirColateral | Error; tope?: number | null | Error; gasto?: Partial<GastoDelDia> | Error; edicion?: Partial<GastoDeLaEdicion> | Error } = {}) {
  const { db, tablas } = baseFalsa()
  const almacen = almacenDeColaterales(db)
  const gi = escritorFalso(A.gran_idea_v3, '3')
  const est = escritorFalso(B.estrategia, '1')
  const abrir = vi.fn(async (_e: EntradaDeRevisionColateral): Promise<ResultadoDeAbrirColateral> => { if (o.abrir instanceof Error) throw o.abrir; return o.abrir ?? { estado: 'esperando', revision_id: 'rev-1' } })
  const gasto = vi.fn(async (_c: string, _s: string): Promise<GastoDelDia> => { if (o.gasto instanceof Error) throw o.gasto; return { recibos: 0, en_vuelo: 0, revisiones: 0, revisiones_abiertas: 0, ...(o.gasto ?? {}) } })
  const gastoEd = vi.fn(async (_e: unknown): Promise<GastoDeLaEdicion> => { if (o.edicion instanceof Error) throw o.edicion; return { cobrado: 0, secretaria_sin_recibo: 0, rehacer_sin_recibo: 0, revisiones_abiertas: 0, ...(o.edicion ?? {}) } })
  const tope = vi.fn(async () => { if (o.tope instanceof Error) throw o.tope; return o.tope === undefined ? 5 : o.tope })
  const activas = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
  const aplicar = vi.fn((id: string) => aplicarAprobados({ almacen, escritores: { gran_idea: gi.e, estrategia: est.e }, leerFilasActivas: async () => activas }, id))
  const P: PuertosDelTurno = {
    almacen, filasActivas: async () => activas, piezasPorPublicar: async () => ({ frenan: [], se_asumen_publicadas: [] }), documentos: async () => ({}),
    campanaDelCliente: async () => true, gastoDelDia: gasto, topeDiario: tope, gastoDeLaEdicion: gastoEd, abrirRevisionColateral: abrir, aplicar,
  }
  return { P, almacen, tablas, abrir, gasto, gastoEd, tope, aplicar, gi, est }
}
async function sembrar(k: ReturnType<typeof armar>, ed: NuevaEdicion, rs: NuevoRetoque[]) {
  const { edicion } = await k.almacen.crearEdicion(ed)
  await k.almacen.pasarEdicion(edicion.id, 'recibida', 'en_curso')
  await k.almacen.guardarRetoques(edicion.id, rs)
  const ids = k.tablas.colaterales_retoques.filter((t) => t.edicion_id === edicion.id).map((t) => String(t.id))
  return { id: edicion.id, ids, edicion: (await k.almacen.edicion(edicion.id))! }
}
const est = (k: ReturnType<typeof armar>, id: string) => k.tablas.colaterales_retoques.find((t) => t.id === id)
const estEd = (k: ReturnType<typeof armar>, id: string) => k.tablas.colaterales_ediciones.find((t) => t.id === id)?.estado
const salida = (o: Record<string, unknown>) => ({ salida: { revision_id: 'rev-1', artifact_type: 'colateral', resultado: 'limpia', simulado: false, ...o } })
const ver = (xs: Array<{ id: string; veredicto: string; razon?: string }>, extra: Record<string, unknown> = {}) => ({ veredictos: xs, sin_veredicto: [], inventados: [], ...extra })

/** deja la edición con sus retoques revisados por rev-1 y el veredicto dado (el primer rechaza queda «por rehacer») */
async function hastaPorRehacer(k: ReturnType<typeof armar>, ed: NuevaEdicion, rs: NuevoRetoque[], vs: (ids: string[]) => Array<{ id: string; veredicto: string; razon?: string }>) {
  const x = await sembrar(k, ed, rs)
  await revisarLaEdicion(k.P, x.edicion)
  const r = await recibirVueltaColateral(k.P, salida({ artifact_id: x.id, veredictos: ver(vs(x.ids)) }))
  return { ...x, vuelta: r.cuerpo }
}
const pedidoDe = async (k: ReturnType<typeof armar>, id: string) => {
  const r = await rehacer(k.P, { edicion_id: id })
  if (r.accion !== 'pedir') throw new Error(`esperaba pedir y vino ${r.accion}`)
  return r
}
const BUENO_A = 'sabe que lo bueno llega de la playa'

describe('🔴 pieza D · el ciclo entero', () => {
  it('Náufrago: rechaza → por rehacer → la secretaria rehace con la razón del jefe → revisión versión 2 SOLO del rehecho → aprueba → se aplica el NUEVO después', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'cambia el tono del documento' }])
    expect(x.vuelta).toMatchObject({ por_rehacer: 1 })
    const p = await pedidoDe(k, x.id)
    expect(p).toMatchObject({ agente: 'content-creator', tope_usd: TOPE_DEL_REHACER_USD, dispatch_key: llaveDelRehacer(x.id), retoques: [x.ids[0]] })
    expect(p.dispatch_key).not.toBe(llaveDeLaSecretaria(x.id))
    expect(p.pedido).toContain('razón del jefe: cambia el tono del documento')
    expect(p.pedido).toContain('[C1]')
    k.abrir.mockResolvedValueOnce({ estado: 'esperando', revision_id: 'rev-2' })
    const e = await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'mismo tono' }] } })
    expect(e).toMatchObject({ accion: 'rehechos', rehechos: 1, pendientes: 0, revision: { estado: 'esperando', revision_id: 'rev-2', atados: 1 } })
    expect(est(k, x.ids[0])).toMatchObject({ estado: 'propuesto', rehechos: 1, despues: BUENO_A, motivo: null, revision_id: 'rev-2' })
    const s2 = k.abrir.mock.calls[1][0]
    expect(s2.payload).toMatchObject({ version: 2 })
    expect(s2.payload.retoques).toEqual([expect.objectContaining({ id: x.ids[0], despues: BUENO_A })])
    const v2 = await recibirVueltaColateral(k.P, salida({ revision_id: 'rev-2', artifact_id: x.id, veredictos: ver([{ id: x.ids[0], veredicto: 'aprueba', razon: 'fiel' }]) }))
    expect(v2.cuerpo).toMatchObject({ aprobados: 1, cierre: { estado: 'lista', aplicados: 1 } })
    expect(k.gi.escritas.length).toBe(1)
    expect(k.gi.escritas[0]).toContain(BUENO_A)
  })
  it('🔴 línea 1 · B2B: el rehecho que vuelve a caer queda `rechazado` (sin tercera vuelta) y el documento sigue como estaba; lo aprobado en la primera ronda se aplica', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_B, RET_B, (ids) => [{ id: ids[0], veredicto: 'aprueba', razon: 'fiel' }, { id: ids[1], veredicto: 'rechaza', razon: 'el resumen no nombra formularios' }])
    expect(x.vuelta).toMatchObject({ aprobados: 1, por_rehacer: 1, cierre: { estado: 'esperando' } })
    const p = await pedidoDe(k, x.id)
    // línea 3: lo aprobado no vuelve a la secretaria ni a la jefatura
    expect(p.retoques).toEqual([x.ids[1]])
    k.abrir.mockResolvedValueOnce({ estado: 'esperando', revision_id: 'rev-2' })
    await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C2', despues: 'consultas por WhatsApp y formulario', porque: 'x' }] } })
    expect((k.abrir.mock.calls[1][0].payload.retoques as Array<{ id: string }>).map((t) => t.id)).toEqual([x.ids[1]])
    const v2 = await recibirVueltaColateral(k.P, salida({ revision_id: 'rev-2', artifact_id: x.id, veredictos: ver([{ id: x.ids[1], veredicto: 'rechaza', razon: 'sigue sin calzar' }]) }))
    expect(v2.cuerpo).toMatchObject({ rechazados: 1, por_rehacer: 0, cierre: { estado: 'lista', aplicados: 1 } })
    expect(est(k, x.ids[1])).toMatchObject({ estado: 'rechazado', rehechos: 1 })
    expect(est(k, x.ids[0])?.estado).toBe('aplicado')
    // no hay tercera vuelta: ni el pedido ni el almacén la permiten
    expect(await rehacer(k.P, { edicion_id: x.id })).toMatchObject({ accion: 'ya_cerrada', estado: 'lista' })
    expect(await k.almacen.pasarRetoque(x.ids[1], 'rechazado', 'propuesto').catch(() => 'no')).toBe('no')
  })
  it('🔴 línea 1 en el almacén: un retoque ya rehecho no se rehace otra vez, aunque la entrega se repita', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    k.abrir.mockResolvedValueOnce({ estado: 'esperando', revision_id: 'rev-2' })
    const ok = { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'p' }] }
    await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: ok })
    const antes = structuredClone(k.tablas.colaterales_retoques)
    expect(await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: ok })).toMatchObject({ accion: 'sin_rehacer', motivo: 'nada por rehacer', pendientes: 0 })
    expect(k.tablas.colaterales_retoques).toEqual(antes)
    expect(k.abrir).toHaveBeenCalledTimes(2)
    expect(await k.almacen.pasarRetoque(x.ids[0], 'propuesto', 'propuesto', { despues: 'otra' })).toBe(false)
  })
  it('🔴 marcar para rehacer exige la MISMA revisión que lo rechazó (otra revisión no lo marca)', async () => {
    const k = armar()
    const x = await sembrar(k, EDIC_A, RET_A)
    await revisarLaEdicion(k.P, x.edicion)
    expect(await k.almacen.marcarParaRehacer(x.ids[0], 'rev-otra', 'r')).toBe(false)
    expect(est(k, x.ids[0])?.motivo ?? null).toBe(null)
    expect(await k.almacen.marcarParaRehacer(x.ids[0], 'rev-1', 'r')).toBe(true)
  })
  it('🔴 una vuelta repetida de la primera ronda no toca lo que ya está «por rehacer»', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r1' }])
    const antes = structuredClone(k.tablas.colaterales_retoques)
    const r = await recibirVueltaColateral(k.P, salida({ artifact_id: x.id, veredictos: ver([{ id: x.ids[0], veredicto: 'aprueba' }]) }))
    expect(r.cuerpo).toMatchObject({ aprobados: 0, por_rehacer: 0 })
    expect(k.tablas.colaterales_retoques).toEqual(antes)
  })
})

describe('🔴 pieza D · lo que no se acepta', () => {
  it.each([
    ['un pedazo distinto', [{ id: 'C9', despues: 'otra cosa', porque: 'p' }]],
    ['el mismo pedazo dos veces', [{ id: 'C1', despues: 'uno', porque: 'p' }, { id: 'C1', despues: 'dos', porque: 'p' }]],
    ['un después vacío', [{ id: 'C1', despues: '  ', porque: 'p' }]],
    ['el mismo después que ya se rechazó', [{ id: 'C1', despues: DESPUES_A, porque: 'p' }]],
    ['el después igual al antes', [{ id: 'C1', despues: ANTES_A, porque: 'p' }]],
  ])('🔴 línea 2 · Náufrago: %s → el retoque queda `pendiente` (nunca se aplica) y no se abre otra revisión', async (_n, rehechos) => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    const e = await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos } })
    expect(e).toMatchObject({ accion: 'rehechos', rehechos: 0, pendientes: 1 })
    expect(est(k, x.ids[0])).toMatchObject({ estado: 'pendiente', rehechos: 0 })
    expect(String(est(k, x.ids[0])?.motivo)).toContain('lo decide jefe-marketing')
    expect(k.abrir).toHaveBeenCalledTimes(1)
    expect(k.gi.escritas).toEqual([])
    expect(estEd(k, x.id)).toBe('lista')
  })
  it('🔴 línea 2 · B2B: un pedazo de MÁS no cuenta y no toca nada; el pedido sí se rehace', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_B, RET_B, (ids) => [{ id: ids[0], veredicto: 'aprueba' }, { id: ids[1], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    k.abrir.mockResolvedValueOnce({ estado: 'esperando', revision_id: 'rev-2' })
    const e = await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C2', despues: 'consultas y formularios web', porque: 'p' }, { id: 'C1', despues: 'colado', porque: 'p' }] } })
    expect(e).toMatchObject({ rehechos: 1, pendientes: 0 })
    expect(est(k, x.ids[0])).toMatchObject({ estado: 'aprobado', despues: RET_B[0].despues })
  })
  it.each([
    ['ilegible', 'no es un objeto'],
    ['sin la lista', { otra: [] }],
  ])('🔴 una salida %s → todo lo pedido `pendiente`', async (_n, s) => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    expect(await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: s })).toMatchObject({ accion: 'sin_rehacer', pendientes: 1 })
    expect(est(k, x.ids[0])?.estado).toBe('pendiente')
  })
  it('🔴 el sello: si el documento cambió entre el pedido y la entrega → `pendiente`', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    k.P.documentos = async () => ({ gran_idea: { texto: 't', ref: CAMP_A, version: '4' } })
    const e = await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'p' }] } })
    expect(e).toMatchObject({ accion: 'sin_rehacer', motivo: 'lo pedido cambió entre el pedido y la entrega del rehacer' })
    expect(est(k, x.ids[0])?.estado).toBe('pendiente')
  })
})

describe('🔴 pieza D · gasto, fallas, edición cerrada y cimiento', () => {
  it('🔴 línea 4: sin saldo para el rehacer y su revisión → `pendiente` (no se pide nada); con saldo justo, sí', async () => {
    const esto = TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    k.gasto.mockResolvedValueOnce({ recibos: 5 - esto + 0.001, en_vuelo: 0, revisiones: 0, revisiones_abiertas: 0 })
    expect(await rehacer(k.P, { edicion_id: x.id })).toMatchObject({ accion: 'sin_rehacer', pendientes: 1 })
    expect(String(est(k, x.ids[0])?.motivo)).toContain('sin saldo para rehacer')
    const k2 = armar()
    const y = await hastaPorRehacer(k2, EDIC_B, RET_B, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }, { id: ids[1], veredicto: 'aprueba' }])
    k2.gasto.mockResolvedValueOnce({ recibos: 0, en_vuelo: 0, revisiones: 5 - esto - 0.001, revisiones_abiertas: 0 })
    expect((await rehacer(k2.P, { edicion_id: y.id })).accion).toBe('pedir')
    // las abiertas cuentan su tope y lo en vuelo su reserva
    k2.gasto.mockResolvedValueOnce({ recibos: 0, en_vuelo: 0, revisiones: 5 - esto - 0.001, revisiones_abiertas: 1 })
    expect((await rehacer(k2.P, { edicion_id: y.id })).accion).toBe('sin_rehacer')
    const k3 = armar()
    const z = await hastaPorRehacer(k3, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    k3.gasto.mockResolvedValueOnce({ recibos: 5 - esto - 0.001, en_vuelo: 1, revisiones: 0, revisiones_abiertas: 0 })
    expect((await rehacer(k3.P, { edicion_id: z.id })).accion).toBe('sin_rehacer')
  })
  it.each([
    ['no puede leer el tope', 'tope', new Error('base caída')],
    ['sin tope', 'tope', null],
    ['un tope que no es número', 'tope', Number.NaN],
    ['un tope infinito', 'tope', Number.POSITIVE_INFINITY],
    ['no puede leer el gasto', 'gasto', new Error('base caída')],
  ])('🔴 línea 4: %s → `pendiente` (frena)', async (_n, que, valor) => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    if (que === 'tope') k.tope.mockImplementation(async () => { if (valor instanceof Error) throw valor; return valor as number | null })
    else k.gasto.mockImplementation(async () => { throw valor })
    expect((await rehacer(k.P, { edicion_id: x.id })).accion).toBe('sin_rehacer')
    expect(est(k, x.ids[0])?.estado).toBe('pendiente')
  })
  it.each([
    ['la jefatura no abre la segunda ronda', { estado: 'no_abre', motivo: 'x' } as ResultadoDeAbrirColateral, null],
    ['la segunda ronda termina fallida', null, { resultado: 'fallida' }],
    ['la segunda ronda viene simulada', null, { simulado: true }],
  ])('🔴 línea 5: %s → `pendiente`, nunca aprobado', async (_n, abre, vuelta) => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    k.abrir.mockResolvedValueOnce(abre ?? { estado: 'esperando', revision_id: 'rev-2' })
    await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'p' }] } })
    if (vuelta) await recibirVueltaColateral(k.P, salida({ revision_id: 'rev-2', artifact_id: x.id, veredictos: ver([{ id: x.ids[0], veredicto: 'aprueba' }]), ...vuelta }))
    expect(est(k, x.ids[0])).toMatchObject({ estado: 'pendiente', rehechos: 1 })
    expect(k.gi.escritas).toEqual([])
  })
  it('🔴 línea 6: con la edición `fallida`, ni el rehacer ni su entrega tocan nada', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const p = await pedidoDe(k, x.id)
    await k.almacen.pasarEdicion(x.id, 'en_curso', 'fallida', { nota: 'el barrido' })
    const antes = structuredClone(k.tablas.colaterales_retoques)
    expect(await rehacer(k.P, { edicion_id: x.id })).toEqual({ accion: 'ya_cerrada', estado: 'fallida' })
    expect(await entregarRehecho(k.P, { edicion_id: x.id, sello: p.sello, salida: { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'p' }] } })).toEqual({ accion: 'ya_cerrada', estado: 'fallida' })
    expect(k.tablas.colaterales_retoques).toEqual(antes)
    expect(k.abrir).toHaveBeenCalledTimes(1)
  })
  it('🔴 línea 7: en un cimiento no hay rehacer: el rechaza va a una persona (`pendiente`, lo decide Emilio)', async () => {
    const k = armar()
    const { id, edicion } = await sembrar(k, EDIC_B, [{ ...RET_B[1], pedazo: { ...RET_B[1].pedazo, documento: 'manual' } }])
    await revisarLaEdicion(k.P, edicion)
    const rid = String(k.tablas.colaterales_retoques[0].id)
    const v = await aplicarVeredictos(k.P, id, salida({ artifact_id: id, veredictos: ver([{ id: rid, veredicto: 'rechaza', razon: 'r' }]) }).salida)
    expect(v).toMatchObject({ pendientes: 1, por_rehacer: 0 })
    expect(est(k, rid)?.estado).toBe('pendiente')
    expect(String(est(k, rid)?.motivo)).toContain('lo decide Emilio')
  })
})

describe('🔴 pieza D · el tope de la EDICIÓN (opción 1 de Lenovo 04:15Z · líneas de CC6 05:05Z)', () => {
  it('🔴 los números de dinero quedan atados: rehacer US$ 0,15 × 1,3; con lo cobrado chico el rehacer y su revisión caben en los US$ 0,50 (D no es código muerto)', () => {
    expect(TOPE_DEL_REHACER_USD).toBe(0.15)
    expect(TOPE_POR_EDICION_USD).toBe(0.5)
    expect(TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD).toBeLessThan(TOPE_POR_EDICION_USD)
  })
  it('🔴 hallazgo en B: la PRIMERA revisión también mira el tope de la edición (Náufrago: lo cobrado + 0,30 > 0,50 → pendiente, no se abre)', async () => {
    const k = armar({ edicion: { cobrado: TOPE_POR_EDICION_USD - TOPE_DE_LA_REVISION_USD + 0.001 } })
    const x = await sembrar(k, EDIC_A, RET_A)
    expect(await revisarLaEdicion(k.P, x.edicion)).toMatchObject({ estado: 'sin_revision' })
    expect(k.abrir).not.toHaveBeenCalled()
    expect(est(k, x.ids[0])?.estado).toBe('pendiente')
    expect(String(est(k, x.ids[0])?.motivo)).toContain('sin saldo en la edición')
    const k2 = armar({ edicion: { cobrado: TOPE_POR_EDICION_USD - TOPE_DE_LA_REVISION_USD - 0.001 } })
    const y = await sembrar(k2, EDIC_B, RET_B)
    expect(await revisarLaEdicion(k2.P, y.edicion)).toMatchObject({ estado: 'esperando' })
  })
  it('🔴 una llamada sin recibo NUNCA cuenta 0: la de la secretaria reserva su tope × 1,3 (B2B: no alcanza para la revisión)', async () => {
    const k = armar({ edicion: { secretaria_sin_recibo: 1 } })
    const x = await sembrar(k, EDIC_B, RET_B)
    expect(await revisarLaEdicion(k.P, x.edicion)).toMatchObject({ estado: 'sin_revision' })
    expect(k.abrir).not.toHaveBeenCalled()
  })
  it('🔴 el rehacer mira el tope de la edición: lo cobrado + rehacer × 1,3 + su revisión ≤ 0,50; si no → pendiente con su dueño', async () => {
    const esto = TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    k.gastoEd.mockResolvedValueOnce({ cobrado: TOPE_POR_EDICION_USD - esto - 0.001, secretaria_sin_recibo: 0, rehacer_sin_recibo: 0, revisiones_abiertas: 0 })
    expect((await rehacer(k.P, { edicion_id: x.id })).accion).toBe('pedir')
    k.gastoEd.mockResolvedValueOnce({ cobrado: TOPE_POR_EDICION_USD - esto + 0.001, secretaria_sin_recibo: 0, rehacer_sin_recibo: 0, revisiones_abiertas: 0 })
    expect(await rehacer(k.P, { edicion_id: x.id })).toMatchObject({ accion: 'sin_rehacer', pendientes: 1 })
    expect(String(est(k, x.ids[0])?.motivo)).toMatch(/sin saldo en la edición para rehacer y su revisión.*lo decide jefe-marketing/)
  })
  it.each([
    ['un rehacer sin recibo', { rehacer_sin_recibo: 1 }],
    ['una revisión abierta', { revisiones_abiertas: 1 }],
    ['la secretaria sin recibo', { secretaria_sin_recibo: 1 }],
  ])('🔴 B2B: %s reserva su tope en el saldo del rehacer', async (_n, g) => {
    const esto = TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_B, RET_B, (ids) => [{ id: ids[0], veredicto: 'aprueba' }, { id: ids[1], veredicto: 'rechaza', razon: 'r' }])
    k.gastoEd.mockResolvedValueOnce({ cobrado: TOPE_POR_EDICION_USD - esto - 0.001, secretaria_sin_recibo: 0, rehacer_sin_recibo: 0, revisiones_abiertas: 0, ...g })
    expect((await rehacer(k.P, { edicion_id: x.id })).accion).toBe('sin_rehacer')
  })
  it('🔴 si no se puede leer el gasto de la edición → pendiente (frena), en la revisión y en el rehacer', async () => {
    const k = armar({ edicion: new Error('base caída') })
    const x = await sembrar(k, EDIC_A, RET_A)
    expect(await revisarLaEdicion(k.P, x.edicion)).toMatchObject({ estado: 'sin_revision' })
    expect(String(est(k, x.ids[0])?.motivo)).toContain('no se pudo leer el gasto de la edición')
    const k2 = armar()
    const y = await hastaPorRehacer(k2, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    k2.gastoEd.mockRejectedValueOnce(new Error('base caída'))
    expect((await rehacer(k2.P, { edicion_id: y.id })).accion).toBe('sin_rehacer')
    expect(est(k2, y.ids[0])?.estado).toBe('pendiente')
  })
})

describe('pieza D · la puerta', () => {
  it('`rehacer` y `entregar_rehecho` exigen la firma del flujo; `entregar_rehecho` exige su sello', async () => {
    const k = armar()
    const x = await hastaPorRehacer(k, EDIC_A, RET_A, (ids) => [{ id: ids[0], veredicto: 'rechaza', razon: 'r' }])
    const ahora = new Date()
    expect((await atenderColaterales(k.P, { accion: 'rehacer', edicion_id: x.id }, ahora)).status).toBe(403)
    const firma = { workflow_id: 'wf', workflow_execution_id: '9' }
    const r = await atenderColaterales(k.P, { accion: 'rehacer', edicion_id: x.id, ...firma }, ahora)
    expect(r.cuerpo).toMatchObject({ accion: 'pedir', dispatch_key: llaveDelRehacer(x.id) })
    expect((await atenderColaterales(k.P, { accion: 'entregar_rehecho', edicion_id: x.id, ...firma }, ahora)).status).toBe(400)
    k.abrir.mockResolvedValueOnce({ estado: 'esperando', revision_id: 'rev-2' })
    const e = await atenderColaterales(k.P, { accion: 'entregar_rehecho', edicion_id: x.id, sello: r.cuerpo.sello, salida: { rehechos: [{ id: 'C1', despues: BUENO_A, porque: 'p' }] }, ...firma }, ahora)
    expect(e.cuerpo).toMatchObject({ accion: 'rehechos', rehechos: 1 })
  })
})
