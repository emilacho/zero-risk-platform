/**
 * Métricas de redes (02-nov). La base es falsa; la vista `metricas_publicacion_ultima` se siembra como la entregaría Postgres. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '@/lib/oficina/__tests__/dbfalsa'
import { esPropia, interaccionDe, leerResumen, MAX_MEJORES_PIEZAS, registrarMetricas, vincularPieza, type Db } from '../metricas'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const OTRO = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const AHORA = new Date('2026-11-02T12:00:00Z')
const db = () => new DbFalsa()
const d = (x: DbFalsa) => x as unknown as Db
const cuerpo = (extra: Record<string, unknown> = {}) => ({ client_id: C, red: 'instagram', fuente: 'publico', dia: '2026-11-02', cuenta: { cuenta_externa: '64374967298', handle: 'naufrago.ec', seguidores: 1235 }, publicaciones: [{ post_externo: 'p1', autor: 'naufrago.ec', me_gusta: 10, comentarios: 2, vistas: 100 }, { post_externo: 'p2', autor: 'foillifepodcast', me_gusta: 500, vistas: 30546 }], ...extra })
const filas = (x: DbFalsa, t: string) => x.tablas[t] ?? []

describe('registrar', () => {
  it('🔴 lo que no se midió queda sin escribir, nunca en cero', async () => {
    const x = db()
    const r = await registrarMetricas(d(x), cuerpo(), AHORA)
    expect(r.status).toBe(200)
    const m = filas(x, 'metricas_publicacion_mediciones')[0]
    expect(m).toMatchObject({ me_gusta: 10, comentarios: 2, vistas: 100 })
    expect(m).not.toHaveProperty('guardados')
    expect(m).not.toHaveProperty('alcance')
    expect(filas(x, 'metricas_cuenta_mediciones')[0]).toMatchObject({ seguidores: 1235 })
    expect(filas(x, 'metricas_cuenta_mediciones')[0]).not.toHaveProperty('alcance')
  })

  it('🔴 Instagram oculta con -1, o manda texto: es «sin dato»', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo({ publicaciones: [{ post_externo: 'p1', autor: 'naufrago.ec', me_gusta: -1, comentarios: '5' }] }), AHORA)
    const m = filas(x, 'metricas_publicacion_mediciones')[0]
    expect(m).not.toHaveProperty('me_gusta')
    expect(m).not.toHaveProperty('comentarios')
  })

  it('🔴 solo es propia si el autor es la cuenta; sin autor no se sabe', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo({ publicaciones: [{ post_externo: 'a', autor: '@Naufrago.EC' }, { post_externo: 'b', autor: 'otra' }, { post_externo: 'c' }] }), AHORA)
    const por = Object.fromEntries(filas(x, 'metricas_publicaciones').map((f) => [f.post_externo, f.es_propia]))
    expect(por).toMatchObject({ a: true, b: false })
    expect(por.c).toBeUndefined()
    expect(esPropia(' @Naufrago.EC ', 'naufrago.ec')).toBe(true)
    expect(esPropia(null, 'x')).toBeNull()
    expect(esPropia('x', null)).toBeNull()
  })

  it('🔴 repetir el día no duplica, y lo no medido no pisa lo que ya estaba', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo(), AHORA)
    await registrarMetricas(d(x), cuerpo({ publicaciones: [{ post_externo: 'p1', autor: 'naufrago.ec', comentarios: 3 }] }), AHORA)
    expect(filas(x, 'metricas_cuentas')).toHaveLength(1)
    expect(filas(x, 'metricas_cuenta_mediciones')).toHaveLength(1)
    expect(filas(x, 'metricas_publicaciones')).toHaveLength(2)
    expect(filas(x, 'metricas_publicacion_mediciones')).toHaveLength(2)
    expect(filas(x, 'metricas_publicacion_mediciones').find((f) => f.comentarios === 3)).toMatchObject({ me_gusta: 10 })
  })

  it('🔴 otro día es otra medición: guarda la historia', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo(), AHORA)
    await registrarMetricas(d(x), cuerpo({ dia: '2026-11-03' }), AHORA)
    expect(filas(x, 'metricas_cuenta_mediciones')).toHaveLength(2)
    expect(filas(x, 'metricas_publicaciones')).toHaveLength(2)
  })

  it('🔴 en seco no escribe', async () => {
    const x = db()
    const r = await registrarMetricas(d(x), cuerpo({ dry_run: true }), AHORA)
    expect(r.body).toMatchObject({ ok: true, dry_run: true, publicaciones: 2 })
    expect(filas(x, 'metricas_cuentas')).toHaveLength(0)
  })

  it('🔴 lo raspado no rebaja una cuenta con acceso oficial', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo({ fuente: 'api' }), AHORA)
    expect(filas(x, 'metricas_cuentas')[0]).toMatchObject({ acceso: 'api' })
    await registrarMetricas(d(x), cuerpo({ fuente: 'publico', dia: '2026-11-03' }), AHORA)
    expect(filas(x, 'metricas_cuentas')[0]).toMatchObject({ acceso: 'api' })
  })

  it('el vínculo con la pieza no se escribe desde aquí', async () => {
    const x = db()
    await registrarMetricas(d(x), cuerpo({ publicaciones: [{ post_externo: 'p1', autor: 'naufrago.ec', hitl_id: OTRO, agentes: ['x'] }] }), AHORA)
    expect(filas(x, 'metricas_publicaciones')[0]).not.toHaveProperty('hitl_id')
    expect(filas(x, 'metricas_publicaciones')[0]).not.toHaveProperty('agentes')
  })

  it('un post sin identificador se descarta y se declara; el resto entra', async () => {
    const x = db()
    const r = await registrarMetricas(d(x), cuerpo({ publicaciones: [{ autor: 'naufrago.ec' }, { post_externo: 'p1', autor: 'naufrago.ec' }] }), AHORA)
    expect(r.body).toMatchObject({ publicaciones: 1, descartadas: 1 })
  })

  it.each([
    ['client_id', { client_id: 'x' }], ['red', { red: 'Insta Gram' }], ['fuente', { fuente: 'otra' }], ['dia', { dia: 'ayer' }], ['cuenta', { cuenta: {} }], ['publicaciones', { publicaciones: 'x' }],
  ])('rechaza %s inválido', async (_n, extra) => {
    expect((await registrarMetricas(d(db()), cuerpo(extra), AHORA)).status).toBe(400)
  })

  it('una red nueva entra sin cambiar nada', async () => {
    expect((await registrarMetricas(d(db()), cuerpo({ red: 'google_maps', publicaciones: undefined, cuenta: { cuenta_externa: 'cid1', puntaje: 4.6, resenas: 120 } }), AHORA)).status).toBe(200)
  })

  it.each(['metricas_cuentas', 'metricas_cuenta_mediciones', 'metricas_publicaciones', 'metricas_publicacion_mediciones'])('🔴 si falla %s lo dice, no responde ok', async (tabla) => {
    const x = db()
    x.fallar[tabla] = 'caída'
    expect((await registrarMetricas(d(x), cuerpo(), AHORA)).status).toBe(500)
  })

  it('🔴 un cliente que no existe recibe un 404 claro', async () => {
    const falsa = { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'violates foreign key', code: '23503' } }) }) }) }) }
    expect(await registrarMetricas(falsa as unknown as Db, cuerpo(), AHORA)).toMatchObject({ status: 404, body: { error: 'sin_cliente' } })
  })

  it('🔴 si la base falla lo dice, no responde ok', async () => {
    const x = db()
    x.fallar['metricas_publicacion_mediciones'] = 'caída'
    const r = await registrarMetricas(d(x), cuerpo(), AHORA)
    expect(r.status).toBe(500)
  })
})

describe('vincular con la pieza', () => {
  const P = '11111111-1111-4111-8111-111111111111'
  const H = '22222222-2222-4222-8222-222222222222'
  const R = '33333333-3333-4333-8333-333333333333'
  const E = '44444444-4444-4444-8444-444444444444'
  const base = (clienteDeLaPieza = C) => db().semilla('metricas_publicaciones', [{ id: P, client_id: C }]).semilla('hitl_queue', [{ id: H, client_id: clienteDeLaPieza, metadata: { jefatura_revision_id: R, oficina_encargo_id: E } }]).semilla('jefatura_revisiones', [{ id: R, productores: [{ donde: 'texto', agente: 'content-creator' }] }])

  it('🔴 copia a los autores de la revisión', async () => {
    const x = base()
    const r = await vincularPieza(d(x), { publicacion_id: P, hitl_id: H }, AHORA)
    expect(r.status).toBe(200)
    expect(filas(x, 'metricas_publicaciones')[0]).toMatchObject({ hitl_id: H, oficina_encargo_id: E, agentes: [{ donde: 'texto', agente: 'content-creator' }] })
  })

  it('🔴 no vincula una pieza de otro cliente', async () => {
    const x = base(OTRO)
    expect((await vincularPieza(d(x), { publicacion_id: P, hitl_id: H }, AHORA)).status).toBe(409)
    expect(filas(x, 'metricas_publicaciones')[0]).not.toHaveProperty('hitl_id')
  })

  it('🔴 volver a vincular una pieza sin revisión no borra a los autores ya copiados', async () => {
    const x = base()
    await vincularPieza(d(x), { publicacion_id: P, hitl_id: H }, AHORA)
    x.tablas['hitl_queue'][0].metadata = {}
    expect((await vincularPieza(d(x), { publicacion_id: P, hitl_id: H }, AHORA)).status).toBe(200)
    expect(filas(x, 'metricas_publicaciones')[0].agentes).toEqual([{ donde: 'texto', agente: 'content-creator' }])
  })

  it('🔴 un encargo que no es uuid no llega a la base', async () => {
    const x = base()
    x.tablas['hitl_queue'][0].metadata = { oficina_encargo_id: 'no-es-uuid' }
    expect((await vincularPieza(d(x), { publicacion_id: P, hitl_id: H }, AHORA)).status).toBe(200)
    expect(filas(x, 'metricas_publicaciones')[0]).not.toHaveProperty('oficina_encargo_id')
  })

  it('sin publicación, sin pieza o sin ids, no escribe', async () => {
    expect((await vincularPieza(d(base()), { publicacion_id: H, hitl_id: H }, AHORA)).status).toBe(404)
    expect((await vincularPieza(d(base()), { publicacion_id: P, hitl_id: P }, AHORA)).status).toBe(404)
    expect((await vincularPieza(d(base()), { publicacion_id: 'x', hitl_id: H }, AHORA)).status).toBe(400)
  })
})

describe('leer', () => {
  const K = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const base = () => db().semilla('metricas_cuentas', [{ id: K, client_id: C, red: 'instagram', handle: 'naufrago.ec', acceso: 'publico', activo: true }, { id: 'apagada', client_id: C, red: 'facebook', activo: false }, { id: 'ajena', client_id: OTRO, red: 'instagram', activo: true }]).semilla('metricas_cuenta_mediciones', [
    { cuenta_id: K, dia: '2026-10-20', fuente: 'publico', seguidores: 1233, medido_en: 'm1' },
    { cuenta_id: K, dia: '2026-11-02', fuente: 'publico', seguidores: 1235, medido_en: 'm2' },
    { cuenta_id: 'ajena', dia: '2026-11-02', fuente: 'publico', seguidores: 999 },
  ])
  const post = (id: string, extra: Record<string, unknown> = {}) => ({ id, client_id: C, red: 'instagram', es_propia: true, agentes: [], ...extra })

  it('🔴 sin ningún dato, todo es nulo y no cero, y las redes se declaran', async () => {
    const r = await leerResumen(d(db()), C, undefined, AHORA)
    expect(r.body.general).toMatchObject({ seguidores: null, crecimiento_seguidores: null, interaccion: null, vistas: null, redes_con_dato: 0 })
    expect((r.body.general as { redes_sin_dato: string[] }).redes_sin_dato).toEqual(expect.arrayContaining(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube']))
    expect(r.body.por_red).toEqual([])
    expect(r.body.mejores_piezas).toEqual([])
  })

  it('🔴 por red: el último dato y su crecimiento, solo de este cliente y solo cuentas activas', async () => {
    const r = await leerResumen(d(base()), C, 30, AHORA)
    const pr = r.body.por_red as Array<Record<string, unknown>>
    expect(pr).toHaveLength(1)
    expect(pr[0]).toMatchObject({ red: 'instagram', seguidores: 1235, crecimiento_seguidores: 2, acceso: 'publico', actualizado_en: 'm2' })
    expect(r.body.general).toMatchObject({ seguidores: 1235, crecimiento_seguidores: 2, redes_con_dato: 1 })
    expect((r.body.general as { redes_sin_dato: string[] }).redes_sin_dato).not.toContain('instagram')
  })

  it('🔴 fuera de la ventana no cuenta', async () => {
    const pr = (await leerResumen(d(base()), C, 5, AHORA)).body.por_red as Array<Record<string, unknown>>
    expect(pr[0]).toMatchObject({ seguidores: 1235, crecimiento_seguidores: 0 })
    expect(pr[0].serie).toHaveLength(1)
  })

  it('🔴 el mismo día manda el acceso oficial, en cualquier orden', async () => {
    for (const orden of [['publico', 'api'], ['api', 'publico']]) {
      const x = db().semilla('metricas_cuentas', [{ id: K, client_id: C, red: 'instagram', activo: true }]).semilla('metricas_cuenta_mediciones', orden.map((fuente) => ({ cuenta_id: K, dia: '2026-11-02', fuente, seguidores: fuente === 'api' ? 2000 : 1000 })))
      const pr = (await leerResumen(d(x), C, 30, AHORA)).body.por_red as Array<Record<string, unknown>>
      expect(pr[0].seguidores).toBe(2000)
    }
  })

  it('🔴 mejores piezas: solo propias, ordenadas, hasta 8; una sin interacción no entra', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`)
    const x = db().semilla('metricas_publicaciones', [...ids.map((id) => post(id)), post('ajena', { es_propia: false }), post('sin_dato'), post('de_otro', { client_id: OTRO })]).semilla('metricas_publicacion_ultima', [
      ...ids.map((id, i) => ({ publicacion_id: id, dia: '2026-11-02', me_gusta: i * 10, comentarios: 1 })),
      { publicacion_id: 'ajena', dia: '2026-11-02', me_gusta: 99999 },
      { publicacion_id: 'sin_dato', dia: '2026-11-02', vistas: 5 },
      { publicacion_id: 'de_otro', dia: '2026-11-02', me_gusta: 88888 },
    ])
    const r = await leerResumen(d(x), C, 30, AHORA)
    const m = r.body.mejores_piezas as Array<{ interaccion: number }>
    expect(m).toHaveLength(MAX_MEJORES_PIEZAS)
    expect(m[0].interaccion).toBe(91)
    expect(m.map((p) => p.interaccion)).toEqual([...m.map((p) => p.interaccion)].sort((a, b) => b - a))
    expect(r.body.general).toMatchObject({ vistas: 5 })
  })

  it('🔴 una pieza medida pero sin interacción no entra a las mejores, aunque haya lugar', async () => {
    const x = db().semilla('metricas_publicaciones', [post('a'), post('b')]).semilla('metricas_publicacion_ultima', [{ publicacion_id: 'a', dia: '2026-11-02', me_gusta: 1 }, { publicacion_id: 'b', dia: '2026-11-02', vistas: 5 }])
    expect((await leerResumen(d(x), C, 30, AHORA)).body.mejores_piezas).toHaveLength(1)
  })

  it('🔴 lo general no suma alcance entre redes: una persona puede estar en varias', async () => {
    const x = db().semilla('metricas_publicaciones', [post('a')]).semilla('metricas_publicacion_ultima', [{ publicacion_id: 'a', dia: '2026-11-02', me_gusta: 1, alcance: 500 }])
    expect((await leerResumen(d(x), C, 30, AHORA)).body.general).not.toHaveProperty('alcance')
  })

  it('🔴 la interacción suma lo que existe; sin nada es nula', () => {
    expect(interaccionDe({ me_gusta: 3, comentarios: 2, guardados: null })).toBe(5)
    expect(interaccionDe({ guardados: 1, compartidos: 1 })).toBe(2)
    expect(interaccionDe({ vistas: 10 })).toBeNull()
    expect(interaccionDe({ me_gusta: 0 })).toBe(0)
  })

  it('🔴 con la forma real: de 12 posts, solo suman los 4 de la cuenta', async () => {
    const autores = ['foillifepodcast', 'onc.drink', 'alio.farm', 'naufrago.ec', 'onc.drink', 'casaolonchehotel', 'naufrago.ec', 'thegoodlifeec', 'naufrago.ec', 'rukutuio', 'naufrago.ec', 'marlove_333']
    const x = db()
    await registrarMetricas(d(x), cuerpo({ publicaciones: autores.map((autor, i) => ({ post_externo: `p${i}`, autor, me_gusta: 100, comentarios: 1, vistas: 1000 })) }), AHORA)
    expect(filas(x, 'metricas_publicaciones').filter((f) => f.es_propia === true)).toHaveLength(4)
    // la vista de Postgres se ensaya aparte: aquí se arma con lo escrito
    x.semilla('metricas_publicacion_ultima', filas(x, 'metricas_publicacion_mediciones'))
    const r = await leerResumen(d(x), C, 30, AHORA)
    expect(r.body.general).toMatchObject({ vistas: 4000, interaccion: 404 })
    const m = r.body.mejores_piezas as Array<Record<string, unknown>>
    expect(m).toHaveLength(4)
    expect(m[0].interaccion_incluye).toEqual(['me_gusta', 'comentarios'])
  })

  it('el vínculo llega al tablero; sin él, pieza nula', async () => {
    const x = db().semilla('metricas_publicaciones', [post('a', { hitl_id: 'h1', oficina_encargo_id: 'e1', agentes: [{ agente: 'content-creator' }] }), post('b')]).semilla('metricas_publicacion_ultima', [{ publicacion_id: 'a', dia: '2026-11-02', me_gusta: 9 }, { publicacion_id: 'b', dia: '2026-11-02', me_gusta: 1 }])
    const m = (await leerResumen(d(x), C, 30, AHORA)).body.mejores_piezas as Array<Record<string, unknown>>
    expect(m[0]).toMatchObject({ pieza: { hitl_id: 'h1', oficina_encargo_id: 'e1' }, agentes: [{ agente: 'content-creator' }] })
    expect(m[1]).toMatchObject({ pieza: null, agentes: [] })
  })

  it('rechaza un cliente inválido y topa los días', async () => {
    expect((await leerResumen(d(db()), 'x', 30, AHORA)).status).toBe(400)
    expect((await leerResumen(d(db()), C, 5000, AHORA)).body.dias).toBe(90)
    expect((await leerResumen(d(db()), C, 'x', AHORA)).body.dias).toBe(30)
  })

  it('🔴 si la base falla lo dice', async () => {
    const x = base()
    x.fallar['metricas_cuenta_mediciones'] = 'caída'
    expect((await leerResumen(d(x), C, 30, AHORA)).status).toBe(500)
  })
})
