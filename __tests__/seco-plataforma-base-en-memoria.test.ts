/**
 * 04-nov · la base en memoria del doble chequeo en seco, probada con el cliente real de Supabase: es lo que usan las rutas.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearBase } from '../scripts/ops/seco-plataforma/base-en-memoria.mjs'

type Base = ReturnType<typeof crearBase>
let base: Base
let db: ReturnType<typeof conectar>

function conectar(b: Base) {
  return createClient('http://localhost:9', 'k', {
    auth: { persistSession: false },
    global: {
      fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
        const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url)
        const cabeceras = Object.fromEntries(new Headers(init?.headers).entries())
        const r = b.atender({ metodo: init?.method ?? 'GET', ruta: url.pathname, query: url.searchParams, cabeceras, cuerpo: init?.body ? JSON.parse(String(init.body)) : null })
        return new Response(r.status === 204 || r.cuerpo === null ? null : JSON.stringify(r.cuerpo), { status: r.status, headers: { 'content-type': 'application/json', ...r.cabeceras } })
      }) as typeof fetch,
    },
  })
}

const FILAS = [
  { id: 'a', estado: 'abierto', n: 1, nota: null, config: { x: 'uno' } },
  { id: 'b', estado: 'cerrado', n: 2, nota: 'hola mundo', config: { x: 'dos' } },
  { id: 'c', estado: 'en_curso', n: 3, nota: null, config: { x: 'uno' } },
]

beforeEach(() => {
  base = crearBase({
    tablas: { t: FILAS, 'sitio.orders': [{ status: 'DELIVERED' }], encargos: [{ id: 'e1', client_id: 'c1', estado: 'abierto' }] },
    unicas: [{ tabla: 'encargos', columnas: ['client_id'], donde: { estado: ['abierto', 'en_curso'] } }],
  })
  db = conectar(base)
})

const ids = (r: { data: unknown }) => (r.data as { id: string }[]).map((f) => f.id)

describe('leer', () => {
  it.each([
    ['eq', () => db.from('t').select('id').eq('estado', 'abierto'), ['a']],
    ['neq', () => db.from('t').select('id').neq('estado', 'abierto'), ['b', 'c']],
    ['in', () => db.from('t').select('id').in('estado', ['abierto', 'en_curso']), ['a', 'c']],
    ['is null', () => db.from('t').select('id').is('nota', null), ['a', 'c']],
    ['gte', () => db.from('t').select('id').gte('n', 2), ['b', 'c']],
    ['lt', () => db.from('t').select('id').lt('n', 2), ['a']],
    ['like', () => db.from('t').select('id').like('nota', 'hola%'), ['b']],
    ['or', () => db.from('t').select('id').or('nota.is.null,n.lt.2'), ['a', 'c']],
    ['json', () => db.from('t').select('id').eq('config->>x', 'dos'), ['b']],
  ] as const)('🔴 filtra con %s', async (_n, consulta, esperado) => { expect(ids(await consulta())).toEqual(esperado) })
  it('🔴 ordena, limita y pagina', async () => {
    expect(ids(await db.from('t').select('id').order('n', { ascending: false }).limit(1))).toEqual(['c'])
    expect(ids(await db.from('t').select('id').order('n').range(1, 2))).toEqual(['b', 'c'])
  })
  it('🔴 devuelve solo las columnas pedidas, y null si no existe: no valida columnas', async () => {
    expect((await db.from('t').select('id,noexiste').eq('id', 'a')).data).toEqual([{ id: 'a', noexiste: null }])
  })
  it('🔴 maybeSingle sin filas da vacío, y single sin filas da error', async () => {
    expect(await db.from('t').select('id').eq('id', 'z').maybeSingle()).toMatchObject({ data: null, error: null })
    expect((await db.from('t').select('id').eq('id', 'z').single()).error?.code).toBe('PGRST116')
  })
  it('🔴 cuenta', async () => { expect((await db.from('t').select('id', { count: 'exact' }).eq('estado', 'abierto')).count).toBe(1) })
  it('🔴 una tabla que no está se dice como en la base real', async () => {
    expect((await db.from('otra').select('id')).error?.code).toBe('PGRST205')
  })
  it('🔴 lee otra área, y un área que no está da el código que el lector de ventas espera', async () => {
    const con = db as unknown as { schema(s: string): { from(t: string): { select(c: string): PromiseLike<{ data: unknown; error: { code?: string } | null }> } } }
    expect((await con.schema('sitio').from('orders').select('status')).data).toEqual([{ status: 'DELIVERED' }])
    expect((await con.schema('nadie').from('orders').select('status')).error?.code).toBe('PGRST106')
  })
  it('🔴 un operador que no conoce responde con error, no con un filtro que deja pasar todo', () => {
    expect(() => base.atender({ metodo: 'GET', ruta: '/rest/v1/t', query: new URLSearchParams('n=fts.x'), cabeceras: {}, cuerpo: null })).toThrow('operador no soportado')
  })
  it('🔴 lo incrustado no se finge', () => {
    expect(() => base.atender({ metodo: 'GET', ruta: '/rest/v1/t', query: new URLSearchParams('select=id,otra(x)'), cabeceras: {}, cuerpo: null })).toThrow('no incrusta')
  })
})

const tablaLibre = () => db.from('t') as unknown as {
  insert(f: unknown): { select(c: string): { single(): PromiseLike<{ data: { id: string } | null }> } }
  update(f: unknown): { eq(c: string, v: string): PromiseLike<unknown> }
  upsert(f: unknown, o: { onConflict: string }): PromiseLike<unknown>
  delete(): { eq(c: string, v: string): PromiseLike<unknown> }
}
const encargos = () => db.from('encargos') as unknown as {
  insert(f: unknown): PromiseLike<{ error: { code?: string } | null }>
}

describe('escribir', () => {
  it('🔴 inserta con identificador y lo devuelve', async () => {
    const r = await tablaLibre().insert({ estado: 'nuevo' }).select('id').single()
    expect(r.data?.id).toBeTruthy()
    expect(base.tablas().t).toHaveLength(4)
  })
  it('🔴 actualiza solo lo filtrado', async () => {
    await tablaLibre().update({ estado: 'listo' }).eq('id', 'a')
    expect(base.tablas().t.map((f: { estado: string }) => f.estado)).toEqual(['listo', 'cerrado', 'en_curso'])
  })
  it('🔴 fusiona por la columna indicada, sin duplicar', async () => {
    await tablaLibre().upsert({ id: 'a', estado: 'fusionado' }, { onConflict: 'id' })
    expect(base.tablas().t).toHaveLength(3)
    expect(base.tablas().t[0]).toMatchObject({ estado: 'fusionado', n: 1 })
  })
  it('🔴 borra solo lo filtrado', async () => {
    await tablaLibre().delete().eq('id', 'a')
    expect(ids({ data: base.tablas().t })).toEqual(['b', 'c'])
  })
  it('🔴 respeta «una abierta por cliente»: el código depende de ese choque', async () => {
    expect((await encargos().insert({ client_id: 'c1', estado: 'en_curso' })).error?.code).toBe('23505')
    expect((await encargos().insert({ client_id: 'c1', estado: 'cerrado' })).error).toBeNull()
    expect((await encargos().insert({ client_id: 'c2', estado: 'abierto' })).error).toBeNull()
  })
  it('🔴 dice qué tablas se escribieron, y solo esas', async () => {
    expect(base.cambios()).toEqual({})
    await tablaLibre().update({ estado: 'listo' }).eq('id', 'a')
    expect(base.cambios()).toEqual({ t: { antes: 3, ahora: 3 } })
  })
  it('🔴 no toca la semilla original', async () => {
    await tablaLibre().update({ estado: 'listo' }).eq('id', 'a')
    expect(FILAS[0].estado).toBe('abierto')
  })
})
