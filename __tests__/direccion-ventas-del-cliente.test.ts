/** Las ventas del negocio en su punto de venta: solo lectura, ingresos netos de anuladas, días de Ecuador, y el recorte del plan a la vista. */
import { describe, expect, it } from 'vitest'
import { leerVentasDelCliente } from '../src/lib/direccion/ventas-del-cliente'
import type { Db, Fila } from '../src/lib/direccion/comun'

const ID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-11-02T21:00:00Z')
const CLIENTE: Fila = { id: ID, slug: 'naufrago', config: { moneda: 'USD', cliente_propio: true } }
const dbCon = (filas: Fila[], error: { message: string } | null = null): Db => {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) q[m] = () => q
  q.limit = async () => ({ data: error ? null : filas, error })
  return { from: () => q }
}
const R = (o: Fila): Fila => ({ created_at: '2026-11-01T18:00:00Z', total_money: 10, receipt_type: 'SALE', store_id: 's1', ...o })
type Pagina = { receipts?: Fila[]; cursor?: string; status?: number }
function loyverse(paginas: Pagina[], tiendas: Fila[] = [{ id: 's1', name: 'Urdenor' }, { id: 's2', name: 'Olón' }]) {
  const urls: string[] = []
  const f = (async (u: string) => {
    urls.push(String(u))
    if (String(u).endsWith('/stores')) return { ok: true, status: 200, json: async () => ({ stores: tiendas }) }
    const p = paginas.shift() ?? {}
    return { ok: (p.status ?? 200) < 400, status: p.status ?? 200, json: async () => p }
  }) as unknown as typeof fetch
  return { f, urls }
}
const ENV = { CLIENTE_NAUFRAGO_LOYVERSE_TOKEN: 'LLAVE-SECRETA' }
const ctx = (db: Db, f: typeof fetch, env: Record<string, string> = ENV) => ({ db, ahora: () => AHORA, fetchImpl: f, env }) as never
const PERIODO = { client_id: ID, desde: '2026-10-20', hasta: '2026-11-02' }
type Cuerpo = Record<string, any>
const leer = async (c: unknown, o: Record<string, unknown> = PERIODO) => { const r = await leerVentasDelCliente(c as never, o); return { status: r.status, c: r.cuerpo as Cuerpo } }

describe('las cifras', () => {
  it('🔴 suma ingreso y tickets; las anuladas y los reembolsos van aparte', async () => {
    const { f } = loyverse([{ receipts: [R({}), R({ total_money: 5 }), R({ total_money: 99, cancelled_at: '2026-11-01T19:00:00Z' }), R({ total_money: -3, receipt_type: 'REFUND' })] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(c.total).toEqual({ ingreso: 15, tickets: 2, reembolsos: 3, anuladas: 1 })
  })
  it('🔴 el día es el de Ecuador: las 02:00 UTC cuentan para el día anterior', async () => {
    const { f } = loyverse([{ receipts: [R({ created_at: '2026-11-02T02:00:00Z' })] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(c.por_dia.map((x: Cuerpo) => x.d)).toEqual(['2026-11-01'])
  })
  it('🔴 por día y por mes, en orden', async () => {
    const { f } = loyverse([{ receipts: [R({ created_at: '2026-11-01T18:00:00Z' }), R({ created_at: '2026-10-25T18:00:00Z', total_money: 7 })] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(c.por_dia.map((x: Cuerpo) => [x.d, x.ingreso])).toEqual([['2026-10-25', 7], ['2026-11-01', 10]])
    expect(c.por_mes.map((x: Cuerpo) => [x.mes, x.ingreso])).toEqual([['2026-10', 7], ['2026-11', 10]])
  })
  it('🔴 por sede con su nombre, la que más vende primero', async () => {
    const { f } = loyverse([{ receipts: [R({ store_id: 's1' }), R({ store_id: 's2', total_money: 50 })] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(c.por_tienda.map((x: Cuerpo) => [x.tienda, x.ingreso])).toEqual([['Olón', 50], ['Urdenor', 10]])
  })
  it('🔴 un recibo fuera del período pedido no entra', async () => {
    const { f } = loyverse([{ receipts: [R({ created_at: '2026-10-01T18:00:00Z' })] }])
    expect((await leer(ctx(dbCon([CLIENTE]), f))).c.total.tickets).toBe(0)
  })
  it('🔴 recorre todas las páginas', async () => {
    const { f, urls } = loyverse([{ receipts: [R({})], cursor: 'x' }, { receipts: [R({})] }])
    expect((await leer(ctx(dbCon([CLIENTE]), f))).c.total.tickets).toBe(2)
    expect(urls.filter((u) => u.includes('/receipts')).length).toBe(2)
  })
})

describe('el recorte del plan', () => {
  it('🔴 no pide a Loyverse más de 31 días atrás y lo declara', async () => {
    const { f, urls } = loyverse([{ receipts: [] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f), { ...PERIODO, desde: '2026-01-01' })
    const min = new URL(urls[0]).searchParams.get('created_at_min')!
    expect(AHORA.getTime() - Date.parse(min)).toBeLessThanOrEqual(31 * 86_400_000)
    expect(c.recortado_por_plan).toBe(true)
    expect(c.leido_desde).toBe('2026-10-02')
  })
  it('🔴 dentro de los 31 días no recorta', async () => {
    const { f } = loyverse([{ receipts: [] }])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(c.recortado_por_plan).toBe(false)
    expect(c.leido_desde).toBe('2026-10-20')
  })
  it('🔴 un período entero más viejo que el plan no llama a Loyverse', async () => {
    const { f, urls } = loyverse([])
    const { c } = await leer(ctx(dbCon([CLIENTE]), f), { ...PERIODO, desde: '2026-01-01', hasta: '2026-01-31' })
    expect(urls).toEqual([])
    expect(c).toMatchObject({ disponible: true, recortado_por_plan: true, leido_desde: null, por_dia: [] })
  })
  it('🔴 un período cerrado se pide solo hasta su último día', async () => {
    const { f, urls } = loyverse([{ receipts: [] }])
    await leer(ctx(dbCon([CLIENTE]), f), { ...PERIODO, hasta: '2026-10-25' })
    expect(new URL(urls[0]).searchParams.get('created_at_max')).toBe('2026-10-26T04:59:59.999Z')
  })
})

describe('el cliente', () => {
  it.each([['texto', 'true'], ['texto falso', 'false'], ['número', 1], ['objeto', {}]])('🔴 solo el verdadero real marca cliente propio: %s no', async (_n, valor) => {
    const { f } = loyverse([])
    expect((await leer(ctx(dbCon([{ ...CLIENTE, config: { cliente_propio: valor } }]), f))).c.cliente_propio).toBe(false)
  })
  it('🔴 dice si es un cliente propio y su moneda', async () => {
    const { f } = loyverse([{ receipts: [] }])
    expect((await leer(ctx(dbCon([CLIENTE]), f))).c).toMatchObject({ cliente_propio: true, moneda: 'USD' })
  })
  it('🔴 sin marca, no es propio', async () => {
    const { f } = loyverse([{ receipts: [] }])
    expect((await leer(ctx(dbCon([{ ...CLIENTE, config: {} }]), f))).c.cliente_propio).toBe(false)
  })
  it('🔴 sin punto de venta lo dice y no llama a nadie', async () => {
    const { f, urls } = loyverse([])
    const { status, c } = await leer(ctx(dbCon([CLIENTE]), f, {}))
    expect(status).toBe(200)
    expect(c).toMatchObject({ disponible: false, motivo: 'sin_punto_de_venta' })
    expect(urls).toEqual([])
  })
  it('🔴 un cliente que no existe da 404', async () => {
    expect((await leer(ctx(dbCon([]), loyverse([]).f))).status).toBe(404)
  })
  it('🔴 si la base falla, da 500', async () => {
    expect((await leer(ctx(dbCon([], { message: 'caída' }), loyverse([]).f))).status).toBe(500)
  })
})

describe('las fallas no se disfrazan', () => {
  it('🔴 si Loyverse rechaza, es error y no ventas en cero', async () => {
    const { f } = loyverse([{ status: 401 }])
    const { status, c } = await leer(ctx(dbCon([CLIENTE]), f))
    expect(status).toBe(502)
    expect(c).toMatchObject({ ok: false, error: 'punto_de_venta_error' })
    expect(c).not.toHaveProperty('total')
  })
  it('🔴 la llave nunca sale en la respuesta', async () => {
    const f = (async () => { throw new Error('falló con LLAVE-SECRETA') }) as unknown as typeof fetch
    expect(JSON.stringify((await leer(ctx(dbCon([CLIENTE]), f))).c)).not.toContain('LLAVE-SECRETA')
  })
  it('🔴 sin nombres de sede, las ventas igual salen', async () => {
    const { f } = loyverse([{ receipts: [R({})] }], [])
    expect((await leer(ctx(dbCon([CLIENTE]), f))).c.por_tienda).toEqual([expect.objectContaining({ tienda: null, ingreso: 10 })])
  })
})

describe('la entrada se valida', () => {
  it.each([[{ ...PERIODO, client_id: 'x' }], [{ ...PERIODO, desde: 'ayer' }], [{ ...PERIODO, desde: '2026-11-03' }], [{ ...PERIODO, desde: '2026-02-31' }]])('🔴 rechaza %j', async (o) => {
    expect((await leer(ctx(dbCon([CLIENTE]), loyverse([]).f), o)).status).toBe(400)
  })
})
