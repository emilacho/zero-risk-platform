/**
 * Lo que la plataforma rechaza, reemplaza o deja vencer nunca es lo vigente (05-nov).
 * El caso de partida es real: los 3 planes de Náufrago, con su `status` y su etiqueta tal como están en la base; el rechazado decía `vigente: true`.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { aprobacionesPorPlan, estadoDeLaSalida, manualCerrado } from '../estado-en-plataforma'
import { estadoDelManual, leerEstadoDelManual } from '../../portero-alimenta/estado-del-manual'
import { retirarFichasDeLoCerrado } from '../../portero-alimenta/retiro-de-lo-cerrado'
import { crearBaseFalsa as basePortero } from '../../portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../../portero-alimenta/__tests__/diez-clientes.fixtures'
import type { ListaCorta } from '../tipos'
import { AHORA, crearBaseFalsa } from './casos'

type Fila = Record<string, unknown>
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString()
const fila = (client_id: string, id: string, status: string, antig: number, tag: Fila = {}, output_type = 'campaign_plan_90d'): Fila =>
  ({ id, client_id, output_type, title: id, status, created_at: dias(antig), content_text: 'texto', provenance_tag: tag, hitl_verdict: null, human_edits: null })
const cola = (client_id: string, id: string, output_id: string, status: string, antig: number, decision: Fila = {}): Fila =>
  ({ id, client_id, type: 'plan_aprobacion', status, output_id, decision, resolution_notes: null, resolved_at: dias(antig), created_at: dias(antig + 1) })
const aprobacion = (client_id: string, plan_id: string, version: number, estado: string, antig: number): Fila =>
  ({ id: `${plan_id}-${version}`, client_id, plan_id, version, estado, creado_en: dias(antig) })

async function listaDe(cliente: string, t: { salidas: Fila[]; cola?: Fila[]; aprobaciones?: Fila[] }, fallan: string[] = []) {
  const base = crearBaseFalsa({ clients: [{ id: cliente, name: 'c' }], client_historical_outputs: t.salidas, hitl_queue: t.cola ?? [], plan_aprobaciones: t.aprobaciones ?? [] }, fallan)
  return construirListaCorta(base.consulta, cliente, { ahora: AHORA })
}
const linea = (l: ListaCorta, id: string) => {
  const f = l.lineas.find((x) => x.ref === `client_historical_outputs:${id}`)
  if (!f) throw new Error(`falta ${id}`)
  return f
}
const vigentes = (l: ListaCorta) => l.lineas.filter((x) => x.ref.startsWith('client_historical_outputs:') && x.vigente === true).map((x) => x.ref.split(':')[1])

describe('el caso real · los 3 planes de Náufrago', () => {
  const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
  const planes = [
    fila(C, '0b8e7c16', 'draft', 6, { version: 1, vigente: false, superseded_por: '7554b590' }),
    fila(C, '85d5bb1c', 'draft', 4, { version: 2, reemplaza_a: '0b8e7c16', vigente: false, superseded_por: '7554b590' }),
    fila(C, '7554b590', 'rejected', 2, { version: 3, reemplaza_a: '85d5bb1c', vigente: true, estado_del_plan: 'con_pendientes', rechazado_por: 'dueño', rechazado_en: dias(1), nota_de_rechazo: 'no sirve así' }),
  ]
  const salidas = { salidas: planes, aprobaciones: [aprobacion(C, '0b8e7c16', 1, 'reemplazado', 6), aprobacion(C, '85d5bb1c', 2, 'reemplazado', 4)] }
  it('sin plan vigente; los 3 quedan en el historial', async () => {
    const l = await listaDe(C, salidas)
    expect(vigentes(l)).toEqual([])
    expect(l.lineas.filter((x) => x.ref.startsWith('client_historical_outputs:'))).toHaveLength(3)
  })
  it('r3 sale rechazado, con su motivo y la decisión atada a quien lo rechazó', async () => {
    const r3 = linea(await listaDe(C, salidas), '7554b590')
    expect([r3.estado, r3.vigente]).toEqual(['rechazado', false])
    expect(r3.aviso).toContain('NO VIGENTE')
    expect(r3.aviso).toContain('no sirve así')
    expect(r3.decision_del_dueno).toMatchObject({ decision: 'rechazada', detalle: 'no sirve así', ref_de_la_decision: 'client_historical_outputs:7554b590#rechazo' })
  })
  it('las dos versiones reemplazadas se declaran reemplazadas aunque no haya vigente', async () => {
    const l = await listaDe(C, salidas)
    for (const id of ['0b8e7c16', '85d5bb1c']) expect([linea(l, id).vigente, linea(l, id).reemplazada]).toEqual([false, true])
  })
})

describe('el clasificador, señal por señal', () => {
  const casos: Array<[string, Fila, Fila, string, boolean]> = [
    ['rechazada en la fila', { status: 'rejected' }, {}, 'rechazado', true],
    ['rechazada en la fila gana a la cola aprobada', { status: 'rejected' }, { decision: 'aprobada', decision_en: dias(1) }, 'rechazado', true],
    ['etiqueta vigente:false', { status: 'draft', provenance_tag: { vigente: false } }, {}, 'reemplazado', true],
    ['etiqueta superseded_por', { status: 'approved', provenance_tag: { superseded_por: 'x' } }, {}, 'reemplazado', true],
    ['aprobación reemplazada', { status: 'draft' }, { aprobacion: 'reemplazado' }, 'reemplazado', true],
    ['rechazo en la cola', { status: 'draft' }, { decision: 'rechazada', decision_en: dias(1) }, 'rechazado', true],
    ['revisión vencida sin decisión', { status: 'draft' }, { vencida_en: dias(1) }, 'vencido', true],
    ['venció después de un rechazo', { status: 'draft' }, { decision: 'rechazada', decision_en: dias(3), vencida_en: dias(1) }, 'vencido', true],
    ['venció antes de la aprobación: vale la aprobación', { status: 'draft' }, { decision: 'aprobada', decision_en: dias(1), vencida_en: dias(3) }, 'aprobado', false],
    ['aprobada en la plataforma: un vencimiento no la tumba', { status: 'approved' }, { vencida_en: dias(1) }, 'aprobado', false],
    ['borrador sin nada', { status: 'draft' }, {}, 'abierto', false],
    ['cambios pedidos: abierto, no aprobado', { status: 'draft' }, { aprobacion: 'cambios_pedidos' }, 'abierto', false],
    ['cambio pedido en la cola sobre una aprobada: ya no lo está', { status: 'approved' }, { decision: 'cambio_pedido', decision_en: dias(1) }, 'abierto', false],
    ['cambios pedidos sobre una aprobada: ya no lo está', { status: 'approved' }, { aprobacion: 'cambios_pedidos' }, 'abierto', false],
    ['aprobación pendiente: no es aprobado', { status: 'draft' }, { aprobacion: 'pendiente' }, 'abierto', false],
    ['aprobación real', { status: 'draft' }, { aprobacion: 'aprobado' }, 'aprobado', false],
    ['publicada', { status: 'published' }, {}, 'aprobado', false],
  ]
  it.each(casos)('%s', (_n, f, s, estado, cerrada) => {
    expect(estadoDeLaSalida(f, s)).toMatchObject({ estado, cerrada })
  })
  it('lo cerrado siempre dice por qué; lo abierto no', () => {
    for (const [, f, s, , cerrada] of casos) {
      const e = estadoDeLaSalida(f, s)
      if (cerrada) expect(e.motivo).toBeTruthy()
      else expect(e.motivo).toBeNull()
    }
  })
  it('el motivo de un rechazo lleva la nota', () => {
    expect(estadoDeLaSalida({ status: 'rejected', provenance_tag: { nota_de_rechazo: 'caro' } }).motivo).toContain('caro')
  })
})

describe.each(DIEZ_CLIENTES.map((c) => [c.nombre, c.id] as const))('cualquier salida · %s', (_n, C) => {
  const pieza = (id: string, status: string, antig: number, tag: Fila = {}) => fila(C, id, status, antig, { brief_id: 'E-1', parte_id: 'P-1', ...tag }, 'campaign_piece')
  it('el plan más nuevo está rechazado: vuelve a ser vigente el anterior que sigue en pie', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p1', 'draft', 9), fila(C, 'p2', 'rejected', 3)] })
    expect(vigentes(l)).toEqual(['p1'])
  })
  it('una pieza aprobada sigue siendo la vigente si la más nueva se rechaza en la cola', async () => {
    const l = await listaDe(C, { salidas: [pieza('a', 'approved', 9), pieza('b', 'draft', 3)], cola: [cola(C, 'h1', 'b', 'rejected', 2)] })
    expect(vigentes(l)).toEqual(['a'])
    expect(linea(l, 'b').estado).toBe('rechazado')
  })
  it('una revisión vencida cierra un borrador, sin borrarlo', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], cola: [cola(C, 'h', 'p', 'rejected', 2, { vencida: true })] })
    expect(vigentes(l)).toEqual([])
    expect(linea(l, 'p').aviso).toContain('venció')
  })
  it('una aprobación en la cola hace vigente a la versión aprobada, no a la más nueva', async () => {
    const l = await listaDe(C, { salidas: [pieza('a', 'draft', 9), pieza('b', 'draft', 3)], cola: [cola(C, 'h', 'a', 'approved', 5)] })
    expect(vigentes(l)).toEqual(['a'])
  })
  it('una revisión pendiente, sin vencer, no cierra lo que ya estaba aprobado', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], cola: [cola(C, 'h1', 'p', 'approved', 5), { ...cola(C, 'h2', 'p', 'pending', 1), resolved_at: null }] })
    expect(vigentes(l)).toEqual(['p'])
    expect(linea(l, 'p').estado).toBe('aprobado')
  })
  it('la cola aprobada no resucita lo rechazado en la plataforma', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'rejected', 9)], cola: [cola(C, 'h', 'p', 'approved', 2)] })
    expect(vigentes(l)).toEqual([])
    expect(linea(l, 'p').estado).toBe('rechazado')
  })
  it('«aprobado» solo con una aprobación real', async () => {
    const sin = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], aprobaciones: [aprobacion(C, 'p', 1, 'pendiente', 9)] })
    expect(linea(sin, 'p').estado).toBe('borrador sin aprobar')
    const con = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], aprobaciones: [aprobacion(C, 'p', 2, 'aprobado', 1), aprobacion(C, 'p', 1, 'pendiente', 9)] })
    expect(linea(con, 'p').estado).toBe('aprobado')
  })
  it('si las aprobaciones no se pudieron leer, se dice y nada se da por aprobado', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], aprobaciones: [aprobacion(C, 'p', 1, 'aprobado', 1)] }, ['plan_aprobaciones'])
    expect(linea(l, 'p').estado).toBe('borrador sin aprobar')
    expect(linea(l, 'p').aviso).toBeTruthy()
    expect(l.fuentes.trabajos_hechos).toMatchObject({ estado: 'error_de_lectura' })
  })
  it('el manual: la versión rechazada o reemplazada no es la vigente', () => {
    const m = (version: number, tag: Fila = {}) => ({ id: `m${version}`, client_id: C, version, human_validated: false, created_at: dias(10 - version), provenance_tag: tag })
    expect(estadoDelManual([m(1), m(2, { rechazado_por: 'dueño' })]).version).toBe(1)
    expect(estadoDelManual([m(1), m(2, { vigente: false })]).version).toBe(1)
    const ninguna = estadoDelManual([m(1, { nota_de_rechazo: 'no' })])
    expect([ninguna.estado, ninguna.texto]).toEqual(['sin_manual', expect.stringContaining('no hay versión vigente')])
    expect(estadoDelManual([]).texto).toContain('todavía no tiene manual')
  })
  it('el manual en la lista: la versión rechazada sale rechazada y vigente la anterior', async () => {
    const m = (version: number, tag: Fila = {}) => ({ id: `m${version}`, client_id: C, version, human_validated: false, created_at: dias(10 - version), provenance_tag: tag, content_text: 'x' })
    const base = crearBaseFalsa({ clients: [{ id: C, name: 'c' }], client_brand_books: [m(1), m(2, { rechazado_por: 'dueño' })] })
    const l = await construirListaCorta(base.consulta, C, { ahora: AHORA })
    const de = (id: string) => l.lineas.find((x) => x.ref === `client_brand_books:${id}`)
    expect([de('m1')?.vigente, de('m2')?.vigente, de('m2')?.estado]).toEqual([true, false, 'rechazado'])
  })
  it('leer el manual: si la última versión está cerrada, vale la anterior', async () => {
    const m = (version: number, tag: Fila = {}) => ({ id: `m${version}`, client_id: C, version, human_validated: false, created_at: dias(10 - version), provenance_tag: tag })
    const base = basePortero({ client_brand_books: [m(2, { rechazado_por: 'dueño' }), m(1)] })
    expect(await leerEstadoDelManual(base.db as never, C)).toMatchObject({ estado: 'propuesta_sin_validar', version: 1 })
  })
  it('una ficha sacada de algo cerrado se retira sola, con motivo; lo demás no se toca', async () => {
    const ajeno = '99999999-0000-4000-8000-000000000099'
    const f = (id: string, client_id: string, ref: string, retirada_en: string | null = null) => ({ id, client_id, ref, retirada_en, motivo_retirada: null })
    const base = basePortero({
      client_historical_outputs: [fila(C, 'cerrado', 'rejected', 3, { nota_de_rechazo: 'no va' }), fila(C, 'vivo', 'draft', 3), fila(C, 'aprob', 'draft', 3), fila(C, 'venc', 'draft', 3), fila(ajeno, 'ajeno', 'rejected', 3)],
      hitl_queue: [cola(C, 'h1', 'venc', 'rejected', 1, { vencida: true }), cola(C, 'h2', 'aprob', 'approved', 1)], plan_aprobaciones: [],
      cerebro_fichas: [f('f1', C, 'client_historical_outputs:cerrado'), f('f2', C, 'client_historical_outputs:vivo'), f('f3', ajeno, 'client_historical_outputs:ajeno'), f('f4', C, 'portero:sitio:1'), f('f5', C, 'client_historical_outputs:cerrado', dias(5)), f('f6', C, 'client_historical_outputs:venc'), f('f7', C, 'client_historical_outputs:aprob'), f('f8', ajeno, 'client_historical_outputs:cerrado')],
    })
    const seco = await retirarFichasDeLoCerrado(base.db as never, C, { dryRun: true, ahora: AHORA })
    expect(seco.retiradas.map((r) => r.ficha_id).sort()).toEqual(['f1', 'f6'])
    expect(base.escrituras.filter((e) => e.tabla === 'cerebro_fichas')).toEqual([])
    const r = await retirarFichasDeLoCerrado(base.db as never, C, { dryRun: false, ahora: AHORA })
    expect(r.errores).toEqual([])
    expect(r.retiradas.map((x) => x.ficha_id).sort()).toEqual(['f1', 'f6'])
    const filas = base.tablas.cerebro_fichas as Fila[]
    expect(filas.find((x) => x.id === 'f1')).toMatchObject({ retirada_en: AHORA.toISOString(), motivo_retirada: expect.stringContaining('no va') })
    expect(filas.find((x) => x.id === 'f6')?.motivo_retirada).toContain('venció')
    for (const id of ['f2', 'f3', 'f4', 'f7', 'f8']) expect(filas.find((x) => x.id === id)?.retirada_en).toBeNull()
    expect(filas).toHaveLength(8)
  })
  it('sin certeza del estado no se retira nada, y se dice', async () => {
    const db = { from: (t: string) => { const q: Record<string, unknown> = { select: () => q, eq: () => q, then: (ok: (v: unknown) => void) => ok(t === 'plan_aprobaciones' ? { data: null, error: { message: 'boom' } } : { data: [fila(C, 'x', 'rejected', 1)], error: null }) }; return q } }
    expect(await retirarFichasDeLoCerrado(db as never, C, { dryRun: false })).toEqual({ retiradas: [], errores: [expect.stringContaining('boom')] })
  })
})

describe('la aprobación más reciente', () => {
  it('manda la versión mayor, aunque su fila sea más vieja; a igual versión, la fecha', () => {
    expect(aprobacionesPorPlan([{ plan_id: 'p', version: 2, estado: 'aprobado', creado_en: dias(9) }, { plan_id: 'p', version: 1, estado: 'pendiente', creado_en: dias(1) }]).get('p')).toBe('aprobado')
    expect(aprobacionesPorPlan([{ plan_id: 'p', version: 1, estado: 'aprobado', creado_en: dias(1) }, { plan_id: 'p', version: 1, estado: 'pendiente', creado_en: dias(9) }]).get('p')).toBe('aprobado')
  })
})

describe('el manual cerrado', () => {
  it('solo por marca real en la etiqueta', () => {
    expect(manualCerrado({ provenance_tag: {} })).toBe(false)
    expect(manualCerrado({ provenance_tag: { vigente: true } })).toBe(false)
    expect(manualCerrado({})).toBe(false)
    for (const tag of [{ rechazado_por: 'x' }, { rechazado_en: 'x' }, { nota_de_rechazo: 'x' }, { vigente: false }, { superseded_por: 'x' }]) expect(manualCerrado({ provenance_tag: tag })).toBe(true)
  })
})
