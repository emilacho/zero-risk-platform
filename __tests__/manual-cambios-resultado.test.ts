/** 02-nov · qué dejó un pedido de cambios al manual: si no cambió nada, el aviso de lo validado queda en el pedido. La lectura la pinta el tablero (CC6). */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resultadoDelPedido } from '../src/lib/manual/pedido-de-cambios'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const m = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => m.db }))
vi.mock('@/lib/brain/push-al-terminar', () => ({ empujarManualAlCerebro: () => ({ estado: 'no_empujado' }) }))
const { POST } = await import('../src/app/api/brand-book/[clientId]/route')

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ctx = { params: Promise.resolve({ clientId: C }) }
const META = { tono_por_canal: { fuente: 'dueno' }, mision: { fuente: 'dueno' } }
const VIGENTE = { positioning: 'Vieja', mision: 'Misión de Emilio', tono_por_canal: ['Instagram: cercano'], _field_meta: META }
const EQUIPO = { reescritura: true, protegidos: ['tono_por_canal', 'reglas_de_escritura'], tocados_validados: ['tono_por_canal'], declarado: ['pedir cambios: conserva lo validado: tono_por_canal'] }
const guardar = (bb: Record<string, unknown>) => POST(new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ brand_book: bb, manual_cambio_id: P }) }), ctx)
const base = (p: Record<string, unknown> = {}) => new DbFalsa()
  .semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: VIGENTE }) }])
  .semilla('clients', [{ id: C }])
  .semilla('plan_cambios', [{ id: P, client_id: C, documento: 'manual', estado: 'en_reescritura', campos_liberados: [], creado_en: '2026-11-02T10:00:00Z', manual_nuevo_id: null, ...p }])
const pedido = (db: DbFalsa) => db.tablas['plan_cambios'][0]

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k' })

describe('🔴 los tres casos', () => {
  it('un pedido sobre un campo validado que no se toca: no hay versión, y el motivo queda en el pedido', async () => {
    const db = base(); m.db = db
    const j = await (await guardar({ ...VIGENTE, _equipo: EQUIPO })).json()
    expect(j).toMatchObject({ persisted: false, sin_cambios_reales: true })
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(pedido(db).resultado).toEqual({ sin_cambios: true, protegidos: ['tono_por_canal', 'reglas_de_escritura'], tocados_validados: ['tono_por_canal'], declarado: EQUIPO.declarado })
    expect(pedido(db).manual_nuevo_id).toBeNull()
  })

  it('un pedido que cambia algo: versión nueva, y sin_cambios es falso', async () => {
    const db = base(); m.db = db
    const j = await (await guardar({ ...VIGENTE, positioning: 'Nueva' })).json()
    expect(j).toMatchObject({ persisted: true, version: 2 })
    expect(pedido(db).resultado).toEqual({ sin_cambios: false, protegidos: [], tocados_validados: [], declarado: [] })
  })

  it('un pedido mixto: cambia lo no validado, y el aviso nombra solo lo que no se tocó', async () => {
    const db = base(); m.db = db
    const j = await (await guardar({ ...VIGENTE, positioning: 'Nueva', _equipo: EQUIPO })).json()
    expect(j).toMatchObject({ persisted: true, version: 2 })
    expect(pedido(db).resultado).toMatchObject({ sin_cambios: false, tocados_validados: ['tono_por_canal'] })
    expect(pedido(db).manual_nuevo_id).not.toBeNull()
  })
})

describe('🔴 sin efectos', () => {
  it('no cambia ni el texto ni el estado del manual', async () => {
    const db = base(); m.db = db
    const antes = JSON.stringify(db.tablas['client_brand_books'])
    await guardar({ ...VIGENTE, _equipo: EQUIPO })
    expect(JSON.stringify(db.tablas['client_brand_books'])).toBe(antes)
    expect(pedido(db).estado).toBe('en_reescritura')
  })

  it('repetir la misma llamada no crea versión y deja lo mismo', async () => {
    const db = base(); m.db = db
    await guardar({ ...VIGENTE, _equipo: EQUIPO })
    const primero = pedido(db).resultado
    await guardar({ ...VIGENTE, _equipo: EQUIPO })
    expect(pedido(db).resultado).toEqual(primero)
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })

  it('sin pedido, no se escribe nada en plan_cambios', async () => {
    const db = base(); m.db = db
    await POST(new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify({ brand_book: { ...VIGENTE, positioning: 'Nueva', _equipo: EQUIPO } }) }), ctx)
    expect(pedido(db)).not.toHaveProperty('resultado')
  })

  it('si no se pudo escribir, el recibo lo dice y no se cae', async () => {
    const db = base(); m.db = db
    const falsa = { from: (t: string) => { const q = db.from(t) as unknown as Record<string, unknown>; if (t !== 'plan_cambios') return q; return new Proxy(q, { get: (o, k) => (k === 'update' ? () => ({ eq: async () => ({ error: { message: 'caída' } }) }) : typeof o[k as string] === 'function' ? (o[k as string] as (...a: unknown[]) => unknown).bind(o) : o[k as string]) }) } }
    m.db = falsa
    const r = await guardar({ ...VIGENTE, _equipo: EQUIPO })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ persisted: false, sin_cambios_reales: true, resultado_sin_guardar: 'caída' })
  })
})

describe('resultadoDelPedido', () => {
  it('🔴 sin lo que declaró el equipo, sale vacío y no falla', () => {
    expect(resultadoDelPedido({}, true)).toEqual({ sin_cambios: true, protegidos: [], tocados_validados: [], declarado: [] })
    expect(resultadoDelPedido({ _equipo: 'x', }, false)).toEqual({ sin_cambios: false, protegidos: [], tocados_validados: [], declarado: [] })
  })
  it('🔴 solo nombra campos reales del manual, y sin repetir', () => {
    expect(resultadoDelPedido({ _equipo: { protegidos: ['vision', 'inventado', 'vision', 5] } }, true).protegidos).toEqual(['vision'])
  })
  it('🔴 tocados_validados es lo que dice el equipo, no lo protegido: el aviso no nombra de más', () => {
    const r = resultadoDelPedido({ _equipo: { protegidos: ['tono_por_canal', 'reglas_de_escritura', 'valores'], tocados_validados: ['tono_por_canal', 'tono_por_canal', 'inventado'] } }, true)
    expect(r.tocados_validados).toEqual(['tono_por_canal'])
    expect(r.protegidos).toHaveLength(3)
  })
  it('🔴 el pedido vago: nada que nombrar, y sigue siendo sin cambios', () => {
    expect(resultadoDelPedido({ _equipo: { protegidos: ['valores'], tocados_validados: [] } }, true)).toMatchObject({ sin_cambios: true, tocados_validados: [] })
  })

  it('🔴 lo declarado tiene tope, y solo son textos', () => {
    const r = resultadoDelPedido({ _equipo: { declarado: [...Array.from({ length: 30 }, () => 'x'.repeat(500)), 7, ''] } }, true)
    expect(r.declarado).toHaveLength(20)
    expect(r.declarado[0]).toHaveLength(300)
  })
})
