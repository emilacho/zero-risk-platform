import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { almacenDeSupabase } from '../almacen-supabase'
import { vencerBandeja, revisarPasosMuertos, MINUTOS_PARA_DAR_POR_MUERTO } from '../vigia'
import { NOTA_DE_VENCIMIENTO } from '../entrega'
import { estadoInicial } from '../tipos'
import { POST_IMG } from '../plantillas/post-img'
import { abrirEncargo, avanzar } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL } from './memoria'

const AHORA = new Date('2026-10-14T12:00:00Z')
const ENV = { baseUrl: 'https://app.test', internalKey: 'k' }

describe('el vigía vence la bandeja de la oficina (y solo la de la oficina)', () => {
  const fila = (o: Record<string, unknown>) => ({ id: 'h', status: 'pending', expires_at: '2026-10-14T05:00:00.000Z', metadata: { origen: 'oficina' }, ...o })
  it('una pieza pendiente de la oficina con la fecha pasada queda anotada como vencida y NO se publica', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [fila({ id: 'a' })])
    const r = await vencerBandeja(db, AHORA)
    expect(r.vencidas).toEqual(['a'])
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'rejected', resolved_by: 'oficina-vigia', resolution_notes: NOTA_DE_VENCIMIENTO })
    expect(db.tablas['hitl_queue'][0].decision).toMatchObject({ vencida: true })
  })
  it('NO toca: aprobadas, con fecha futura, sin fecha, ni filas que no son de la oficina', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [fila({ id: 'ok', status: 'approved' }), fila({ id: 'fut', expires_at: '2026-10-20T00:00:00Z' }), fila({ id: 'sin', expires_at: null }), fila({ id: 'ajena', metadata: { origen: 'otro' } }), fila({ id: 'nula', metadata: null })])
    expect((await vencerBandeja(db, AHORA)).vencidas).toEqual([])
    expect(db.tablas['hitl_queue'].map((f) => f.status)).toEqual(['approved', 'pending', 'pending', 'pending', 'pending'])
  })
  it('si Emilio aprueba JUSTO antes de que el vigía escriba, la aprobación NO se pisa (la escritura es condicional)', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [fila({ id: 'a' })])
    const from = db.from.bind(db)
    db.from = (t: string) => {
      const q = from(t) as unknown as { update: (p: Record<string, unknown>) => unknown }
      const upd = q.update.bind(q)
      q.update = (p: Record<string, unknown>) => { db.tablas['hitl_queue'][0].status = 'approved'; return upd(p) }
      return q as never
    }
    expect((await vencerBandeja(db, AHORA)).vencidas).toEqual([])
    expect(db.tablas['hitl_queue'][0].status).toBe('approved')
  })
  it('es idempotente: una segunda pasada no vuelve a tocar nada', async () => {
    const db = new DbFalsa().semilla('hitl_queue', [fila({ id: 'a' })])
    await vencerBandeja(db, AHORA)
    expect((await vencerBandeja(db, AHORA)).vencidas).toEqual([])
  })
  it('un error de la base se lanza (no se lee como «no hay nada que vencer»)', async () => {
    const db = new DbFalsa(); db.fallar['hitl_queue'] = 'caída'
    await expect(vencerBandeja(db, AHORA)).rejects.toThrow(/caída/)
  })
})

describe('el vigía y los pasos muertos', () => {
  async function conPasoColgado() {
    const db = new DbFalsa()
      .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
      .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
      .semilla('client_social_images', [])
      .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
      .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
      .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
    const hora = { v: new Date('2026-10-10T12:00:00Z') }
    const P = crearPuertos(db, ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora.v)
    const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.cuerpo.accion).toBe('esperar') // el primer paso (portero) quedó corriendo
    return { db, P, hora, id: String(a.cuerpo.encargo_id) }
  }
  const vivo = (db: DbFalsa) => db.tablas['oficina_turnos'].find((t) => t.estado === 'corriendo' || t.estado === 'muerto')!
  const envejecer = (db: DbFalsa, ahora: Date, min: number) => { vivo(db).inicio = new Date(ahora.getTime() - min * 60_000).toISOString() }
  it('un paso «corriendo» de menos de 12 min no se toca', async () => {
    const { db, P, hora } = await conPasoColgado()
    envejecer(db, hora.v, 5)
    expect(await revisarPasosMuertos(P, db, hora.v)).toEqual({ reanudar: [], fallidos: [] })
    expect(vivo(db).estado).toBe('corriendo')
  })
  it('a los 12 min se da por muerto y se reintenta UNA vez (mismo número de paso)', async () => {
    const { db, P, hora, id } = await conPasoColgado()
    const n = vivo(db).n
    envejecer(db, hora.v, MINUTOS_PARA_DAR_POR_MUERTO + 1)
    const r = await revisarPasosMuertos(P, db, hora.v)
    expect(r).toEqual({ reanudar: [id], fallidos: [] })
    expect(vivo(db).estado).toBe('muerto')
    const re = await avanzar(P, id)
    expect(re.cuerpo).toMatchObject({ accion: 'esperar', turno: { n } }) // se re-arma el MISMO paso
    expect(vivo(db).estado).toBe('corriendo')
  })
  it('si vuelve a morir, el encargo cierra FALLIDO (no hay tercer intento)', async () => {
    const { db, P, hora, id } = await conPasoColgado()
    envejecer(db, hora.v, 20); await revisarPasosMuertos(P, db, hora.v); await avanzar(P, id); envejecer(db, hora.v, 20)
    const r = await revisarPasosMuertos(P, db, hora.v)
    expect(r.fallidos).toEqual([id])
    expect(db.tablas['oficina_encargos'][0].estado).toBe('fallido')
  })
  it('un encargo ya cerrado no se revive', async () => {
    const { db, P, hora } = await conPasoColgado()
    db.tablas['oficina_encargos'][0].estado = 'cerrado'
    envejecer(db, hora.v, 60)
    expect(await revisarPasosMuertos(P, db, hora.v)).toEqual({ reanudar: [], fallidos: [] })
  })
})

// ───────── las rutas
const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const req = (cuerpo: unknown, llave: string | null = 'la-llave', url = 'https://app.test/api/oficina/x'): Request =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-sala-dispatch-key': llave } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })

describe('rutas /api/oficina/*: cerradas por la llave de despacho y por la config', () => {
  let encargos: typeof import('@/app/api/oficina/encargos/route').POST
  let turnos: typeof import('@/app/api/oficina/turnos/route').POST
  let vigia: typeof import('@/app/api/oficina/vigia/route').POST
  const previa = process.env.SALA_DISPATCH_KEY
  beforeEach(async () => {
    process.env.SALA_DISPATCH_KEY = 'la-llave'
    mocks.db = new DbFalsa().semilla('oficina_config', [{ id: 1, estado: 'apagada', familias_activas: [], clientes_ensayo: [] }])
    encargos = (await import('@/app/api/oficina/encargos/route')).POST
    turnos = (await import('@/app/api/oficina/turnos/route')).POST
    vigia = (await import('@/app/api/oficina/vigia/route')).POST
  })
  afterEach(() => { if (previa === undefined) delete process.env.SALA_DISPATCH_KEY; else process.env.SALA_DISPATCH_KEY = previa })

  it.each([['encargos'], ['turnos'], ['vigia']] as const)('%s: sin SALA_DISPATCH_KEY en el entorno ⇒ 503 (cerrada)', async (cual) => {
    delete process.env.SALA_DISPATCH_KEY
    const f = { encargos, turnos, vigia }[cual]
    expect((await f(req({}))).status).toBe(503)
  })
  it.each([['encargos'], ['turnos'], ['vigia']] as const)('%s: llave ausente o mala ⇒ 401; la llave interna NO vale', async (cual) => {
    const f = { encargos, turnos, vigia }[cual]
    expect((await f(req({}, null))).status).toBe(401)
    expect((await f(req({}, 'otra'))).status).toBe(401)
    process.env.INTERNAL_API_KEY = 'interna'
    expect((await f(new Request('https://app.test/x', { method: 'POST', headers: { 'x-api-key': 'interna' }, body: '{}' }))).status).toBe(401)
  })
  it('sin SALA_DISPATCH_KEY la llave interna NO abre la puerta (503, no 200)', async () => {
    delete process.env.SALA_DISPATCH_KEY; process.env.INTERNAL_API_KEY = 'interna'
    const r = await vigia(req({}, 'interna'))
    expect(r.status).toBe(503)
  })
  it('encargos: JSON roto ⇒ 400; sin client_id/target ⇒ 400; dry_run ausente ⇒ 400 ANTES de tocar nada', async () => {
    expect((await encargos(req('{no'))).status).toBe(400)
    expect((await encargos(req({ parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true }))).status).toBe(400)
    const r = await encargos(req({ client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR, parte_id: PARTE, brief_id: 'BRF-0003', familia: 'post_img' }))
    expect(r.status).toBe(400); expect((await r.json()).error).toBe('dry_run_ausente')
  })
  it('encargos: con la oficina APAGADA (la semilla) responde 409 y no crea nada', async () => {
    const r = await encargos(req({ client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR, parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }))
    expect(r.status).toBe(409); expect((await r.json()).motivo).toBe('oficina_apagada')
    expect((mocks.db as DbFalsa).tablas['oficina_encargos'] ?? []).toHaveLength(0)
  })
  it('encargos leer: uuid inválido ⇒ 400; inexistente ⇒ 404', async () => {
    expect((await encargos(req({ accion: 'leer', encargo_id: 'x' }))).status).toBe(400)
    expect((await encargos(req({ accion: 'leer', encargo_id: '11111111-1111-4111-8111-111111111111' }))).status).toBe(404)
  })
  it('turnos: valida la acción, el uuid y que el resultado traiga `n` y `texto` o `error`', async () => {
    expect((await turnos(req({ accion: 'x', encargo_id: 'y' }))).status).toBe(400)
    const id = '11111111-1111-4111-8111-111111111111'
    expect((await turnos(req({ accion: 'resultado', encargo_id: id }))).status).toBe(400)
    expect((await turnos(req({ accion: 'resultado', encargo_id: id, n: 0, texto: 'x' }))).status).toBe(400)
    expect((await turnos(req({ accion: 'siguiente', encargo_id: id }))).status).toBe(404) // encargo inexistente
  })
  it('vigía: con la oficina apagada no hace nada; dry_run no escribe; dry_run no booleano ⇒ 400', async () => {
    const r = await vigia(req({}))
    expect(await r.json()).toMatchObject({ accion: 'apagada' })
    expect((await vigia(req({ dry_run: 'sí' }))).status).toBe(400)
    ;(mocks.db as DbFalsa).tablas['oficina_config'][0].estado = 'encendida'
    ;(mocks.db as DbFalsa).semilla('hitl_queue', [{ id: 'a', status: 'pending', expires_at: '2020-01-01T00:00:00Z', metadata: { origen: 'oficina' } }])
    expect(await (await vigia(req({ dry_run: true }))).json()).toMatchObject({ accion: 'dry_run' })
    expect((mocks.db as DbFalsa).tablas['hitl_queue'][0].status).toBe('pending')
    expect(await (await vigia(req({}))).json()).toMatchObject({ accion: 'vigilado', vencidas: ['a'] })
  })
  it('un error de la base se contesta 500 con detalle (no se esconde)', async () => {
    ;(mocks.db as DbFalsa).fallar['oficina_encargos'] = 'caída'
    const r = await encargos(req({ accion: 'leer', encargo_id: '11111111-1111-4111-8111-111111111111' }))
    expect(r.status).toBe(500); expect((await r.json()).error).toBe('oficina_error')
  })
})

describe('el almacén no importa el estado inicial desde fuera', () => {
  it('estadoInicial es un objeto nuevo cada vez', () => { expect(estadoInicial()).not.toBe(estadoInicial()); void almacenDeSupabase })
})
