/**
 * 30-oct · PATCH /api/manual/{client_id}/campos (la ruta real): llave interna, versión nueva, rastro en eventos_de_emilio, y el cerebro después.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: vi.fn((r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'missing' })) }))
const empujes: Array<{ client_id: string; source_id: string }> = []
vi.mock('@/lib/brain/push-al-terminar', () => ({ empujarManualAlCerebro: (x: { client_id: string; source_id: string }) => { empujes.push(x); return { estado: 'agendado' } } }))
let db = new DbFalsa()
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const llamadasAlCerebro: Array<Record<string, unknown>> = []
const pedido = (cuerpo: unknown, key = 'k') => new Request(`https://zr.test/api/manual/${C}/campos`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(cuerpo) })

beforeEach(() => {
  empujes.length = 0; llamadasAlCerebro.length = 0
  db = new DbFalsa().semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, brand_purpose: 'Viejo', content_text: JSON.stringify({ brand_book_draft: { proposito: 'Viejo' } }), provenance_tag: {} }])
  global.fetch = vi.fn(async (_u: unknown, init?: { body?: string }) => { llamadasAlCerebro.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true, guardada: true }), { status: 200 }) }) as unknown as typeof fetch
})

describe('PATCH /api/manual/{client_id}/campos', () => {
  it('sin llave → 401 y no escribe nada', async () => {
    const { PATCH } = await import('../src/app/api/manual/[client_id]/campos/route')
    const r = await PATCH(pedido({ campos: { proposito: 'x' } }, 'mala'), { params: { client_id: C } })
    expect(r.status).toBe(401)
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('edita: versión 2, el cerebro recibe el campo por la puerta del dueño, se re-indexa y queda el rastro en eventos_de_emilio', async () => {
    const { PATCH } = await import('../src/app/api/manual/[client_id]/campos/route')
    const r = await PATCH(pedido({ campos: { proposito: 'Que todos coman rico' }, comentario: 'por teléfono', reviewer: 'emilio@x.com', origen: 'dashboard' }), { params: { client_id: C } })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ ok: true, version_nueva: 2, cambios: [{ campo: 'proposito', valor: 'Que todos coman rico', escrito_por: 'dueno' }], cerebro: { enviados: ['proposito'], pendientes: [] } })
    expect(db.tablas['client_brand_books']).toHaveLength(2)
    expect(llamadasAlCerebro[0]).toMatchObject({ tema: 'manual · proposito', canal: 'dashboard · manual', respuesta: 'Que todos coman rico' })
    expect(empujes).toHaveLength(1)
    const ev = db.tablas['eventos_de_emilio']
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ canal: 'dashboard', accion: 'tablero', decision: 'manual-campos', autor: 'emilio@x.com', client_id: C })
  })
  it('un campo que no se puede editar → 400, sin versión nueva, y también deja rastro', async () => {
    const { PATCH } = await import('../src/app/api/manual/[client_id]/campos/route')
    const r = await PATCH(pedido({ campos: { competidores: 'a' } }), { params: { client_id: C } })
    expect(r.status).toBe(400)
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(db.tablas['eventos_de_emilio']).toHaveLength(1)
  })
})
