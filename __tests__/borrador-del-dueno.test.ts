/**
 * 3-nov · Emilio: eligió un eslogan, se le cerró el manual y la elección desapareció. Lo que marca y no pide queda en la plataforma, por cliente y documento.
 * Sin red: la base es la de pruebas.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { borrarBorrador, guardarBorrador, hayBorrador, leerBorrador } from '../src/lib/manual/borrador-del-dueno'
import { rutaValidarManual } from '../src/lib/manual/edicion-rutas'
import { TOPE_REAL_DEL_PEDIDO } from '../src/lib/limites-de-tamano'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AHORA = new Date('2026-11-03T18:30:00Z')
const base = () => new DbFalsa().semilla('borradores_del_dueno', [])
const CUERPO = { client_id: C, documento: 'manual', documento_id: 'v3', acciones: { elegir: { eslogan: 'Mar y fuego' } } }
const filas = (db: DbFalsa) => db.tablas['borradores_del_dueno']

describe('🔴 se guarda y se retoma', () => {
  it('guarda lo que marcó, con su versión, y se lee igual desde otro equipo', async () => {
    const db = base()
    const g = await guardarBorrador(db, CUERPO, AHORA)
    expect(g.status).toBe(200)
    expect(g.cuerpo.borrador).toMatchObject({ documento_id: 'v3', revision: 1, acciones: CUERPO.acciones, actualizado_en: AHORA.toISOString(), actualizado_por: 'emilio' })
    expect((await leerBorrador(db, C, 'manual')).cuerpo.borrador).toMatchObject({ acciones: CUERPO.acciones, documento_id: 'v3' })
  })

  it('sin borrador devuelve null, no un error', async () => {
    expect(await leerBorrador(base(), C, 'manual')).toMatchObject({ status: 200, cuerpo: { ok: true, borrador: null } })
  })

  it('🔴 guardar otra vez actualiza la misma fila y sube la revisión', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    const g = await guardarBorrador(db, { ...CUERPO, acciones: { retirar: ['vision'] }, revision_base: 1 }, AHORA)
    expect(g.cuerpo.borrador).toMatchObject({ revision: 2, acciones: { retirar: ['vision'] } })
    expect(filas(db)).toHaveLength(1)
  })

  it('🔴 manual y plan, y cada cliente, llevan su propio borrador', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    await guardarBorrador(db, { ...CUERPO, documento: 'plan', documento_id: 'p1' }, AHORA)
    await guardarBorrador(db, { ...CUERPO, client_id: OTRO }, AHORA)
    expect(filas(db)).toHaveLength(3)
    await borrarBorrador(db, C, 'manual')
    expect((await leerBorrador(db, C, 'plan')).cuerpo.borrador).toMatchObject({ documento_id: 'p1' })
    expect((await leerBorrador(db, OTRO, 'manual')).cuerpo.borrador).toMatchObject({ documento_id: 'v3' })
  })
})

describe('🔴 dos equipos no se pisan', () => {
  it('quien guarda sobre una revisión vieja recibe 409 con la vigente, y no escribe', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    await guardarBorrador(db, { ...CUERPO, acciones: { a: 1 }, revision_base: 1 }, AHORA)
    const g = await guardarBorrador(db, { ...CUERPO, acciones: { b: 2 }, revision_base: 1 }, AHORA)
    expect(g).toMatchObject({ status: 409, cuerpo: { ok: false, error: 'borrador_cambio', borrador: { revision: 2, acciones: { a: 1 } } } })
    expect(filas(db)[0].acciones).toEqual({ a: 1 })
  })

  it('revisión 0 significa «no había nada»: si ya hay, choca', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    expect((await guardarBorrador(db, { ...CUERPO, revision_base: 0 }, AHORA)).status).toBe(409)
    const nueva = base()
    expect((await guardarBorrador(nueva, { ...CUERPO, revision_base: 0 }, AHORA)).status).toBe(200)
  })

  it('🔴 una pantalla vieja que guarda «vacío» no borra lo que otro equipo marcó', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    await guardarBorrador(db, { ...CUERPO, acciones: { a: 1 }, revision_base: 1 }, AHORA)
    expect((await guardarBorrador(db, { ...CUERPO, acciones: {}, revision_base: 1 }, AHORA)).status).toBe(409)
    expect(filas(db)[0].acciones).toEqual({ a: 1 })
    expect((await guardarBorrador(db, { ...CUERPO, acciones: {}, revision_base: 2 }, AHORA)).status).toBe(200)
    expect(filas(db)).toHaveLength(0)
  })

  it('🔴 si otro equipo crea el borrador entre la lectura y el guardado, choca y devuelve el suyo', async () => {
    const db = base()
    let n = 0
    const carrera = { from: (t: string) => { if (++n === 2) filas(db).push({ client_id: C, documento: 'manual', documento_id: 'v3', acciones: { suyo: 1 }, revision: 1 }); return db.from(t) } }
    expect(await guardarBorrador(carrera, CUERPO, AHORA)).toMatchObject({ status: 409, cuerpo: { error: 'borrador_cambio', borrador: { acciones: { suyo: 1 } } } })
    expect(filas(db)).toHaveLength(1)
  })

  it('🔴 si otro cambio entra entre la lectura y la escritura, tampoco lo pisa', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    let n = 0
    const carrera = { from: (t: string) => { if (++n === 2) filas(db)[0].revision = 9; return db.from(t) } }
    expect((await guardarBorrador(carrera, { ...CUERPO, acciones: { b: 2 } }, AHORA)).status).toBe(409)
    expect(filas(db)[0].acciones).toEqual(CUERPO.acciones)
  })
})

describe('🔴 fin del borrador', () => {
  it('descartar lo borra', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    expect((await borrarBorrador(db, C, 'manual')).cuerpo).toMatchObject({ ok: true, borrador: null })
    expect(filas(db)).toHaveLength(0)
  })

  it('🔴 guardar sin acciones lo borra: un borrador vacío no frena aprobar', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    await guardarBorrador(db, { ...CUERPO, acciones: {} }, AHORA)
    expect(await hayBorrador(db, C, 'manual')).toEqual({ hay: false })
  })

  it('🔴 seguir un borrador viejo sobre la versión nueva actualiza a qué versión pertenece', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    const g = await guardarBorrador(db, { ...CUERPO, documento_id: 'v4' }, AHORA)
    expect(g.cuerpo.borrador).toMatchObject({ documento_id: 'v4', acciones: CUERPO.acciones })
  })
})

describe('🔴 entradas malas no escriben', () => {
  it.each<[string, Record<string, unknown>]>([
    ['cliente inválido', { client_id: 'no' }],
    ['documento que no existe', { documento: 'pieza' }],
    ['acciones que no son objeto', { acciones: [] }],
    ['sin versión', { documento_id: ' ' }],
    ['revisión inválida', { revision_base: 'x' }],
    ['por encima del tope', { acciones: { t: 'a'.repeat(TOPE_REAL_DEL_PEDIDO) } }],
  ])('%s', async (_n, extra) => {
    const db = base()
    expect((await guardarBorrador(db, { ...CUERPO, ...extra }, AHORA)).status).toBe(400)
    expect(filas(db)).toHaveLength(0)
  })

  it('🔴 si la base falla lo dice', async () => {
    const db = base()
    db.fallar['borradores_del_dueno'] = 'caída'
    expect((await guardarBorrador(db, CUERPO, AHORA)).status).toBe(502)
    expect((await leerBorrador(db, C, 'manual')).status).toBe(502)
    expect((await borrarBorrador(db, C, 'manual')).status).toBe(502)
  })
})

describe('🔴 4-nov · el falso «cambió en otro equipo» (Emilio, 08:50Z)', () => {
  const VACIO_DEL_PANEL = { campos: {}, como: {}, notas: {}, libre: '', detalle: {} }
  const conFilaVacia = () => base().semilla('borradores_del_dueno', [{ client_id: C, documento: 'manual', documento_id: 'v3', acciones: VACIO_DEL_PANEL, revision: 5, actualizado_por: 'emilio' }])

  it('🔴 «Descartar todo» manda las claves del panel sin nada: eso borra la fila', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    const g = await guardarBorrador(db, { ...CUERPO, acciones: VACIO_DEL_PANEL, revision_base: 1 }, AHORA)
    expect(g).toMatchObject({ status: 200, cuerpo: { ok: true, borrador: null } })
    expect(filas(db)).toHaveLength(0)
  })

  it.each([
    ['solo espacios', { ...VACIO_DEL_PANEL, libre: '   ' }],
    ['listas vacías', { retirar: [], observaciones: [] }],
    ['listas de vacíos', { retirar: ['', '  '], observaciones: [{ campo: '', texto: null }] }],
    ['null', { libre: null }],
  ])('🔴 %s también es vacío', async (_n, acciones) => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    await guardarBorrador(db, { ...CUERPO, acciones }, AHORA)
    expect(filas(db)).toHaveLength(0)
  })

  it.each([
    ['texto libre', { ...VACIO_DEL_PANEL, libre: 'Hazlo más cercano' }],
    ['un campo elegido', { ...VACIO_DEL_PANEL, campos: { eslogan: 'Mar y fuego' } }],
    ['un número', { peso: 0 }],
    ['un falso', { marcado: false }],
  ])('%s no es vacío: se guarda', async (_n, acciones) => {
    const db = base()
    await guardarBorrador(db, { ...CUERPO, acciones }, AHORA)
    expect(filas(db)).toHaveLength(1)
  })

  it('🔴 lo que le pasó a Emilio: fila vacía de otra sesión + escribir con revisión 0: no hay choque, y su texto queda', async () => {
    const db = conFilaVacia()
    const g = await guardarBorrador(db, { ...CUERPO, acciones: { ...VACIO_DEL_PANEL, libre: 'Mi observación' }, revision_base: 0 }, AHORA)
    expect(g).toMatchObject({ status: 200, cuerpo: { ok: true, borrador: { revision: 6, acciones: { libre: 'Mi observación' } } } })
  })

  it('🔴 un choque real sigue siendo choque: el otro equipo sí dejó algo', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    expect((await guardarBorrador(db, { ...CUERPO, acciones: { ...VACIO_DEL_PANEL, libre: 'Otro' }, revision_base: 0 }, AHORA)).status).toBe(409)
    expect(filas(db)[0].acciones).toEqual(CUERPO.acciones)
  })

  it('🔴 una fila vacía no frena aprobar el manual', async () => {
    expect(await hayBorrador(conFilaVacia(), C, 'manual')).toEqual({ hay: false })
  })
  it('una con algo sí', async () => {
    const db = base()
    await guardarBorrador(db, CUERPO, AHORA)
    expect(await hayBorrador(db, C, 'manual')).toEqual({ hay: true })
  })
})

describe('🔴 si no puede leer lo que hay', () => {
  it('no escribe a ciegas: un error de lectura no es «no hay borrador»', async () => {
    const db = base()
    const insert = vi.fn()
    const rota = { select: () => rota, eq: () => rota, limit: async () => ({ data: null, error: { message: 'caída' } }), insert }
    expect((await guardarBorrador({ from: () => rota }, CUERPO, AHORA)).status).toBe(502)
    expect(insert).not.toHaveBeenCalled()
    expect(filas(db)).toHaveLength(0)
  })
})

describe('🔴 aprobar el manual', () => {
  const conManual = () => base().semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, content_text: '{}', provenance_tag: {} }]).semilla('plan_cambios', []).semilla('plan_corridas', [])
  const deps = (db: DbFalsa) => ({ db, ahora: () => AHORA, cerebro: { env: { baseUrl: 'x', internalKey: 'k' } }, empujarManual: () => ({ estado: 'agendado' }), pedirPlan: vi.fn(async () => ({ pedido: true as const, repetido: false, event_id: 'e1' })) })

  it('con borrador no deja aprobar ni pide el plan', async () => {
    const db = conManual(), d = deps(db)
    await guardarBorrador(db, CUERPO, AHORA)
    const s = await rutaValidarManual(d, C, 'emilio')
    expect(s.status).toBe(409)
    expect(s.body).toMatchObject({ ok: false, error: 'borrador_pendiente' })
    expect(d.pedirPlan).not.toHaveBeenCalled()
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })

  it('el borrador del plan no frena aprobar el manual, y sin borrador aprueba', async () => {
    const db = conManual(), d = deps(db)
    await guardarBorrador(db, { ...CUERPO, documento: 'plan', documento_id: 'p1' }, AHORA)
    expect((await rutaValidarManual(d, C, 'emilio')).status).toBe(200)
  })

  it('🔴 si no puede leer el borrador no aprueba a ciegas', async () => {
    const db = conManual(), d = deps(db)
    db.fallar['borradores_del_dueno'] = 'caída'
    expect((await rutaValidarManual(d, C, 'emilio')).status).toBe(502)
    expect(d.pedirPlan).not.toHaveBeenCalled()
  })
})

describe('la tabla', () => {
  const sql = readFileSync('supabase/migrations/202611031900_borradores_del_dueno.sql', 'utf8')
  it('🔴 sin permisos nadie la ve; solo el rol de servicio la toca, y hay uno por cliente y documento', () => {
    expect(sql).toMatch(/grant select, insert, update, delete on public\.borradores_del_dueno to service_role/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on public\.borradores_del_dueno from public, anon, authenticated/)
    expect(sql).toMatch(/unique \(client_id, documento\)/)
  })
})
