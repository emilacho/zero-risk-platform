/**
 * 11-nov · regla (b) · la ruta `/api/oficina/turnos` recibe del flujo «Oficina · un turno» los CAMPOS del corte nuestro (`upstream_status`, `pedido_no_llego`) y los pasa al orquestador.
 * Camino real: la ruta con la base falsa; el encargo que vuelve con esos campos cierra fallido con su marca; el mismo texto sin campos cierra sin marca; un tipo malo es 400 antes de tocar nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { abrirEncargo } from '../orquestador'
import { causaDelFallo } from '../causa-del-fallo'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL } from './memoria'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const req = (cuerpo: unknown): Request => new Request('https://app.test/api/oficina/turnos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': 'la-llave' }, body: JSON.stringify(cuerpo) })

async function conTurnoEsperando() {
  const db = new DbFalsa()
    .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
    .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
    .semilla('client_social_images', [])
    .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
    .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', clase: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
  const P = crearPuertos(db, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}', { status: 404 })) as typeof fetch)
  const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  mocks.db = db
  return { db, id: String(a.cuerpo.encargo_id), n: Number((a.cuerpo.turno as { n: number }).n) }
}

describe('regla (b) · la ruta de turnos pasa los campos del corte nuestro', () => {
  let turnos: typeof import('@/app/api/oficina/turnos/route').POST
  const previa = process.env.SALA_DISPATCH_KEY
  beforeEach(async () => {
    process.env.SALA_DISPATCH_KEY = 'la-llave'
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }))
    turnos = (await import('@/app/api/oficina/turnos/route')).POST
  })
  afterEach(() => { vi.unstubAllGlobals(); if (previa === undefined) delete process.env.SALA_DISPATCH_KEY; else process.env.SALA_DISPATCH_KEY = previa })

  const corte = (db: DbFalsa, id: string) => causaDelFallo(db.tablas['oficina_encargos'].find((x) => x.id === id)!.estado_del_motor)?.corte_nuestro ?? null

  it('🔴 `upstream_status` (el 200 del redespliegue) cierra fallido con la marca `corredor_caido`', async () => {
    const { db, id, n } = await conTurnoEsperando()
    const r = await turnos(req({ accion: 'resultado', encargo_id: id, n, error: 'el agente FALLÓ · agent-runner upstream failed', upstream_status: 200 }))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(corte(db, id)).toEqual({ origen: 'corredor_caido' })
  })
  it('🔴 `pedido_no_llego: true` cierra con la marca `pedido_no_llego`', async () => {
    const { db, id, n } = await conTurnoEsperando()
    expect((await turnos(req({ accion: 'resultado', encargo_id: id, n, error: 'OFICINA_PEDIDO_NO_LLEGO · timeout', pedido_no_llego: true }))).status).toBe(200)
    expect(corte(db, id)).toEqual({ origen: 'pedido_no_llego' })
  })
  it('🔴 el MISMO texto sin los campos cierra fallido SIN marca (cuenta como intento)', async () => {
    const { db, id, n } = await conTurnoEsperando()
    expect((await turnos(req({ accion: 'resultado', encargo_id: id, n, error: 'el agente FALLÓ · agent-runner upstream failed' }))).status).toBe(200)
    expect(db.tablas['oficina_encargos'].find((x) => x.id === id)!.estado).toBe('fallido')
    expect(corte(db, id)).toBeNull()
  })
  it('🔴 tipos malos ⇒ 400 antes de tocar el encargo', async () => {
    const { db, id, n } = await conTurnoEsperando()
    const antes = JSON.stringify(db.tablas['oficina_encargos'])
    for (const extra of [{ upstream_status: '502' }, { upstream_status: 1.5 }, { pedido_no_llego: 'si' }, { pedido_no_llego: 1 }]) {
      const r = await turnos(req({ accion: 'resultado', encargo_id: id, n, error: 'x', ...extra }))
      expect(r.status).toBe(400)
    }
    expect(JSON.stringify(db.tablas['oficina_encargos'])).toBe(antes)
  })
})
