/**
 * Archivo de una campaña anterior (03-nov · pedido por Emilio). Base falsa. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from './dbfalsa'
import { motivoDeReemplazo } from '@/lib/direccion/decisiones-reemplazadas'
import { archivarCampana, desarchivarCampana, MOTIVO_DE_ARCHIVO, recuperarPieza, type Db } from '../archivo-de-campana'

const K = '8168f32b-47d9-466a-9350-3dff31700a58'
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const OTRO = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const H1 = '11111111-1111-4111-8111-111111111111'
const H2 = '22222222-2222-4222-8222-222222222222'
const H3 = '33333333-3333-4333-8333-333333333333'
const H4 = '44444444-4444-4444-8444-444444444444'
const E1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const AHORA = new Date('2026-11-03T12:00:00Z')
const d = (x: DbFalsa) => x as unknown as Db
const filas = (x: DbFalsa, t: string) => x.tablas[t] ?? []

const base = () => new DbFalsa()
  .semilla('cadena_campanas', [{ id: K, client_id: C, estado: 'pausada', estado_motivo: 'pausa de pruebas', creada_en: '2026-10-30T00:00:00Z', seco: false }])
  .semilla('cadena_calendario_filas', [{ id: 'f1', campana_id: K, estado: 'validada' }, { id: 'f2', campana_id: K, estado: 'espera_video' }, { id: 'ajena', campana_id: 'otra', estado: 'validada' }])
  .semilla('cadena_esperas', [{ id: 1, campana_id: K, estado: 'viva', accion_al_vencer: 'fila_sale' }, { id: 2, campana_id: K, estado: 'resuelta' }, { id: 3, campana_id: K, estado: 'cancelada' }, { id: 4, campana_id: 'otra', estado: 'viva' }])
  .semilla('hitl_queue', [
    { id: H1, client_id: C, type: 'content_piece_review', status: 'rejected', created_at: '2026-10-31T00:00:00Z', decision: { vencida: true }, reviewer: 'sistema', metadata: { oficina_encargo_id: E1 } },
    { id: H2, client_id: C, type: 'content_piece_review', status: 'approved', created_at: '2026-10-31T00:00:00Z', metadata: {} },
    { id: H3, client_id: C, type: 'content_piece_review', status: 'rejected', created_at: '2026-10-01T00:00:00Z', metadata: {} },
    { id: H4, client_id: OTRO, type: 'content_piece_review', status: 'rejected', created_at: '2026-10-31T00:00:00Z', metadata: {} },
    { id: 'plan', client_id: C, type: 'plan_con_pendientes', status: 'pending', created_at: '2026-10-31T00:00:00Z', metadata: {} },
  ])
  .semilla('oficina_encargos', [{ id: E1, client_id: C, estado: 'cerrado' }, { id: 'otro', client_id: C, estado: 'cerrado' }])

describe('archivar', () => {
  it('🔴 sin dry_run:false no escribe nada y dice qué haría', async () => {
    const x = base()
    const antes = JSON.stringify(x.tablas)
    const r = await archivarCampana(d(x), { campana_id: K }, AHORA)
    expect(r.body).toMatchObject({ ok: true, dry_run: true, estado_actual: 'pausada', filas: 2, esperas: 1, piezas: 1, encargos: 1, aprobadas_sin_archivar: [H2] })
    expect(JSON.stringify(x.tablas)).toBe(antes)
  })

  it('🔴 marca sin tocar el estado de filas ni piezas, y no borra nada', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'f1')).toMatchObject({ estado: 'validada', archivada_en: AHORA.toISOString(), archivo_motivo: MOTIVO_DE_ARCHIVO })
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'f2')).toMatchObject({ estado: 'espera_video', archivo_motivo: MOTIVO_DE_ARCHIVO })
    expect(filas(x, 'hitl_queue').find((f) => f.id === H1)).toMatchObject({ status: 'rejected', archivo_motivo: MOTIVO_DE_ARCHIVO })
    expect(filas(x, 'oficina_encargos').find((f) => f.id === E1)).toMatchObject({ estado: 'cerrado', archivo_motivo: MOTIVO_DE_ARCHIVO })
    expect(filas(x, 'cadena_calendario_filas')).toHaveLength(3)
    expect(filas(x, 'hitl_queue')).toHaveLength(5)
  })

  it('🔴 la campaña queda reemplazada, guardando de dónde venía', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado: 'reemplazada', estado_motivo: MOTIVO_DE_ARCHIVO, estado_antes_de_archivar: 'pausada', motivo_antes_de_archivar: 'pausa de pruebas' })
  })

  it('🔴 las esperas vivas se cancelan: el reloj las ejecutaría sin mirar la campaña', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(filas(x, 'cadena_esperas').map((e) => [e.id, e.estado])).toEqual([[1, 'cancelada'], [2, 'resuelta'], [3, 'cancelada'], [4, 'viva']])
    expect(filas(x, 'cadena_esperas').find((e) => e.id === 3)).not.toHaveProperty('archivada_en')
  })

  it('🔴 no toca lo ajeno: otra campaña, otro cliente, una pieza anterior, otro tipo, otro encargo', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'ajena')).not.toHaveProperty('archivada_en')
    for (const id of [H3, H4, 'plan']) expect(filas(x, 'hitl_queue').find((f) => f.id === id)).not.toHaveProperty('archivada_en')
    expect(filas(x, 'oficina_encargos').find((f) => f.id === 'otro')).not.toHaveProperty('archivada_en')
  })

  it('🔴 una pieza que Emilio aprobó no se archiva: se declara', async () => {
    const x = base()
    const r = await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(r.body.aprobadas_sin_archivar).toEqual([H2])
    expect(filas(x, 'hitl_queue').find((f) => f.id === H2)).not.toHaveProperty('archivada_en')
  })

  it('🔴 repetirlo no pisa de dónde venía ni cuándo se archivó', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    const r = await archivarCampana(d(x), { campana_id: K, dry_run: false }, new Date('2026-11-04T00:00:00Z'))
    expect(r.body).toMatchObject({ filas: 0, esperas: 0, piezas: 0 })
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado_antes_de_archivar: 'pausada', archivada_en: AHORA.toISOString() })
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'f1')).toMatchObject({ archivada_en: AHORA.toISOString() })
  })

  it('🔴 si se cortó a mitad y se repite, todo queda con la misma fecha, y desarchivar reabre las esperas', async () => {
    const x = base()
    // la campaña ya quedó marcada y el resto no: así se ve un corte
    Object.assign(x.tablas['cadena_campanas'][0], { estado: 'reemplazada', archivada_en: AHORA.toISOString(), estado_antes_de_archivar: 'pausada', motivo_antes_de_archivar: 'pausa de pruebas' })
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, new Date('2026-11-04T00:00:00Z'))
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ archivada_en: AHORA.toISOString(), estado_antes_de_archivar: 'pausada' })
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'f1')?.archivada_en).toBe(AHORA.toISOString())
    expect(filas(x, 'cadena_esperas').find((e) => e.id === 1)).toMatchObject({ estado: 'cancelada', archivada_en: AHORA.toISOString() })
    await desarchivarCampana(d(x), { campana_id: K }, AHORA)
    expect(filas(x, 'cadena_esperas').find((e) => e.id === 1)?.estado).toBe('viva')
  })

  it('🔴 archivar, recuperar y repetir: lo que Emilio sacó no vuelve a entrar', async () => {
    const x = base()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    await recuperarPieza(d(x), { hitl_id: H1 }, AHORA)
    const r = await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(r.body).toMatchObject({ piezas: 0 })
    expect(filas(x, 'hitl_queue').find((f) => f.id === H1)).toMatchObject({ status: 'pending', archivada_en: null })
  })

  it('🔴 no cambia cuántas filas, piezas ni encargos hay', async () => {
    const x = base()
    const cuantas = () => ['cadena_calendario_filas', 'hitl_queue', 'oficina_encargos', 'cadena_esperas', 'cadena_campanas'].map((n) => filas(x, n).length)
    const antes = cuantas()
    await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(cuantas()).toEqual(antes)
    await desarchivarCampana(d(x), { campana_id: K }, AHORA)
    expect(cuantas()).toEqual(antes)
  })

  it.each(['activa', 'abierta', 'estrategia', 'calendario'])('🔴 una campaña %s no se archiva sin pausarla antes', async (estado) => {
    const x = new DbFalsa().semilla('cadena_campanas', [{ id: K, client_id: C, estado }])
    expect(await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)).toMatchObject({ status: 409, body: { error: 'campana_viva' } })
  })

  it('sin campaña o con id inválido', async () => {
    expect((await archivarCampana(d(new DbFalsa()), { campana_id: K }, AHORA)).status).toBe(404)
    expect((await archivarCampana(d(new DbFalsa()), { campana_id: 'x' }, AHORA)).status).toBe(400)
  })

  it.each(['cadena_campanas', 'cadena_calendario_filas', 'cadena_esperas', 'hitl_queue', 'oficina_encargos'])('🔴 si falla %s lo dice, no responde ok', async (tabla) => {
    const x = base()
    x.fallar[tabla] = 'caída'
    expect((await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)).status).toBe(500)
  })
})

describe('desarchivar', () => {
  const archivada = async () => { const x = base(); await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA); return x }

  it('🔴 lo deja exactamente como estaba, salvo marcas vacías', async () => {
    const x = await archivada()
    const r = await desarchivarCampana(d(x), { campana_id: K }, AHORA)
    expect(r.body).toMatchObject({ ok: true, estado: 'pausada', piezas: 1 })
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado: 'pausada', estado_motivo: 'pausa de pruebas', archivada_en: null, estado_antes_de_archivar: null })
    expect(filas(x, 'cadena_calendario_filas').find((f) => f.id === 'f1')).toMatchObject({ estado: 'validada', archivada_en: null, archivo_motivo: null })
    expect(filas(x, 'hitl_queue').find((f) => f.id === H1)).toMatchObject({ status: 'rejected', archivada_en: null })
    expect(filas(x, 'oficina_encargos').find((f) => f.id === E1)).toMatchObject({ archivada_en: null })
  })

  it('🔴 reabre solo las esperas que cerró el archivo', async () => {
    const x = await archivada()
    await desarchivarCampana(d(x), { campana_id: K }, AHORA)
    expect(filas(x, 'cadena_esperas').map((e) => [e.id, e.estado])).toEqual([[1, 'viva'], [2, 'resuelta'], [3, 'cancelada'], [4, 'viva']])
  })

  it('🔴 si el cliente ya tiene otra campaña viva, no: serían dos', async () => {
    const x = await archivada()
    x.semilla('cadena_campanas', [{ id: 'nueva', client_id: C, estado: 'calendario', seco: false }])
    expect(await desarchivarCampana(d(x), { campana_id: K }, AHORA)).toMatchObject({ status: 409, body: { error: 'hay_otra_campana' } })
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado: 'reemplazada' })
  })

  it('una campaña sin archivar no se desarchiva', async () => {
    expect(await desarchivarCampana(d(base()), { campana_id: K }, AHORA)).toMatchObject({ status: 409, body: { error: 'sin_archivar' } })
  })
})

describe('recuperar una pieza', () => {
  const archivada = async () => { const x = base(); await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA); return x }

  it('🔴 vuelve a la bandeja como pendiente, y la decisión anterior queda guardada', async () => {
    const x = await archivada()
    expect(await recuperarPieza(d(x), { hitl_id: H1 }, AHORA)).toMatchObject({ status: 200, body: { status: 'pending' } })
    const p = filas(x, 'hitl_queue').find((f) => f.id === H1)!
    expect(p).toMatchObject({ status: 'pending', archivada_en: null, decision: null, reviewer: null, expires_at: null })
    expect((p.metadata as Record<string, unknown>).recuperada_del_archivo).toMatchObject({ estado_anterior: 'rejected', decision_anterior: { vencida: true } })
    expect((p.metadata as Record<string, unknown>).oficina_encargo_id).toBe(E1)
    expect(filas(x, 'oficina_encargos').find((f) => f.id === E1)).toMatchObject({ archivada_en: null })
  })

  it('🔴 el barrido de lo reemplazado no la vuelve a cerrar', async () => {
    const x = await archivada()
    await recuperarPieza(d(x), { hitl_id: H1 }, AHORA)
    const vigentes = new Map([[C, { id: 'plan-nuevo', creado_en: '2026-11-03T00:00:00Z', hay_anteriores: true }]])
    const p = filas(x, 'hitl_queue').find((f) => f.id === H1)!
    expect(motivoDeReemplazo(p as never, vigentes as never)).toBeNull()
    expect(motivoDeReemplazo({ ...p, metadata: {} } as never, vigentes as never)).toMatch(/plan anterior/)
  })

  it('una pieza fuera del archivo, inexistente o con id inválido', async () => {
    expect(await recuperarPieza(d(base()), { hitl_id: H1 }, AHORA)).toMatchObject({ status: 409 })
    expect((await recuperarPieza(d(base()), { hitl_id: E1 }, AHORA)).status).toBe(404)
    expect((await recuperarPieza(d(base()), { hitl_id: 'x' }, AHORA)).status).toBe(400)
  })
})
