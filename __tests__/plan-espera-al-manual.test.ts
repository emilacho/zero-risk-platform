/**
 * 3-nov · firma de Emilio: un plan no se firma antes de su manual. La puerta del plan, la lista de decisiones y lo que se cierra al aprobar.
 * Sin red: la base es la de pruebas.
 */
import { describe, expect, it, vi } from 'vitest'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { rutaValidarManual } from '../src/lib/manual/edicion-rutas'
import { cerrarFirmasDelPlanAnterior, planEsperaAlManual } from '../src/lib/manual/manual-primero'
import { ACCIONES } from '../src/lib/oficina/tablero/acciones'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PLAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const AHORA = new Date('2026-11-03T21:00:00Z')
const SIN_APROBAR = { human_validated: false, provenance_tag: {} }
const DEL_DUENO = { human_validated: true, provenance_tag: { validado_por: 'dueno' } }
const DE_LA_JEFATURA = { human_validated: true, provenance_tag: { validado_por: 'jefatura' } }
const manual = (m: Record<string, unknown>, version = 1, client_id = C) => ({ id: `m${version}-${client_id}`, client_id, version, content_text: '{}', ...m })

function base(manuales: Array<Record<string, unknown>>) {
  return new DbFalsa()
    .semilla('client_brand_books', manuales)
    .semilla('client_historical_outputs', [{ id: PLAN, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-11-03T13:00:00Z', provenance_tag: { compuerta: true, version: 1 } }])
    .semilla('plan_aprobaciones', [{ id: 'f1', client_id: C, plan_id: PLAN, version: 1, estado: 'pendiente', creado_en: '2026-11-03T13:00:00Z', sobre_de_reanudacion: {} }])
    .semilla('plan_cambios', [])
    .semilla('clients', [{ id: C, name: 'Cliente real', slug: 'cliente-real', status: 'active' }])
    .semilla('hitl_queue', [{ id: 'h1', client_id: C, output_id: PLAN, type: 'plan_con_pendientes', documento: 'plan', status: 'pending', title: 'Plan con pendientes', created_at: '2026-11-03T13:00:00Z' }])
}
const accion = (db: DbFalsa, nombre: string, cuerpo: Record<string, unknown>) => ACCIONES[nombre]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })

describe('🔴 planEsperaAlManual', () => {
  it.each([
    ['sin aprobar', [manual(SIN_APROBAR)], true],
    ['validado solo por la jefatura', [manual(DE_LA_JEFATURA)], true],
    ['aprobado por el dueño', [manual(DEL_DUENO)], false],
    ['firmado antes de este ciclo', [manual({ human_validated: true, provenance_tag: {} })], false],
    ['aprobado, pero la versión vigente es una nueva sin aprobar', [manual(DEL_DUENO, 1), manual(SIN_APROBAR, 2)], true],
    ['sin manual no queda trabado', [], false],
  ])('%s', async (_n, manuales, espera) => {
    expect(await planEsperaAlManual(base(manuales as never), C)).toEqual({ ok: true, espera })
  })
  it('🔴 el manual de otro cliente no cuenta', async () => {
    expect(await planEsperaAlManual(base([manual(DEL_DUENO, 1, OTRO), manual(SIN_APROBAR, 1)]), C)).toEqual({ ok: true, espera: true })
  })
  it('🔴 un error de lectura no se lee como aprobado', async () => {
    const db = base([manual(DEL_DUENO)])
    db.fallar['client_brand_books'] = 'caída'
    expect(await planEsperaAlManual(db, C)).toMatchObject({ ok: false })
  })
})

describe('🔴 la puerta del plan', () => {
  it.each([
    ['plan-aprobar', { plan_id: PLAN }],
    ['plan-cambios', { plan_id: PLAN, texto: 'Hazlo más cercano', confirmo_gasto: true, tope_usd: 5 }],
  ])('%s no deja decidir con el manual sin aprobar, y no escribe', async (nombre, cuerpo) => {
    const db = base([manual(SIN_APROBAR)])
    const s = await accion(db, nombre, cuerpo)
    expect(s.status).toBe(409)
    expect(s.cuerpo).toMatchObject({ error: 'plan_espera_al_manual', detalle: expect.stringContaining('Plan: espera que apruebes el manual') })
    expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('pendiente')
    expect(db.tablas['plan_cambios']).toHaveLength(0)
  })
  it('🔴 si no puede leer el manual tampoco deja firmar', async () => {
    const db = base([manual(DEL_DUENO)])
    db.fallar['client_brand_books'] = 'caída'
    expect((await accion(db, 'plan-aprobar', { plan_id: PLAN })).status).toBe(500)
  })
  it('🔴 con el manual aprobado la puerta deja pasar', async () => {
    const db = base([manual(DEL_DUENO)])
    const s = await accion(db, 'plan-aprobar', { plan_id: PLAN })
    expect(s.cuerpo.error).not.toBe('plan_espera_al_manual')
    expect(s.status).toBe(200)
  })
})

describe('🔴 la lista de decisiones', () => {
  const ctx = (db: DbFalsa) => ({ db, ahora: () => AHORA }) as never
  const dePlan = (r: { decisiones: Array<{ tipo: string }> }) => r.decisiones.filter((d) => d.tipo === 'plan')

  it('con el manual sin aprobar no pide firmar el plan, y lo declara', async () => {
    const r = await leerDecisiones(ctx(base([manual(SIN_APROBAR)])))
    expect(dePlan(r as never)).toHaveLength(0)
    expect(r.omitidas.esperan_el_manual).toBeGreaterThan(0)
  })
  it('con el manual aprobado sí', async () => {
    const r = await leerDecisiones(ctx(base([manual(DEL_DUENO)])))
    expect(dePlan(r as never).length).toBeGreaterThan(0)
    expect(r.omitidas.esperan_el_manual).toBe(0)
  })
  it('🔴 si el manual no se lee, la firma se muestra: no se esconde a ciegas', async () => {
    const db = base([manual(SIN_APROBAR)])
    db.fallar['client_brand_books'] = 'caída'
    expect(dePlan((await leerDecisiones(ctx(db))) as never).length).toBeGreaterThan(0)
  })
})

describe('🔴 al aprobar el manual', () => {
  const deps = (db: DbFalsa, pedir: unknown) => ({ db, ahora: () => AHORA, cerebro: { env: { baseUrl: 'x', internalKey: 'k' } }, empujarManual: () => ({ estado: 'agendado' }), pedirPlan: pedir as never })
  const conManual = () => base([manual(SIN_APROBAR)]).semilla('plan_corridas', []).semilla('borradores_del_dueno', [])

  it('cierra las firmas del plan anterior: no se firma uno viejo mientras llega el nuevo, y el plan no se borra', async () => {
    const db = conManual()
    const s = await rutaValidarManual(deps(db, vi.fn(async () => ({ pedido: true, repetido: false, event_id: 'e' }))), C, 'emilio')
    expect(s.status).toBe(200)
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('reemplazado')
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'rejected', decision: { motivo: 'reemplazado_al_aprobar_el_manual' } })
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
  })
  it.each([
    ['el plan no se pudo pedir', { pedido: false, error: 'no' }],
    ['el pedido es repetido: lo que hay puede ser ya el plan nuevo', { pedido: true, repetido: true, event_id: null }],
  ])('🔴 %s: no cierra nada', async (_n, respuesta) => {
    const db = conManual()
    await rutaValidarManual(deps(db, vi.fn(async () => respuesta)), C, 'emilio')
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('pendiente')
    expect(db.tablas['hitl_queue'][0].status).toBe('pending')
  })
  it('🔴 no toca a otro cliente ni lo que no es del plan', async () => {
    const db = new DbFalsa().semilla('plan_aprobaciones', [{ id: 'f2', client_id: OTRO, plan_id: 'p', estado: 'pendiente' }]).semilla('hitl_queue', [{ id: 'h2', client_id: OTRO, documento: 'plan', status: 'pending' }, { id: 'h3', client_id: C, documento: 'pieza', status: 'pending' }])
    expect(await cerrarFirmasDelPlanAnterior(db, C, AHORA)).toEqual({ ok: true })
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('pendiente')
    expect(db.tablas['hitl_queue'].map((h) => h.status)).toEqual(['pending', 'pending'])
  })
  it('si la base falla lo dice y no lanza: el manual ya quedó aprobado', async () => {
    const db = base([])
    db.fallar['plan_aprobaciones'] = 'caída'
    expect(await cerrarFirmasDelPlanAnterior(db, C, AHORA)).toMatchObject({ ok: false })
  })
})
