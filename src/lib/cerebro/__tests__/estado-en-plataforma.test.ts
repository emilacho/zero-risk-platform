/**
 * Lo que la plataforma rechaza, reemplaza o deja vencer nunca es lo vigente (05-nov).
 * El caso de partida es real: los 3 planes de Náufrago, con su `status` y su etiqueta tal como están en la base; el rechazado decía `vigente: true`.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { lineaParaElModelo, numerarLista } from '../portero/lista-numerada'
import { aprobacionesPorPlan, avisoNoVigente, estadoDeLaSalida, filaConDecisionReal, manualCerrado, manualRechazado, quienResolvio, sinPlazoLoNoVigente } from '../estado-en-plataforma'
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

describe('lo que no está vigente no muestra plazo y lo dice en su línea', () => {
  const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
  const r3 = fila(C, '7554b590', 'rejected', 2, { version: 3, vigente: true, rechazado_por: 'dueño', nota_de_rechazo: 'plan con errores de fondo' })
  it('la línea real de r3: NO VIGENTE con su motivo, sin «vigente hasta»; ningún plan vigente', async () => {
    const l = await listaDe(C, { salidas: [r3] })
    const n = numerarLista(l)
    const texto = n.lineas.filter((x) => x.ficha.ref.endsWith('7554b590')).map((x) => lineaParaElModelo(x.numero, x.ficha)).join()
    expect(texto).toContain('NO VIGENTE · rechazado en la plataforma por dueño: plan con errores de fondo')
    expect(texto).not.toContain('vigente hasta')
    expect(texto).not.toMatch(/v\d+ vigente/)
    expect(linea(l, '7554b590')).toMatchObject({ vigente_hasta: null, vencido: false })
    expect(vigentes(l)).toEqual([])
  })
  it('la línea con NO VIGENTE no lleva ninguna clase de plazo, venga de donde venga', () => {
    const f = { ref: 'x:1', estante: 'E8', clase: 'nota', titulo: 't', que_es: 'q', origen: 'su_fuente', estado: 'rechazado', fecha_fuente: dias(9), vigente_hasta: dias(-9), vencido: false, peso_estimado: 1, aviso: 'NO VIGENTE · x' } as never
    const t = lineaParaElModelo(1, f)
    expect(t).toContain('NO VIGENTE · x')
    expect(t).not.toContain('vigente hasta')
    expect(t).not.toContain('sin plazo')
  })
  it('una versión abierta sigue mostrando su plazo', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 1)] })
    const f = linea(l, 'p')
    expect(f.vigente_hasta).toBeTruthy()
    expect(lineaParaElModelo(1, f)).toContain('vigente hasta')
    expect(lineaParaElModelo(1, f)).toMatch(/v1 vigente/)
    expect(lineaParaElModelo(1, f)).not.toContain('NO VIGENTE')
  })
  it('lo cerrado y muy viejo no dice VENCIDO: el aviso de frescura no se mezcla', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'rejected', 900)] })
    const f = linea(l, 'p')
    expect(f.vencido).toBe(false)
    expect(f.aviso).toBe('NO VIGENTE · rechazado en la plataforma')
    expect(lineaParaElModelo(1, f)).not.toContain('VENCIDO')
  })
  it('una versión reemplazada por la regla de versiones también lo dice', async () => {
    const pz = (id: string, antig: number) => fila(C, id, 'draft', antig, { brief_id: 'E', parte_id: 'P' }, 'campaign_piece')
    const f = linea(await listaDe(C, { salidas: [pz('a', 9), pz('b', 1)] }), 'a')
    expect(f).toMatchObject({ reemplazada: true, vigente_hasta: null, aviso: 'NO VIGENTE · reemplazado por una versión más nueva' })
  })
  it('una ficha retirada no dice vigente y lleva su motivo; una reemplazada tampoco muestra plazo', async () => {
    const ficha = (id: string, extra: Fila) => ({ id, client_id: C, clase: 'nota', titulo: id, que_es: id, contenido: 'x', origen: 'su_fuente', propiedad: 'propia', creado_en: dias(30), retirada_en: null, version_de: null, plazo: 'sitio_propio', ...extra })
    const base = crearBaseFalsa({ clients: [{ id: C, name: 'c' }], cerebro_fichas: [ficha('r', { retirada_en: dias(1), motivo_retirada: 'ya no aplica', vigente_hasta: dias(-300) }), ficha('v1', { creado_en: dias(9), plazo: 'sitio_propio' }), ficha('v2', { creado_en: dias(2), version_de: 'v1' })] })
    const l = await construirListaCorta(base.consulta, C, { ahora: AHORA })
    const de = (id: string) => l.lineas.find((x) => x.ref === `cerebro_fichas:${id}`)!
    expect(de('r').vigente).toBe(false)
    const t = lineaParaElModelo(1, de('r'))
    expect(t).toContain('NO VIGENTE · RETIRADA desde')
    expect(t).toContain('ya no aplica')
    expect(t).not.toMatch(/v\d+ vigente/)
    expect(de('v1')).toMatchObject({ reemplazada: true, vigente_hasta: null, aviso: 'NO VIGENTE · reemplazado por una versión más nueva' })
    expect(de('v2').aviso ?? '').not.toContain('NO VIGENTE')
  })
  it('el manual rechazado dice quién y por qué; el reemplazado, solo que fue reemplazado', async () => {
    const m = (version: number, tag: Fila = {}) => ({ id: `m${version}`, client_id: C, version, human_validated: false, created_at: dias(10 - version), provenance_tag: tag, content_text: 'x' })
    const base = crearBaseFalsa({ clients: [{ id: C, name: 'c' }], client_brand_books: [m(1), m(2, { vigente: false }), m(3, { rechazado_por: 'dueño', nota_de_rechazo: 'caro' })] })
    const l = await construirListaCorta(base.consulta, C, { ahora: AHORA })
    const de = (id: string) => l.lineas.find((x) => x.ref === `client_brand_books:${id}`)!
    expect(de('m3').aviso).toBe('NO VIGENTE · rechazado por dueño: caro')
    expect(de('m2').aviso).toBe('NO VIGENTE · reemplazado por una versión más nueva')
    expect(de('m1').aviso ?? '').not.toContain('NO VIGENTE')
  })
  it('sinPlazoLoNoVigente: no toca lo que no lleva versión, y conserva otros avisos', () => {
    const base = { ref: 'x:1', vigente_hasta: dias(-5), vencido: false } as never as Parameters<typeof sinPlazoLoNoVigente>[0]
    expect(sinPlazoLoNoVigente(base)).toBe(base)
    const inval = sinPlazoLoNoVigente({ ...base, vigente: false, valida: false, aviso: '⛔ NO VÁLIDO' })
    expect(inval.aviso).toBe('NO VIGENTE · marcado como no válido · ⛔ NO VÁLIDO')
    expect(sinPlazoLoNoVigente({ ...base, vigente: false }).aviso).toBe('NO VIGENTE · no es la versión vigente')
    expect(sinPlazoLoNoVigente({ ...base, vigente: false, aviso: 'VENCIDO desde 2026-01-01 · última verificación 2025-01-01 · verifícalo antes de afirmarlo · otro' }).aviso).toBe('NO VIGENTE · no es la versión vigente · otro')
    expect(avisoNoVigente({ aviso: 'antes · NO VIGENTE · x' })).toBe('NO VIGENTE · x')
    expect(sinPlazoLoNoVigente({ ...base, reemplazada: true })).toMatchObject({ vigente_hasta: null, aviso: 'NO VIGENTE · reemplazado por una versión más nueva' })
    expect(sinPlazoLoNoVigente({ ...base, vigente: false, aviso: 'otro · VENCIDO desde 2026-01-01 · última verificación 2025-01-01 · verifícalo antes de afirmarlo' }).aviso).toBe('NO VIGENTE · no es la versión vigente · otro')
    expect(avisoNoVigente({})).toBeNull()
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
  it('el motivo dice quién decidió, y nunca da por hecho que fue el dueño', () => {
    expect(estadoDeLaSalida({ status: 'draft' }, { decision: 'rechazada', decision_en: dias(1), decision_por: 'emilio' }).motivo).toBe('rechazado en la revisión por emilio')
    expect(estadoDeLaSalida({ status: 'draft' }, { decision: 'rechazada', decision_en: dias(1) }).motivo).toBe('rechazado en la revisión')
    expect(estadoDeLaSalida({ status: 'rejected', provenance_tag: { rechazado_por: 'emilio', nota_de_rechazo: 'caro' } }).motivo).toBe('rechazado en la plataforma por emilio: caro')
    expect(estadoDeLaSalida({ status: 'draft' }, { vencida_en: dias(1), vencida_por: 'hitl-inbox-processor' }).motivo).toBe('su revisión venció sin aprobación; la cerró hitl-inbox-processor')
    expect(estadoDeLaSalida({ status: 'draft' }, { vencida_en: dias(1) }).motivo).toBe('su revisión venció sin aprobación')
  })
  it('una salida rechazada con la marca de que nadie decidió no se cierra', () => {
    for (const tag of [{ no_es_decision_del_dueno: true }, { superada: true }, { archivada: true }]) expect(estadoDeLaSalida({ status: 'rejected', provenance_tag: tag })).toMatchObject({ estado: 'abierto', cerrada: false })
    expect(estadoDeLaSalida({ status: 'rejected', provenance_tag: { no_es_decision_del_dueno: false } })).toMatchObject({ estado: 'rechazado', cerrada: true })
  })
  it('qué fila de la cola recoge una decisión real', () => {
    for (const decision of [{ no_es_decision_del_dueno: true }, { no_es_decision_de_nadie: true }, { superada: true }, { archivada: true }, { por: 'sistema · limpieza' }]) expect(filaConDecisionReal({ decision })).toBe(false)
    expect(filaConDecisionReal({ decision: {}, reviewer: 'limpieza-cc2' })).toBe(false)
    expect(filaConDecisionReal({ decision: {}, resolved_by: 'limpieza-cc2' })).toBe(false)
    for (const f of [{ decision: {} }, { decision: { por: 'dueño · ejecuta CC1' }, reviewer: 'emilio' }, { decision: { superada: false, no_es_decision_del_dueno: false } }]) expect(filaConDecisionReal(f)).toBe(true)
    expect(quienResolvio({ decision: { por: 'a' }, resolved_by: 'b', reviewer: 'c' })).toBe('a')
    expect(quienResolvio({ decision: {}, resolved_by: 'b', reviewer: 'c' })).toBe('b')
    expect(quienResolvio({ decision: {}, reviewer: 'c' })).toBe('c')
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
    for (const e of base.escrituras.filter((x) => x.tabla === 'cerebro_fichas')) expect(e.filtros).toContainEqual(['client_id', C])
    expect(filas.find((x) => x.id === 'f1')).toMatchObject({ retirada_en: AHORA.toISOString(), motivo_retirada: expect.stringContaining('no va') })
    expect(filas.find((x) => x.id === 'f6')?.motivo_retirada).toContain('venció')
    for (const id of ['f2', 'f3', 'f4', 'f7', 'f8']) expect(filas.find((x) => x.id === id)?.retirada_en).toBeNull()
    expect(filas).toHaveLength(8)
  })
  it('una limpieza o la decisión sobre una sola parte no retiran fichas', async () => {
    const f = (id: string, ref: string) => ({ id, client_id: C, ref, retirada_en: null, motivo_retirada: null })
    const base = basePortero({
      client_historical_outputs: [fila(C, 'marca', 'draft', 3), fila(C, 'autor', 'draft', 3), fila(C, 'palabra', 'draft', 3), fila(C, 'real', 'draft', 3)],
      hitl_queue: [
        cola(C, 'h1', 'marca', 'rejected', 1, { superada: true, no_es_decision_del_dueno: true }),
        { ...cola(C, 'h2', 'autor', 'rejected', 1), reviewer: 'limpieza-cc2' },
        { ...cola(C, 'h3', 'palabra', 'rejected', 1), type: 'palabra_del_dueno' },
        { ...cola(C, 'h4', 'real', 'rejected', 1), reviewer: 'emilio' },
      ],
      plan_aprobaciones: [],
      cerebro_fichas: ['marca', 'autor', 'palabra', 'real'].map((x) => f(x, `client_historical_outputs:${x}`)),
    })
    // la base falsa no valida columnas: se comprueba aparte que el retiro pida las que necesita para reconocer una limpieza
    const pedidas: string[] = []
    const db = { from: (t: string) => { const q = base.db.from(t) as unknown as Record<string, (...a: unknown[]) => unknown>; return { ...q, select: (c: string) => { if (t === 'hitl_queue') pedidas.push(c); return q.select(c) } } } }
    const r = await retirarFichasDeLoCerrado(db as never, C, { dryRun: true, ahora: AHORA })
    for (const col of ['type', 'decision', 'reviewer', 'resolved_by']) expect(pedidas[0].split(', ')).toContain(col)
    expect(r.retiradas).toEqual([{ ficha_id: 'real', ref: 'client_historical_outputs:real', motivo: 'rechazado en la revisión por emilio' }])
  })
  it('sin certeza del estado no se retira nada, y se dice', async () => {
    const db = { from: (t: string) => { const q: Record<string, unknown> = { select: () => q, eq: () => q, then: (ok: (v: unknown) => void) => ok(t === 'plan_aprobaciones' ? { data: null, error: { message: 'boom' } } : { data: [fila(C, 'x', 'rejected', 1)], error: null }) }; return q } }
    expect(await retirarFichasDeLoCerrado(db as never, C, { dryRun: false })).toEqual({ retiradas: [], errores: [expect.stringContaining('boom')], lectura_fallida: true })
  })
})

describe('la aprobación más reciente', () => {
  it('manda la versión mayor, aunque su fila sea más vieja; a igual versión, la fecha', () => {
    expect(aprobacionesPorPlan([{ plan_id: 'p', version: 2, estado: 'aprobado', creado_en: dias(9) }, { plan_id: 'p', version: 1, estado: 'pendiente', creado_en: dias(1) }]).get('p')).toBe('aprobado')
    expect(aprobacionesPorPlan([{ plan_id: 'p', version: 1, estado: 'aprobado', creado_en: dias(1) }, { plan_id: 'p', version: 1, estado: 'pendiente', creado_en: dias(9) }]).get('p')).toBe('aprobado')
  })
})

describe('el caso real · Zero Risk Seguridad Industrial: limpiezas que el dueño no hizo', () => {
  const C = 'df7e47cc-0000-4000-8000-000000000000'
  const pz = (id: string, antig: number, brief: string) => fila(C, id, 'draft', antig, { brief_id: brief, parte_id: 'P' }, 'campaign_piece')
  const hq = (id: string, out: string, type: string, status: string, antig: number, decision: Fila, reviewer: string | null, resolved_by: string | null, notas: string | null = null) =>
    ({ id, client_id: C, type, status, output_id: out, decision, reviewer, resolved_by, resolution_notes: notas, resolved_at: dias(antig), created_at: dias(antig + 1) })
  const salidas = [fila(C, 'a58df0c4', 'draft', 16), pz('4d6ded22', 14, 'BRF-0001'), pz('b682fc72', 13, 'BRF-0002'), pz('c9b4cb6d', 12, 'BRF-0002')]
  const colaReal = [
    hq('30eac3c3', 'a58df0c4', 'plan_con_pendientes', 'rejected', 6, { orden: 'ADENDA 2', archivada: true, no_es_decision_del_dueno: true }, 'limpieza-cc2', 'limpieza-cc2', 'Archivada por orden de Emilio (30-oct): lo resuelven los agentes, no el dueño'),
    hq('1604fafd', 'b682fc72', 'content_piece_review', 'rejected', 5, { motivo: 'fila duplicada', superada: true, superada_por: '353067d1', no_es_decision_del_dueno: true }, 'limpieza-cc2', null),
    hq('9ccb6924', '4d6ded22', 'content_piece_review', 'rejected', 4, { por: 'sistema · limpieza', motivo: 'Pieza de una campaña en pausa', vencida: true, decision: 'rejected' }, 'sistema · limpieza', 'sistema · limpieza'),
    hq('353067d1', 'c9b4cb6d', 'content_piece_review', 'rejected', 3, { superada: true, superada_por: '5db4c541', no_es_decision_del_dueno: true }, 'oficina-superada', 'oficina-superada'),
  ]
  it('el plan archivado y la pieza de la limpieza siguen vigentes, sin aviso de cierre', async () => {
    const l = await listaDe(C, { salidas, cola: colaReal })
    expect(vigentes(l).sort()).toEqual(['4d6ded22', 'a58df0c4', 'c9b4cb6d'])
    for (const id of ['a58df0c4', '4d6ded22', 'b682fc72', 'c9b4cb6d']) {
      const f = linea(l, id)
      expect(f.estado).toBe('borrador sin aprobar')
      expect(f.aviso ?? '').not.toContain('rechazado')
      expect(f.decision_del_dueno).toBeUndefined()
    }
    for (const id of ['a58df0c4', '4d6ded22', 'c9b4cb6d']) expect(linea(l, id).aviso ?? '').not.toContain('NO VIGENTE')
    expect(linea(l, 'b682fc72').aviso).toBe('NO VIGENTE · reemplazado por una versión más nueva')
  })
  it('ninguna limpieza sale como decisión del dueño', async () => {
    const l = await listaDe(C, { salidas, cola: colaReal })
    expect(l.lineas.filter((x) => x.clase === 'decision_del_aprobador')).toEqual([])
    expect(JSON.stringify(l)).not.toContain('rechazado por el dueño')
  })
  it('pero un rechazo real de la misma pieza sí la cierra y dice de quién', async () => {
    const l = await listaDe(C, { salidas: [pz('p', 9, 'B')], cola: [hq('h', 'p', 'content_piece_review', 'rejected', 1, {}, 'emilio', null)] })
    expect(vigentes(l)).toEqual([])
    expect(linea(l, 'p').aviso).toContain('rechazado en la revisión por emilio')
  })
})

describe('una decisión sobre una sola parte no decide la salida entera', () => {
  const C = 'df7e47cc-0000-4000-8000-000000000000'
  const parte = (status: string, decision: Fila = {}) => ({ ...cola(C, 'h', 'p', status, 1, decision), type: 'palabra_del_dueno' })
  it('rechazar una palabra no cierra el plan; la decisión sigue listada, sin atarse a él', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], cola: [parte('rejected')] })
    expect(vigentes(l)).toEqual(['p'])
    expect(linea(l, 'p').estado).toBe('borrador sin aprobar')
    expect(linea(l, 'p').decision_del_dueno).toBeUndefined()
    const d = l.lineas.find((x) => x.clase === 'decision_del_aprobador')
    expect(d?.ref).toBe('hitl_queue:h')
    expect(d?.de_la_cosa).toBeUndefined()
  })
  it('aprobar una palabra no aprueba el plan', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], cola: [parte('approved')] })
    expect(linea(l, 'p').estado).toBe('borrador sin aprobar')
  })
  it('el vencimiento de una palabra no cierra el plan', async () => {
    const l = await listaDe(C, { salidas: [fila(C, 'p', 'draft', 9)], cola: [parte('rejected', { vencida: true })] })
    expect(vigentes(l)).toEqual(['p'])
  })
})

describe('el manual cerrado', () => {
  it('reemplazado no es rechazado', async () => {
    const C = 'df7e47cc-0000-4000-8000-000000000000'
    const m = (version: number, tag: Fila = {}) => ({ id: `m${version}`, client_id: C, version, human_validated: false, created_at: dias(10 - version), provenance_tag: tag, content_text: 'x' })
    const base = crearBaseFalsa({ clients: [{ id: C, name: 'c' }], client_brand_books: [m(1), m(2, { vigente: false }), m(3, { rechazado_por: 'dueño', no_es_decision_del_dueno: true })] })
    const l = await construirListaCorta(base.consulta, C, { ahora: AHORA })
    const de = (id: string) => l.lineas.find((x) => x.ref === `client_brand_books:${id}`)
    expect(de('m2')).toMatchObject({ estado: 'borrador sin aprobar', vigente: false, reemplazada: true })
    expect(de('m3')).toMatchObject({ estado: 'borrador sin aprobar', vigente: true })
    expect(manualRechazado({ provenance_tag: { vigente: false } })).toBe(false)
  })
  it('solo por marca real en la etiqueta', () => {
    expect(manualCerrado({ provenance_tag: {} })).toBe(false)
    expect(manualCerrado({ provenance_tag: { vigente: true } })).toBe(false)
    expect(manualCerrado({})).toBe(false)
    for (const tag of [{ rechazado_por: 'x' }, { rechazado_en: 'x' }, { nota_de_rechazo: 'x' }, { vigente: false }, { superseded_por: 'x' }]) expect(manualCerrado({ provenance_tag: tag })).toBe(true)
  })
})
