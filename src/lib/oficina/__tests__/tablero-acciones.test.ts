/**
 * Acciones del tablero, tramo 1 (30-oct): rehacer-pieza · cliente-* · oficina-estado · oficina-tope + la ruta POST /api/tablero/{accion}. US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { ACCIONES } from '../tablero/acciones'
import { confirmarGasto, rastroDelTablero, type Contexto } from '../tablero/comun'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, FUENTES, PARTE, crearMemoria } from './memoria'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const AHORA = new Date('2026-10-30T12:00:00Z')
const ctx = (db: DbFalsa, P: unknown = {}): Contexto => ({ db, puertos: () => P as never, ahora: () => AHORA })
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>, P?: unknown) => ACCIONES[accion](ctx(db, P), { cuerpo, reviewer: 'emilio' })
const CID = '11111111-1111-4111-8111-111111111111'

describe('confirmarGasto', () => {
  it('sin confirmo_gasto, sin tope, o con tope por encima del máximo → rechaza; con todo en regla → el tope', () => {
    expect(confirmarGasto({ tope_usd: 3 }, 5)).toMatchObject({ ok: false, salida: { status: 400 } })
    expect(confirmarGasto({ confirmo_gasto: true }, 5)).toMatchObject({ ok: false, salida: { status: 400 } })
    expect(confirmarGasto({ confirmo_gasto: true, tope_usd: 0 }, 5)).toMatchObject({ ok: false })
    expect(confirmarGasto({ confirmo_gasto: true, tope_usd: 5.01 }, 5)).toMatchObject({ ok: false })
    expect(confirmarGasto({ confirmo_gasto: 'true', tope_usd: 3 }, 5)).toMatchObject({ ok: false })
    expect(confirmarGasto({ confirmo_gasto: true, tope_usd: 5 }, 5)).toEqual({ ok: true, tope: 5 })
  })
})

describe('rastroDelTablero', () => {
  it('escribe una fila accion=tablero sin llaves; dos veces el mismo pedido en el mismo minuto es una sola fila; nunca lanza', async () => {
    const db = new DbFalsa()
    const r = { accion: 'cliente-baja', autor: 'emilio', toca: { client_id: CID }, resultado: { ok: true }, crudo: { client_id: CID, api_key: 'secreto' }, ahora: AHORA }
    await rastroDelTablero(db, r); await rastroDelTablero(db, r)
    expect(db.tablas['eventos_de_emilio']).toHaveLength(1)
    expect(db.tablas['eventos_de_emilio'][0]).toMatchObject({ accion: 'tablero', canal: 'dashboard', decision: 'cliente-baja', client_id: CID })
    await rastroDelTablero(db, { ...r, ahora: new Date(AHORA.getTime() + 120_000) }) // otro minuto = otro intento = otra fila
    expect(db.tablas['eventos_de_emilio']).toHaveLength(2)
    db.fallar['eventos_de_emilio'] = 'caída'
    await expect(rastroDelTablero(db, { ...r, autor: 'otro' })).resolves.toBeUndefined()
  })
})

describe('cliente-nuevo', () => {
  it('crea el cliente en onboarding con identificador del nombre y devuelve client_id; el nombre repetido da 409', async () => {
    const db = new DbFalsa().semilla('clients', [])
    const s = await llamar('cliente-nuevo', db, { nombre: 'Café Ñandú', rubro: 'cafetería', ciudad: 'Quito', sitio: 'https://cafe.test', presupuesto: 300 })
    expect(s.status).toBe(200)
    expect(s.cuerpo.client_id).toMatch(/^55555555/)
    expect(db.tablas['clients'][0]).toMatchObject({ name: 'Café Ñandú', slug: 'cafe-nandu', industry: 'cafetería', status: 'onboarding', market: 'Quito', website_url: 'https://cafe.test', config: { spend_cap_usd: 300 } })
    expect((await llamar('cliente-nuevo', db, { nombre: 'cafe nandu', rubro: 'otro' })).status).toBe(409)
    expect(db.tablas['clients']).toHaveLength(1)
  })
  it.each([
    ['sin rubro', { nombre: 'Algo' }],
    ['nombre de una letra', { nombre: 'A', rubro: 'xx' }],
    ['sitio que no es http', { nombre: 'Algo', rubro: 'xx', sitio: 'ftp://x' }],
    ['presupuesto negativo', { nombre: 'Algo', rubro: 'xx', presupuesto: -1 }],
    ['nombre sin letras ni números', { nombre: '¡¡¡', rubro: 'xx' }],
  ])('%s → 400 y no crea nada', async (_n, cuerpo) => {
    const db = new DbFalsa().semilla('clients', [])
    expect((await llamar('cliente-nuevo', db, cuerpo)).status).toBe(400)
    expect(db.tablas['clients']).toHaveLength(0)
  })
})

describe('cliente-editar', () => {
  const sembrar = (extra: Record<string, unknown> = {}) => new DbFalsa().semilla('clients', [{ id: CID, status: 'active', config: { moneda: 'USD', own_social_handles: { instagram: 'viejo' } }, ...extra }])
  it('traduce rubro/ciudad/sitio a sus columnas y presupuesto/redes a config SIN perder lo que ya había', async () => {
    const db = sembrar()
    const s = await llamar('cliente-editar', db, { client_id: CID, campos: { rubro: 'cafetería', ciudad: 'Cuenca', sitio: 'https://x.test', presupuesto: 500, redes: { tiktok: 'nuevo' } } })
    expect(s.status).toBe(200)
    expect(db.tablas['clients'][0]).toMatchObject({ industry: 'cafetería', market: 'Cuenca', website_url: 'https://x.test', config: { moneda: 'USD', spend_cap_usd: 500, own_social_handles: { instagram: 'viejo', tiktok: 'nuevo' } } })
  })
  it('un campo fuera de la lista, una red desconocida o un valor malo → 400 y no cambia nada', async () => {
    for (const campos of [{ nombre: 'x' }, { redes: { myspace: 'a' } }, { presupuesto: 'mucho' }, { sitio: 'x' }, {}, { rubro: 'x' }]) {
      const db = sembrar()
      expect((await llamar('cliente-editar', db, { client_id: CID, campos })).status).toBe(400)
      expect(db.tablas['clients'][0]).not.toHaveProperty('industry')
    }
  })
  it('cliente inexistente → 404; dado de baja → 409', async () => {
    expect((await llamar('cliente-editar', new DbFalsa().semilla('clients', []), { client_id: CID, campos: { rubro: 'cafetería' } })).status).toBe(404)
    expect((await llamar('cliente-editar', sembrar({ status: 'churned' }), { client_id: CID, campos: { rubro: 'cafetería' } })).status).toBe(409)
  })
})

describe('cliente-baja', () => {
  it('pone churned con fecha y motivo; exige motivo; no repite la baja', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: CID, status: 'active' }])
    expect((await llamar('cliente-baja', db, { client_id: CID })).status).toBe(400)
    expect(db.tablas['clients'][0].status).toBe('active')
    const s = await llamar('cliente-baja', db, { client_id: CID, comentario: 'ya no trabaja con nosotros' })
    expect(s.status).toBe(200)
    expect(db.tablas['clients'][0]).toMatchObject({ status: 'churned', archived_at: AHORA.toISOString(), archived_reason: 'ya no trabaja con nosotros' })
    expect((await llamar('cliente-baja', db, { client_id: CID, comentario: 'otra vez' })).status).toBe(409)
    expect((await llamar('cliente-baja', new DbFalsa().semilla('clients', []), { client_id: CID, comentario: 'xxx' })).status).toBe(404)
  })
})

describe('oficina-estado / oficina-tope', () => {
  const sembrar = () => (mocks.db = new DbFalsa()
    .semilla('oficina_config', [{ id: 1, estado: 'encendida' }]).semilla('finanzas_config', [{ id: 1, estado: 'encendida' }]).semilla('jefatura_config', [{ id: 1, estado: 'encendida' }])
    .semilla('cadena_config', [{ clave: 'estado_cadena', valor: 'encendida' }])
    .semilla('jefatura_grading_policies', [{ artifact_type: 'pieza', tope_revision_usd: 1.5 }, { artifact_type: 'plan', tope_revision_usd: 5 }])
    .semilla('oficina_tipos_de_grupo', [{ tipo: 'carrusel_mesa', limites: { tope_encargo_usd: 4, otro: 1 } }, { tipo: 'kit_mesa', limites: { tope_encargo_usd: 4 } }, { tipo: 'post_img', limites: { tope_encargo_usd: 2 } }])) as DbFalsa
  it('apaga y enciende CADA oficina en su tabla, y solo esa', async () => {
    const db = sembrar()
    for (const [oficina, tabla] of [['creativa', 'oficina_config'], ['financiera', 'finanzas_config'], ['jefatura', 'jefatura_config']] as const) {
      expect((await llamar('oficina-estado', db, { oficina, estado: 'apagada' })).status).toBe(200)
      expect(db.tablas[tabla][0].estado).toBe('apagada')
    }
    expect(db.tablas['cadena_config'][0].valor).toBe('encendida')
    expect((await llamar('oficina-estado', db, { oficina: 'planeacion', estado: 'apagada' })).status).toBe(200)
    expect(db.tablas['cadena_config'][0].valor).toBe('apagada')
    expect((await llamar('oficina-estado', db, { oficina: 'creativa', estado: 'encendida' })).status).toBe(200)
    expect(db.tablas['oficina_config'][0].estado).toBe('encendida')
    expect(db.tablas['jefatura_config'][0].estado).toBe('apagada')
  })
  it('oficina o estado inválidos → 400 (ensayo no se maneja desde aquí)', async () => {
    const db = sembrar()
    expect((await llamar('oficina-estado', db, { oficina: 'marketing', estado: 'apagada' })).status).toBe(400)
    expect((await llamar('oficina-estado', db, { oficina: 'creativa', estado: 'ensayo' })).status).toBe(400)
    expect(db.tablas['oficina_config'][0].estado).toBe('encendida')
  })
  it('tope creativa → carrusel y kit (no otras plantillas) conservando el resto de límites; jefatura → solo la política de pieza', async () => {
    const db = sembrar()
    expect((await llamar('oficina-tope', db, { oficina: 'creativa', tope_usd: 6 })).status).toBe(200)
    expect(db.tablas['oficina_tipos_de_grupo'].map((f) => (f.limites as Record<string, number>).tope_encargo_usd)).toEqual([6, 6, 2])
    expect(db.tablas['oficina_tipos_de_grupo'][0].limites).toMatchObject({ otro: 1 })
    expect((await llamar('oficina-tope', db, { oficina: 'jefatura', tope_usd: 2 })).status).toBe(200)
    expect(db.tablas['jefatura_grading_policies'].map((f) => f.tope_revision_usd)).toEqual([2, 5])
  })
  it('financiera/planeación → 409; tope fuera de rango o sobre el máximo seguro → 400 y nada cambia', async () => {
    const db = sembrar()
    for (const oficina of ['financiera', 'planeacion']) expect((await llamar('oficina-tope', db, { oficina, tope_usd: 1 })).status).toBe(409)
    for (const t of [0, -1, 'x', 1001, 10.01]) expect((await llamar('oficina-tope', db, { oficina: 'creativa', tope_usd: t })).status).toBe(400)
    expect(db.tablas['oficina_tipos_de_grupo'][0].limites).toMatchObject({ tope_encargo_usd: 4 })
    expect((await llamar('oficina-tope', db, { oficina: 'creativa', tope_usd: 10 })).status).toBe(200)
  })
})

describe('rehacer-pieza', () => {
  const ENC = '33333333-3333-4333-8333-333333333333'
  const gasto = { confirmo_gasto: true, tope_usd: 3 }
  const fila = (extra: Record<string, unknown> = {}) => ({ id: ENC, client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', version_encargo: 1, estado: 'fallido', dry_run: false, sala_ref: null, ...extra })
  it('sin confirmar el gasto no hace nada (ni lee la base)', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [fila()])
    expect((await llamar('rehacer-pieza', db, { encargo_id: ENC })).status).toBe(400)
    expect((await llamar('rehacer-pieza', db, { encargo_id: ENC, confirmo_gasto: true, tope_usd: 6 })).status).toBe(400)
    expect((await llamar('rehacer-pieza', db, { encargo_id: 'x', ...gasto })).status).toBe(400)
  })
  it('inexistente → 404; ensayo, no fallida o con versión más nueva → 409', async () => {
    expect((await llamar('rehacer-pieza', new DbFalsa().semilla('oficina_encargos', []), { encargo_id: ENC, ...gasto })).status).toBe(404)
    for (const extra of [{ dry_run: true }, { estado: 'cerrado' }, { estado: 'en_paso' }]) {
      const s = await llamar('rehacer-pieza', new DbFalsa().semilla('oficina_encargos', [fila(extra)]), { encargo_id: ENC, ...gasto })
      expect(s.status).toBe(409)
    }
    const db = new DbFalsa().semilla('oficina_encargos', [fila(), fila({ id: '44444444-4444-4444-8444-444444444444', version_encargo: 2 })])
    const s = await llamar('rehacer-pieza', db, { encargo_id: ENC, ...gasto })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('hay_una_version_mas_nueva')
  })
  it('de punta a punta: una pieza fallida que ya gastó se reabre como versión 2 con el tope pedido; a la tercera versión ya no', async () => {
    const M = crearMemoria({ plantilla: POST_IMG, fuentes: FUENTES })
    const sobre = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }
    const a = await abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const viejo = M.encargos.get(String(a.cuerpo.encargo_id))!
    viejo.estado = 'fallido'; viejo.gasto_usd = 1.1; viejo.estado_del_motor = { ...viejo.estado_del_motor, pasos_ejecutados: 6 }
    const db = new DbFalsa().semilla('oficina_encargos', [{ ...viejo, tipo_de_grupo: viejo.tipo_de_grupo ?? 'post_img' }])
    const s = await llamar('rehacer-pieza', db, { encargo_id: viejo.id, comentario: 'se arregló el generador de imágenes', ...gasto }, M.P)
    expect(s.status).toBe(200)
    const nuevo = M.encargos.get(String(s.cuerpo.encargo_id))!
    expect(nuevo.id).not.toBe(viejo.id)
    expect(nuevo.version_encargo).toBe(2)
    expect(nuevo.tope_usd).toBeLessThanOrEqual(3)
    expect(nuevo.sala_ref).toMatchObject({ reapertura: { causa_corregida: 'se arregló el generador de imágenes' } })
    expect(s.toca).toMatchObject({ encargo_id: nuevo.id })
    // la versión 3 fallida ya no se reabre
    const v3 = { ...viejo, id: '55555555-0000-4000-8000-000000000003', version_encargo: 3, tipo_de_grupo: 'post_img' }
    const s3 = await llamar('rehacer-pieza', new DbFalsa().semilla('oficina_encargos', [v3]), { encargo_id: v3.id, ...gasto }, M.P)
    expect(s3.status).toBe(409)
  })
})

describe('POST /api/tablero/{accion}', () => {
  const previo = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
  afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })
  const peticion = (cuerpo: unknown, llave: string | null = 'k-int') =>
    new Request('https://t.test/api/tablero/x', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) })
  it('sin llave → 401; acción que no existe → 404 (incluidas las del prototipo); JSON malo → 400', async () => {
    const { POST } = await import('@/app/api/tablero/[accion]/route')
    mocks.db = new DbFalsa()
    expect((await POST(peticion({}, null), { params: { accion: 'cliente-baja' } })).status).toBe(401)
    expect((await POST(peticion({}), { params: { accion: 'pieza-nueva' } })).status).toBe(404)
    expect((await POST(peticion({}), { params: { accion: 'constructor' } })).status).toBe(404)
    expect((await POST(new Request('https://t.test/x', { method: 'POST', headers: { 'x-api-key': 'k-int' }, body: '{' }), { params: { accion: 'cliente-baja' } })).status).toBe(400)
    expect((await POST(peticion({ reviewer: ' ' }), { params: { accion: 'cliente-baja' } })).status).toBe(400)
  })
  it('una acción buena responde y deja su fila en eventos_de_emilio; una rechazada también', async () => {
    const { POST } = await import('@/app/api/tablero/[accion]/route')
    const db = new DbFalsa().semilla('clients', [{ id: CID, status: 'active' }])
    mocks.db = db
    const ok = await POST(peticion({ client_id: CID, comentario: 'se fue', reviewer: 'emilio', origen: 'dashboard' }), { params: { accion: 'cliente-baja' } })
    expect(ok.status).toBe(200); expect((await ok.json()).ok).toBe(true)
    const mal = await POST(peticion({ client_id: CID, comentario: 'otra vez' }), { params: { accion: 'cliente-baja' } })
    expect(mal.status).toBe(409)
    const ev = db.tablas['eventos_de_emilio']
    expect(ev).toHaveLength(2)
    expect(ev.every((e) => e.accion === 'tablero' && e.decision === 'cliente-baja' && e.client_id === CID)).toBe(true)
    expect(ev.map((e) => (e.resultado as { status: number }).status).sort()).toEqual([200, 409])
  })
})
