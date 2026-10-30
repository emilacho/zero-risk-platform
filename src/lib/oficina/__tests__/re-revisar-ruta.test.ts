/**
 * POST /api/oficina/re-revisar (30-oct): llave, validación, y que NO escribe nada de lo del dueño (ni notas ni eventos). US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from './dbfalsa'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const HITL = '22222222-2222-4222-8222-222222222222'
const previo = process.env.INTERNAL_API_KEY
const peticion = (cuerpo: unknown, llave: string | null = 'k-int') =>
  new Request('https://t.test/api/oficina/re-revisar', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) })

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })

describe('POST /api/oficina/re-revisar', () => {
  it('sin llave interna → 401; llave equivocada → 401', async () => {
    const { POST } = await import('@/app/api/oficina/re-revisar/route')
    mocks.db = new DbFalsa()
    expect((await POST(peticion({ hitl_id: HITL }, null))).status).toBe(401)
    expect((await POST(peticion({ hitl_id: HITL }, 'otra'))).status).toBe(401)
  })
  it.each([
    ['hitl_id que no es uuid', { hitl_id: 'x' }],
    ['reviewer vacío', { hitl_id: HITL, reviewer: ' ' }],
    ['solo_estimar que no es booleano', { hitl_id: HITL, solo_estimar: 'si' }],
  ])('%s → 400 antes de tocar la base', async (_n, cuerpo) => {
    const { POST } = await import('@/app/api/oficina/re-revisar/route')
    mocks.db = new DbFalsa()
    const r = await POST(peticion(cuerpo))
    expect(r.status).toBe(400); expect((await r.json()).error).toBe('entrada_invalida')
  })
  it('una pieza inexistente → 404 y no escribe en las tablas del dueño', async () => {
    const { POST } = await import('@/app/api/oficina/re-revisar/route')
    const db = new DbFalsa().semilla('hitl_queue', []).semilla('notas_del_dueno', []).semilla('eventos_de_emilio', [])
    mocks.db = db
    expect((await POST(peticion({ hitl_id: HITL }))).status).toBe(404)
    expect(db.tablas['notas_del_dueno']).toHaveLength(0); expect(db.tablas['eventos_de_emilio']).toHaveLength(0)
  })
})
