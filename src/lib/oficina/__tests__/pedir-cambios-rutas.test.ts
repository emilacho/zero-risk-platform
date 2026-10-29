/**
 * Las dos rutas de la ventana de piezas (29-oct): `POST /api/oficina/cambios` (llave, validación) y aprobar (`PATCH /api/hitl/[id]`) deja el encargo «aprobada». US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from './dbfalsa'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const HITL = '22222222-2222-4222-8222-222222222222'
const ENC = '33333333-3333-4333-8333-333333333333'
const previo = process.env.INTERNAL_API_KEY

const peticion = (url: string, cuerpo: unknown, llave: string | null = 'k-int', metodo = 'POST') =>
  new Request(url, { method: metodo, headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) })

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })

describe('POST /api/oficina/cambios', () => {
  it('sin llave interna → 401; llave equivocada → 401', async () => {
    const { POST } = await import('@/app/api/oficina/cambios/route')
    mocks.db = new DbFalsa()
    expect((await POST(peticion('https://t.test/api/oficina/cambios', { hitl_id: HITL, comentario: 'cambia la portada' }, null))).status).toBe(401)
    expect((await POST(peticion('https://t.test/api/oficina/cambios', { hitl_id: HITL, comentario: 'cambia la portada' }, 'otra'))).status).toBe(401)
  })
  it.each([
    ['hitl_id que no es uuid', { hitl_id: 'x', comentario: 'cambia la portada' }],
    ['comentario vacío', { hitl_id: HITL, comentario: '   ' }],
    ['comentario demasiado largo', { hitl_id: HITL, comentario: 'a'.repeat(2001) }],
    ['láminas fuera de rango', { hitl_id: HITL, comentario: 'cambia la portada', laminas: [0, 21] }],
    ['láminas que no son números', { hitl_id: HITL, comentario: 'cambia la portada', laminas: ['2'] }],
    ['reviewer vacío', { hitl_id: HITL, comentario: 'cambia la portada', reviewer: ' ' }],
  ])('%s → 400 antes de tocar la base', async (_n, cuerpo) => {
    const { POST } = await import('@/app/api/oficina/cambios/route')
    mocks.db = new DbFalsa()
    const r = await POST(peticion('https://t.test/api/oficina/cambios', cuerpo))
    expect(r.status).toBe(400); expect((await r.json()).error).toBe('entrada_invalida')
  })
  it('una pieza inexistente llega a la lógica y responde 404', async () => {
    const { POST } = await import('@/app/api/oficina/cambios/route')
    mocks.db = new DbFalsa().semilla('hitl_queue', [])
    expect((await POST(peticion('https://t.test/api/oficina/cambios', { hitl_id: HITL, comentario: 'cambia la portada' }))).status).toBe(404)
  })
})

describe('aprobar una pieza de la oficina', () => {
  const mundo = (tipo: string, estado: string) => new DbFalsa()
    .semilla('hitl_queue', [{ id: HITL, type: tipo, status: 'pending', client_id: 'c', metadata: {}, output_id: null }])
    .semilla('oficina_encargos', [{ id: ENC, hitl_queue_id: HITL, estado }])
  const aprobar = async () => { const { PATCH } = await import('@/app/api/hitl/[id]/route'); return PATCH(peticion(`https://t.test/api/hitl/${HITL}`, { status: 'approved', reviewer: 'emilio' }, 'k-int', 'PATCH'), { params: { id: HITL } }) }

  it.each(['cerrado', 'cerrado_por_tope'])('aprobar deja el encargo %s en «aprobada»', async (estado) => {
    mocks.db = mundo('content_piece_review', estado)
    const r = await aprobar()
    expect(r.status).toBe(200)
    expect((mocks.db as DbFalsa).tablas['oficina_encargos'][0].estado).toBe('aprobada')
  })
  it('rechazar NO marca aprobada; un encargo vivo o fallido tampoco se toca; otro tipo de pieza no toca la oficina', async () => {
    mocks.db = mundo('content_piece_review', 'cerrado')
    const { PATCH } = await import('@/app/api/hitl/[id]/route')
    await PATCH(peticion(`https://t.test/api/hitl/${HITL}`, { status: 'rejected', reviewer: 'emilio' }, 'k-int', 'PATCH'), { params: { id: HITL } })
    expect((mocks.db as DbFalsa).tablas['oficina_encargos'][0].estado).toBe('cerrado')
    for (const e of ['en_paso', 'fallido']) { mocks.db = mundo('content_piece_review', e); await aprobar(); expect((mocks.db as DbFalsa).tablas['oficina_encargos'][0].estado).toBe(e) }
    mocks.db = mundo('confirm_competitor_list', 'cerrado'); await aprobar()
    expect((mocks.db as DbFalsa).tablas['oficina_encargos'][0].estado).toBe('cerrado')
  })
})
