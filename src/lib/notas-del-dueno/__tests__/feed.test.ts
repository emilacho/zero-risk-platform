import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventoParaElCerebro, fechaDe, limiteDe, LIMITE_MAXIMO, LIMITE_POR_OMISION, VERSION_DEL_FEED } from '../feed'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import type { Nota } from '../tipos'

const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTRO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
let db: DbFalsa
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))

const fila = (n: Nota): Record<string, unknown> => ({ ...n })
const nota = (o: Partial<Nota> & { id: string }): Nota => ({ client_id: CLIENTE, alcance: 'cliente', tipo: 'rechazada', comentario: 'Más corto', hitl_id: 'h1', output_id: 'o1', pieza_titulo: 'Post', pieza_version: '3', pieza_familia: 'post_img', origen: 'slack', autor: 'U1', clave_unica: o.id, creada_en: '2026-10-21T12:00:00.000Z', ...o })

describe('la forma estable que el cerebro ingiere', () => {
  it('cliente, pieza, decisión, comentario y fecha, con versión del esquema', () => {
    expect(eventoParaElCerebro(nota({ id: 'a' }))).toEqual({
      esquema: VERSION_DEL_FEED, id: 'a', client_id: CLIENTE, alcance: 'cliente', decision: 'rechazada', comentario: 'Más corto',
      pieza: { hitl_id: 'h1', output_id: 'o1', titulo: 'Post', version: '3', familia: 'post_img' }, fecha: '2026-10-21T12:00:00.000Z', autor: 'U1', origen: 'slack',
    })
    expect(VERSION_DEL_FEED).toBe('notas_del_dueno.v1')
  })
  it('una aprobación sin comentario también sale (el cerebro decide qué hacer con ella)', () => {
    expect(eventoParaElCerebro(nota({ id: 'a', tipo: 'aprobada', comentario: null }))).toMatchObject({ decision: 'aprobada', comentario: null })
  })
  it('el tope y la fecha pedidos se acotan o se rechazan', () => {
    expect(limiteDe(null)).toBe(LIMITE_POR_OMISION); expect(limiteDe('')).toBe(LIMITE_POR_OMISION); expect(limiteDe('abc')).toBe(LIMITE_POR_OMISION)
    expect(limiteDe('0')).toBe(LIMITE_POR_OMISION); expect(limiteDe('-5')).toBe(LIMITE_POR_OMISION); expect(limiteDe('2.5')).toBe(LIMITE_POR_OMISION)
    expect(limiteDe('7')).toBe(7); expect(limiteDe('99999')).toBe(LIMITE_MAXIMO)
    expect(fechaDe('2026-10-21T12:00:00Z')).toBe('2026-10-21T12:00:00.000Z'); expect(fechaDe('ayer')).toBeNull(); expect(fechaDe(null)).toBeNull(); expect(fechaDe('')).toBeNull()
  })
})

describe('GET /api/notas-del-dueno/feed', () => {
  beforeEach(() => {
    db = new DbFalsa()
    process.env.INTERNAL_API_KEY = 'llave'
    db.semilla('notas_del_dueno', [
      nota({ id: 'n1', creada_en: '2026-10-21T10:00:00.000Z' }), nota({ id: 'n2', creada_en: '2026-10-21T11:00:00.000Z', tipo: 'aprobada', comentario: null }),
      nota({ id: 'n3', creada_en: '2026-10-21T12:00:00.000Z', client_id: OTRO, alcance: 'general' }), nota({ id: 'n4', creada_en: '2026-10-21T13:00:00.000Z' }),
    ].map(fila))
  })
  afterEach(() => { delete process.env.INTERNAL_API_KEY })
  const pedir = async (q: string, llave: string | null = 'llave') => { const { GET } = await import('@/app/api/notas-del-dueno/feed/route'); return GET(new Request(`https://app.test/api/notas-del-dueno/feed${q}`, { headers: llave ? { 'x-api-key': llave } : {} })) }
  it('sin llave 401; parámetros mal formados 400', async () => {
    expect((await pedir('', null)).status).toBe(401)
    expect((await pedir('', 'mala')).status).toBe(401)
    expect((await pedir('?client_id=nope')).status).toBe(400)
    expect((await pedir('?desde=ayer')).status).toBe(400)
  })
  it('de la más vieja a la más nueva; con client_id solo las de ese cliente; sin él, todas', async () => {
    const uno = await (await pedir(`?client_id=${CLIENTE}`)).json()
    expect(uno.eventos.map((e: { id: string }) => e.id)).toEqual(['n1', 'n2', 'n4'])
    expect(uno.esquema).toBe(VERSION_DEL_FEED)
    const todas = await (await pedir('')).json()
    expect(todas.eventos.map((e: { id: string }) => e.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(todas.eventos[2]).toMatchObject({ alcance: 'general', client_id: OTRO })
  })
  it('el cursor: con `limite` pagina y con `desde` solo trae lo nuevo, sin repetir', async () => {
    const p1 = await (await pedir('?limite=2')).json()
    expect(p1.eventos.map((e: { id: string }) => e.id)).toEqual(['n1', 'n2']); expect(p1.hay_mas).toBe(true); expect(p1.siguiente_desde).toBe('2026-10-21T11:00:00.000Z')
    const p2 = await (await pedir(`?limite=2&desde=${encodeURIComponent(p1.siguiente_desde)}`)).json()
    expect(p2.eventos.map((e: { id: string }) => e.id)).toEqual(['n3', 'n4']); expect(p2.hay_mas).toBe(false)
    const p3 = await (await pedir(`?desde=${encodeURIComponent(p2.siguiente_desde)}`)).json()
    expect(p3.eventos).toEqual([]); expect(p3.siguiente_desde).toBe(p2.siguiente_desde) // nada nuevo: el cursor no retrocede
  })
  it('un error de la base NO se devuelve como «sin notas»', async () => {
    db.fallar['notas_del_dueno'] = 'caída'
    expect((await pedir('')).status).toBe(500)
  })
})
