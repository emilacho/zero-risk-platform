/**
 * Archivo de campaña con VARIAS campañas vivas del mismo cliente (20-nov · entrega 4 de «Crear Campaña» · D3 y D4). Base falsa. US$ 0.
 * Las piezas se atan por su rastro (encargo y parte), no por fechas; sin rastro, por la hora solo si esa era la única viva. Desarchivar frena donde frena el índice.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from './dbfalsa'
import { archivarCampana, desarchivarCampana, OTRA_VIVA, RASTROS_DISTINTOS, type Db } from '../archivo-de-campana'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const VIEJA = '36e66179-3061-4a7d-94db-932a900d9515'
const NUEVA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TERCERA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const P_NUEVA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const P_VIEJA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const AHORA = new Date('2026-11-22T12:00:00Z')
const d = (x: DbFalsa) => x as unknown as Db
const filas = (x: DbFalsa, t: string) => x.tablas[t] ?? []
const pieza = (id: string, created_at: string, metadata: Record<string, unknown> = {}, status = 'pending') => ({ id, client_id: C, type: 'content_piece_review', status, created_at, metadata })
const archivada = (x: DbFalsa, id: string) => filas(x, 'hitl_queue').find((f) => f.id === id)?.archivada_en ?? null

// la vieja nació sin llave el 18; la nueva, con llave, el 20. Las dos vivas
const base = () => new DbFalsa()
  .semilla('cadena_campanas', [
    { id: VIEJA, client_id: C, estado: 'pausada', creada_en: '2026-11-18T00:00:00Z', seco: false, llave_de_campana: null },
    { id: NUEVA, client_id: C, estado: 'pausada', creada_en: '2026-11-20T00:00:00Z', seco: false, llave_de_campana: 'tablero-0a2ffbd4-1' },
    { id: 'ensayo', client_id: C, estado: 'activa', creada_en: '2026-11-17T00:00:00Z', seco: true, llave_de_campana: null },
  ])
  .semilla('cadena_calendario_filas', [{ id: 'fv', campana_id: VIEJA, estado: 'validada' }, { id: 'fn', campana_id: NUEVA, estado: 'validada' }])
  .semilla('cadena_esperas', [{ id: 1, campana_id: VIEJA, estado: 'viva' }, { id: 2, campana_id: NUEVA, estado: 'viva' }])
  .semilla('client_historical_outputs', [
    { id: P_NUEVA, output_type: 'campaign_brief_pack', provenance_tag: { campana_id: NUEVA } },
    { id: P_VIEJA, output_type: 'campaign_brief_pack', provenance_tag: { campana_id: VIEJA } },
  ])
  .semilla('oficina_encargos', [
    { id: 'e-vieja', client_id: C, estado: 'cerrado', campana_id: VIEJA, parte_id: null },
    { id: 'e-nueva-por-parte', client_id: C, estado: 'cerrado', campana_id: null, parte_id: P_NUEVA },
    { id: 'e-choca', client_id: C, estado: 'cerrado', campana_id: VIEJA, parte_id: P_NUEVA },
    { id: 'e-mudo', client_id: C, estado: 'cerrado', campana_id: null, parte_id: null },
  ])
  .semilla('hitl_queue', [
    // con rastro, todas después de que naciera la nueva: las fechas no sirven para separarlas
    pieza('v-encargo', '2026-11-21T00:00:00Z', { oficina_encargo_id: 'e-vieja' }),
    pieza('v-parte', '2026-11-21T01:00:00Z', { parte_id: P_VIEJA }),
    pieza('n-parte', '2026-11-21T02:00:00Z', { parte_id: P_NUEVA }),
    pieza('n-encargo-parte', '2026-11-21T03:00:00Z', { oficina_encargo_id: 'e-nueva-por-parte' }),
    // dos rastros que no coinciden: de ninguna
    pieza('choca', '2026-11-21T04:00:00Z', { oficina_encargo_id: 'e-choca' }),
    // sin rastro: antes de la nueva solo vivía la vieja; después, las dos
    pieza('mudo-antes', '2026-11-19T00:00:00Z', { oficina_encargo_id: 'e-mudo' }),
    pieza('mudo-despues', '2026-11-21T05:00:00Z', {}),
    // ajena: otro tipo
    { id: 'plan', client_id: C, type: 'plan_con_pendientes', status: 'pending', created_at: '2026-11-21T00:00:00Z', metadata: {} },
  ])

describe('archivar con dos campañas vivas del mismo cliente', () => {
  it('🔴 archivar la vieja se lleva solo lo suyo: por encargo, por parte y lo mudo de cuando era la única', async () => {
    const x = base()
    const r = await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(r.status).toBe(200)
    const lleva = filas(x, 'hitl_queue').filter((f) => f.archivada_en).map((f) => f.id).sort()
    expect(lleva).toEqual(['mudo-antes', 'v-encargo', 'v-parte'])
    expect(r.body).toMatchObject({ piezas: 3, filas: 1, esperas: 1 })
  })

  it('🔴 archivar la nueva se lleva solo lo suyo, aunque haya nacido después que la vieja', async () => {
    const x = base()
    const r = await archivarCampana(d(x), { campana_id: NUEVA, dry_run: false }, AHORA)
    expect(r.status).toBe(200)
    expect(filas(x, 'hitl_queue').filter((f) => f.archivada_en).map((f) => f.id).sort()).toEqual(['n-encargo-parte', 'n-parte'])
    expect(r.body).toMatchObject({ piezas: 2, encargos: 1 })
    expect(filas(x, 'oficina_encargos').filter((f) => f.archivada_en).map((f) => f.id)).toEqual(['e-nueva-por-parte'])
  })

  it('🔴 dos rastros que no coinciden: no la archiva ninguna de las dos y sale declarada', async () => {
    for (const k of [VIEJA, NUEVA]) {
      const x = base()
      const r = await archivarCampana(d(x), { campana_id: k, dry_run: false }, AHORA)
      expect(archivada(x, 'choca')).toBeNull()
      expect(r.body.sin_campana_clara).toContainEqual({ id: 'choca', motivo: RASTROS_DISTINTOS })
      expect(filas(x, 'oficina_encargos').find((f) => f.id === 'e-choca')).not.toHaveProperty('archivada_en')
    }
  })

  it('🔴 sin rastro y con otra viva a esa hora: no se archiva con ninguna y sale declarada', async () => {
    for (const k of [VIEJA, NUEVA]) {
      const x = base()
      const r = await archivarCampana(d(x), { campana_id: k, dry_run: false }, AHORA)
      expect(archivada(x, 'mudo-despues')).toBeNull()
      expect(r.body.sin_campana_clara).toContainEqual({ id: 'mudo-despues', motivo: OTRA_VIVA })
    }
  })

  it('🔴 otra campaña que TERMINA dentro de la franja: lo mudo de mientras vivía no se archiva; lo de después, sí', async () => {
    const x = base()
    x.tablas['cadena_campanas'] = x.tablas['cadena_campanas'].filter((f) => f.id !== NUEVA)
    x.semilla('cadena_campanas', [{ id: 'corta', client_id: C, estado: 'reemplazada', creada_en: '2026-11-18T06:00:00Z', archivada_en: '2026-11-18T12:00:00Z', seco: false, llave_de_campana: 'tablero-corta' }])
    x.semilla('hitl_queue', [pieza('mientras', '2026-11-18T09:00:00Z'), pieza('luego', '2026-11-18T15:00:00Z')])
    const r = await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(archivada(x, 'mientras')).toBeNull()
    expect(archivada(x, 'luego')).toBe(AHORA.toISOString())
    expect(r.body.sin_campana_clara).toContainEqual({ id: 'mientras', motivo: OTRA_VIVA })
  })

  it('🔴 una con llave sigue viva aunque después nazca otra sin llave: lo mudo de entonces no es de la nueva sin llave', async () => {
    const x = base()
    x.tablas['cadena_campanas'] = x.tablas['cadena_campanas'].filter((f) => f.id !== VIEJA)
    x.semilla('cadena_campanas', [{ id: TERCERA, client_id: C, estado: 'pausada', creada_en: '2026-11-21T00:00:00Z', seco: false, llave_de_campana: null }])
    const r = await archivarCampana(d(x), { campana_id: TERCERA, dry_run: false }, AHORA)
    expect(archivada(x, 'mudo-despues')).toBeNull()
    expect(r.body.sin_campana_clara).toContainEqual({ id: 'mudo-despues', motivo: OTRA_VIVA })
  })

  it('🔴 un ensayo (otro modo) no cuenta como otra viva', async () => {
    const x = base()
    x.semilla('hitl_queue', [pieza('antes-de-la-nueva', '2026-11-18T03:00:00Z')])
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(archivada(x, 'antes-de-la-nueva')).toBe(AHORA.toISOString())
  })

  it('🔴 no escribe nada de la otra: sus filas, esperas, piezas y encargos quedan igual', async () => {
    const x = base()
    const deLaNueva = () => JSON.stringify({
      c: filas(x, 'cadena_campanas').find((f) => f.id === NUEVA),
      f: filas(x, 'cadena_calendario_filas').filter((f) => f.campana_id === NUEVA),
      e: filas(x, 'cadena_esperas').filter((f) => f.campana_id === NUEVA),
      p: filas(x, 'hitl_queue').filter((f) => ['n-parte', 'n-encargo-parte', 'choca', 'mudo-despues', 'plan'].includes(String(f.id))),
      o: filas(x, 'oficina_encargos').filter((f) => f.id !== 'e-vieja' && f.id !== 'e-mudo'),
      h: filas(x, 'client_historical_outputs'),
    })
    const antes = deLaNueva()
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(deLaNueva()).toBe(antes)
  })

  it('🔴 en seco no escribe y ya dice qué queda declarado', async () => {
    const x = base()
    const antes = JSON.stringify(x.tablas)
    const r = await archivarCampana(d(x), { campana_id: VIEJA }, AHORA)
    expect(JSON.stringify(x.tablas)).toBe(antes)
    expect(r.body).toMatchObject({ dry_run: true, piezas: 3 })
    expect((r.body.sin_campana_clara as unknown[]).length).toBe(2)
  })

  it('🔴 repetirlo no cambia nada', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    // la hora de actualización de la campaña se mueve al repetir desde antes de este cambio: lo demás, igual
    const foto = () => JSON.stringify(x.tablas, (k, v) => (k === 'actualizada_en' ? undefined : v))
    const una = foto()
    const r = await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, new Date('2026-11-23T00:00:00Z'))
    expect(r.body).toMatchObject({ piezas: 0, filas: 0, esperas: 0 })
    expect(foto()).toBe(una)
  })

  it('🔴 si no se puede leer el rastro, no escribe nada', async () => {
    for (const t of ['oficina_encargos', 'client_historical_outputs']) {
      const x = base()
      x.fallar[t] = 'se cayó'
      const antes = JSON.stringify(x.tablas)
      const r = await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
      expect(r.status).toBe(500)
      expect(JSON.stringify(x.tablas)).toBe(antes)
    }
  })

  it('🔴 si no se pueden leer las campañas del cliente (la lectura que decide lo mudo), no escribe nada', async () => {
    const x = base()
    // la primera lectura de cadena_campanas (la campaña pedida) pasa; falla la segunda: las campañas del cliente con las que se decide lo que no tiene rastro
    let lecturas = 0
    const db = { from: (t: string) => (t === 'cadena_campanas' && ++lecturas === 2 ? x.from('__falla__') : x.from(t)) }
    x.fallar['__falla__'] = 'se cayó'
    const antes = JSON.stringify(x.tablas)
    const r = await archivarCampana(db as unknown as Db, { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(lecturas).toBeGreaterThanOrEqual(2)
    expect(r.status).toBe(500)
    expect(JSON.stringify(x.tablas)).toBe(antes)
  })

  it('🔴 el borde exacto: lo mudo en el instante en que la otra nace es de las dos (se declara); en el que la otra se archiva, ya es solo de esta', async () => {
    const x = base()
    x.tablas['cadena_campanas'] = x.tablas['cadena_campanas'].filter((f) => f.id !== NUEVA)
    x.semilla('cadena_campanas', [{ id: 'corta', client_id: C, estado: 'reemplazada', creada_en: '2026-11-18T06:00:00Z', archivada_en: '2026-11-18T12:00:00Z', seco: false, llave_de_campana: 'tablero-corta' }])
    x.semilla('hitl_queue', [pieza('al-nacer', '2026-11-18T06:00:00Z'), pieza('al-archivar', '2026-11-18T12:00:00Z')])
    const r = await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(archivada(x, 'al-nacer')).toBeNull()
    expect(r.body.sin_campana_clara).toContainEqual({ id: 'al-nacer', motivo: OTRA_VIVA })
    expect(archivada(x, 'al-archivar')).toBe(AHORA.toISOString())
  })
})

describe('desarchivar frena donde frena la base (índice una_viva_por_cliente: sin llave, ni cerrada ni reemplazada)', () => {
  it('🔴 ida y vuelta de la nueva (con llave) con la vieja viva: vuelve con sus piezas', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: NUEVA, dry_run: false }, AHORA)
    const r = await desarchivarCampana(d(x), { campana_id: NUEVA }, AHORA)
    expect(r).toMatchObject({ status: 200, body: { estado: 'pausada', piezas: 2 } })
    expect(filas(x, 'hitl_queue').filter((f) => f.archivada_en)).toHaveLength(0)
    expect(filas(x, 'cadena_campanas').find((f) => f.id === NUEVA)).toMatchObject({ estado: 'pausada', archivada_en: null })
  })

  it('🔴 la vieja (sin llave) con otra viva sin llave: 409', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    x.semilla('cadena_campanas', [{ id: 'otra-sin-llave', client_id: C, estado: 'activa', creada_en: '2026-11-22T13:00:00Z', seco: false, llave_de_campana: null }])
    expect(await desarchivarCampana(d(x), { campana_id: VIEJA }, AHORA)).toMatchObject({ status: 409, body: { error: 'hay_otra_campana' } })
  })

  it('🔴 la vieja (sin llave) con solo la nueva con llave viva: vuelve', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(await desarchivarCampana(d(x), { campana_id: VIEJA }, AHORA)).toMatchObject({ status: 200 })
  })

  it('🔴 sin llave, con la otra sin llave cerrada o reemplazada: vuelve', async () => {
    for (const estado of ['cerrada', 'reemplazada']) {
      const x = base()
      await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
      x.semilla('cadena_campanas', [{ id: 'otra-sin-llave', client_id: C, estado, creada_en: '2026-11-22T13:00:00Z', seco: false, llave_de_campana: null }])
      expect(await desarchivarCampana(d(x), { campana_id: VIEJA }, AHORA)).toMatchObject({ status: 200 })
    }
  })

  it('🔴 sin llave que vuelve a «cerrada» no choca con el índice: vuelve aunque haya otra viva sin llave', async () => {
    const x = base()
    Object.assign(x.tablas['cadena_campanas'][0], { estado: 'cerrada' })
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    x.semilla('cadena_campanas', [{ id: 'otra-sin-llave', client_id: C, estado: 'activa', creada_en: '2026-11-22T13:00:00Z', seco: false, llave_de_campana: null }])
    expect(await desarchivarCampana(d(x), { campana_id: VIEJA }, AHORA)).toMatchObject({ status: 200, body: { estado: 'cerrada' } })
  })

  it('🔴 otra viva sin llave pero en otro modo (ensayo) no frena', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: VIEJA, dry_run: false }, AHORA)
    expect(filas(x, 'cadena_campanas').find((f) => f.id === 'ensayo')).toMatchObject({ estado: 'activa', seco: true })
    expect(await desarchivarCampana(d(x), { campana_id: VIEJA }, AHORA)).toMatchObject({ status: 200 })
  })
})
