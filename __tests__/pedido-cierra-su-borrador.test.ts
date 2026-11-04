/**
 * 4-nov · Emilio: tras «Pedir los cambios» quedaba un borrador «de la versión anterior» con lo que ya había mandado. El pedido se lleva del borrador lo que envió.
 * Sin red: la edición usa la base de pruebas y un cerebro falso.
 */
import { describe, expect, it, vi } from 'vitest'
import { quitarDelBorrador } from '../src/lib/manual/borrador-del-dueno'
import { rutaEditarManual } from '../src/lib/manual/edicion-rutas'
import { pedirCambiosAlManual, type DepsDelPedido } from '../src/lib/oficina/tablero/manual-cambios'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AHORA = new Date('2026-11-04T09:30:00Z')
const GASTO = { confirmo_gasto: true, tope_usd: 5 }
const LIBRE = 'En Guayaquil es un dark kitchen, solo delivery'
const acciones = (o: Record<string, unknown> = {}) => ({ campos: { vision: 'Visión mía', valores: '' }, como: { vision: 'editar', valores: 'retirar' }, notas: { mision: 'más cercana' }, libre: LIBRE, detalle: { vision: 'editaste el renglón 1' }, ...o })
function base(a: Record<string, unknown> | null = acciones()) {
  return new DbFalsa()
    .semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, brand_mission: 'M', brand_vision: 'V', content_text: JSON.stringify({ brand_book_draft: { mision: 'M', vision: 'V' } }), provenance_tag: {} }])
    .semilla('plan_cambios', [])
    .semilla('borradores_del_dueno', a ? [{ client_id: C, documento: 'manual', documento_id: 'v1', acciones: a, revision: 17, actualizado_por: 'emilio' }] : [])
}
const deps = (db: DbFalsa) => ({ db, puertos: () => ({}) as never, ahora: () => AHORA, editarDirecto: vi.fn<DepsDelPedido['editarDirecto']>((client_id, campos, reviewer) => rutaEditarManual({ db, ahora: () => AHORA, empujarManual: () => ({ estado: 'agendado' }), cerebro: { env: { baseUrl: 'x', internalKey: 'k' }, enviar: async () => ({ ok: true, repetida: false }) } }, client_id, { campos, reviewer }, reviewer)) }) as DepsDelPedido
const pedir = (db: DbFalsa, cuerpo: Record<string, unknown>) => pedirCambiosAlManual(deps(db), { cuerpo: { client_id: C, ...cuerpo }, reviewer: 'emilio' })
const TODO = { ...GASTO, campos: { vision: 'Visión mía' }, retirar: ['valores'], observaciones_por_campo: [{ campo: 'mision', texto: 'más cercana' }], texto: LIBRE }
const filas = (db: DbFalsa) => db.tablas['borradores_del_dueno']

describe('🔴 el pedido enviado se lleva su borrador', () => {
  it('lo de Emilio: todo se mandó, el borrador se borra y no queda «versión anterior»', async () => {
    const db = base()
    const s = await pedir(db, TODO)
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ reescribe: true, borrador: { estado: 'borrado' } })
    expect(filas(db)).toHaveLength(0)
  })
  it('🔴 solo lo directo también lo borra', async () => {
    const db = base(acciones({ notas: {}, libre: '' }))
    const s = await pedir(db, { campos: { vision: 'Visión mía' }, retirar: ['valores'] })
    expect(s.cuerpo).toMatchObject({ reescribe: false, borrador: { estado: 'borrado' } })
    expect(filas(db)).toHaveLength(0)
  })
  it('sin borrador no pasa nada', async () => {
    expect((await pedir(base(null), TODO)).cuerpo).toMatchObject({ ok: true, borrador: { estado: 'sin_borrador' } })
  })
})

describe('🔴 lo que no se mandó se queda, y se dice qué es', () => {
  it('algo marcado en otro equipo sigue, sobre la versión nueva y sin lo enviado', async () => {
    const db = base(acciones({ campos: { vision: 'Visión mía', valores: '', eslogan: 'Otro eslogan' }, como: { vision: 'editar', valores: 'retirar', eslogan: 'elegir' } }))
    const s = await pedir(db, TODO)
    expect(s.cuerpo.borrador).toEqual({ estado: 'queda', queda: ['eslogan'] })
    const f = filas(db)[0]
    expect(f.documento_id).not.toBe('v1')
    expect(f.revision).toBe(18)
    expect(f.acciones).toMatchObject({ campos: { eslogan: 'Otro eslogan' }, como: { eslogan: 'elegir' }, notas: {}, libre: '', detalle: {} })
  })
  it('🔴 el mismo campo con otro texto no se borra: es otro cambio', async () => {
    const db = base(acciones({ campos: { vision: 'Otra visión, escrita después' } }))
    const s = await pedir(db, TODO)
    expect(s.cuerpo.borrador).toEqual({ estado: 'queda', queda: ['vision'] })
    expect((filas(db)[0].acciones as { campos: unknown }).campos).toEqual({ vision: 'Otra visión, escrita después' })
  })
  it('🔴 un texto libre distinto al enviado se queda', async () => {
    const db = base(acciones({ libre: 'Otra idea' }))
    expect((await pedir(db, TODO)).cuerpo.borrador).toEqual({ estado: 'queda', queda: ['texto libre'] })
  })
  it('una observación distinta se queda', async () => {
    const db = base(acciones({ notas: { mision: 'otra' } }))
    expect((await pedir(db, TODO)).cuerpo.borrador).toEqual({ estado: 'queda', queda: ['mision'] })
  })
})

describe('🔴 si el pedido falla después de lo directo', () => {
  it('sale lo directo, quedan observaciones y texto, y ya no es «versión anterior»', async () => {
    const db = base()
    const d = deps(db)
    const original = db.from.bind(db)
    let n = 0
    const conFalla = { ...d, db: { from: (t: string) => { if (t === 'plan_cambios' && ++n === 2) db.fallar['plan_cambios'] = 'caída'; return original(t) } } } as DepsDelPedido
    const s = await pedirCambiosAlManual(conFalla, { cuerpo: { client_id: C, ...TODO }, reviewer: 'emilio' })
    expect(s.status).toBe(500)
    expect(s.cuerpo).toMatchObject({ ok: false, borrador: { estado: 'queda', queda: ['mision', 'texto libre'] } })
    const f = filas(db)[0]
    expect(f.documento_id).not.toBe('v1')
    expect(f.acciones).toMatchObject({ campos: {}, notas: { mision: 'más cercana' }, libre: LIBRE })
  })
  it('🔴 un rechazo antes de escribir no toca el borrador', async () => {
    const db = base()
    expect((await pedir(db, { ...TODO, confirmo_gasto: false })).status).toBe(400)
    expect(filas(db)[0]).toMatchObject({ documento_id: 'v1', revision: 17 })
  })
  it('🔴 con una reescritura en curso tampoco', async () => {
    const db = base().semilla('plan_cambios', [{ id: 'c1', client_id: C, documento: 'manual', estado: 'en_reescritura', despertado: true }])
    expect((await pedir(db, TODO)).status).toBe(409)
    expect(filas(db)[0].revision).toBe(17)
  })
})

describe('🔴 nunca frena un pedido que ya salió', () => {
  it('si no puede tocar el borrador lo dice, y el pedido sigue en pie', async () => {
    const db = base()
    const original = db.from.bind(db)
    const rota = { from: (t: string) => (t === 'borradores_del_dueno' ? { select: () => { throw new Error('caída') } } : original(t)) }
    const s = await pedirCambiosAlManual({ ...deps(db), db: rota } as DepsDelPedido, { cuerpo: { client_id: C, ...TODO }, reviewer: 'emilio' })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ ok: true, reescribe: true, borrador: { estado: 'error' } })
    expect(db.tablas['plan_cambios']).toHaveLength(1)
  })
  it('no choca si otro equipo guardó en ese instante: no pisa', async () => {
    const db = base(acciones({ campos: { eslogan: 'Otro' } }))
    const original = db.from.bind(db)
    let n = 0
    const carrera = { from: (t: string) => { if (t === 'borradores_del_dueno' && ++n === 2) filas(db)[0].revision = 99; return original(t) } }
    await quitarDelBorrador(carrera, C, { campos: {}, notas: {}, libre: LIBRE }, AHORA)
    expect((filas(db)[0].acciones as { libre: unknown }).libre).toBe(LIBRE)
  })
})
