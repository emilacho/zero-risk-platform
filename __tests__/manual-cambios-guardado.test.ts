/** 02-nov · el guardado del manual con un pedido: una versión por pedido y el pedido queda ligado. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const m = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => m.db }))
vi.mock('@/lib/brain/push-al-terminar', () => ({ empujarManualAlCerebro: () => ({ estado: 'no_empujado' }) }))
const { POST } = await import('../src/app/api/brand-book/[clientId]/route')

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ctx = { params: Promise.resolve({ clientId: C }) }
const previa = { id: 'v1', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: { mision: 'Misión de Emilio', vision: 'Visión de Emilio', _field_meta: { mision: { fuente: 'dueno', en: '2026-10-01T00:00:00Z' }, vision: { fuente: 'dueno', en: '2026-10-01T00:00:00Z' } } } }) }
const guardar = (cuerpo: Record<string, unknown>) => POST(new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ brand_book: { positioning: 'Nueva', mision: 'Misión nueva', vision: 'Visión nueva' }, ...cuerpo }) }), ctx)
const base = (p: Record<string, unknown> = {}) => new DbFalsa().semilla('client_brand_books', [previa]).semilla('clients', [{ id: C }]).semilla('plan_cambios', [{ id: P, client_id: C, documento: 'manual', estado: 'en_reescritura', campos_liberados: ['mision'], creado_en: '2026-11-02T10:00:00Z', manual_nuevo_id: null, ...p }])
const ultima = (db: DbFalsa) => [...db.tablas['client_brand_books']].sort((a, b) => Number(b.version) - Number(a.version))[0]

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k' })

describe('🔴 guardar con un pedido', () => {
  it('libera lo pedido, conserva lo demás, deja el rastro y liga el pedido', async () => {
    const db = base(); m.db = db
    const r = await guardar({ manual_cambio_id: P })
    expect(r.status).toBe(200)
    const j = await r.json()
    const u = ultima(db)
    const d = JSON.parse(String(u.content_text)).brand_book_draft
    expect(d.mision).toBe('Misión nueva')
    expect(d.vision).toBe('Visión de Emilio')
    expect(u.provenance_tag).toEqual({ type: 'evidence', source: 'legacy_pre_adr012', trust_level: 'unknown', manual_cambio_id: P })
    expect(j).toMatchObject({ persisted: true, version: 2, manual_cambio_id: P })
    expect(db.tablas['plan_cambios'][0].manual_nuevo_id).toBe(u.id)
  })
  it('🔴 un pedido que ya generó versión no genera otra', async () => {
    const db = base({ manual_nuevo_id: 'v9' }); m.db = db
    const j = await (await guardar({ manual_cambio_id: P })).json()
    expect(j).toMatchObject({ persisted: true, ya_guardado: true, id: 'v9' })
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('🔴 un pedido inválido no guarda', async () => {
    const db = base(); m.db = db
    expect((await guardar({ manual_cambio_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })).status).toBe(404)
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('🔴 sin pedido, nada cambia: se conserva lo del dueño y el rastro no se toca', async () => {
    const db = base(); m.db = db
    const j = await (await guardar({})).json()
    const u = ultima(db)
    expect(JSON.parse(String(u.content_text)).brand_book_draft.mision).toBe('Misión de Emilio')
    expect(u.provenance_tag).toBeUndefined()
    expect(j).not.toHaveProperty('manual_cambio_id')
    expect(db.tablas['plan_cambios'][0].manual_nuevo_id).toBeNull()
  })
  it('🔴 si no se pudo ligar, el recibo lo dice', async () => {
    const db = base()
    const de = db.from.bind(db)
    db.from = ((t: string) => { const q = de(t) as unknown as Record<string, unknown>; if (t === 'plan_cambios') q.update = () => ({ eq: async () => ({ error: { message: 'sin permiso' } }) }); return q }) as never
    m.db = db
    expect(await (await guardar({ manual_cambio_id: P })).json()).toMatchObject({ persisted: true, pedido_sin_ligar: 'sin permiso' })
  })
})
