/**
 * 04-nov · Emilio: «¿no sería un dato más real las ventas en Loyverse?». La cifra total es la de la caja y lo del sitio es un desglose: nunca una suma aparte.
 */
import { describe, expect, it } from 'vitest'
import { armarVentasDelNegocio, leerVentasDelNegocio, periodosDeCaja, REGLA_DE_LAS_VENTAS } from '../src/lib/planeacion/ventas-del-negocio'
import { resumirPedidos, type DbDeVentas } from '../src/lib/planeacion/ventas-del-sitio'

const CL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ficha = (atributo: string, valor: unknown, o: Record<string, unknown> = {}, datos: Record<string, unknown> = {}) => ({ atributo, provenance_tag: { metrica: { valor }, datos }, fecha_fuente: '2026-11-04', creado_en: '2026-11-04T10:00:00Z', ...o })
// las fichas vivas reales de Náufrago, medidas el 4-nov
const REALES = [
  ficha('metrica:loyverse:ingreso:ultimos_30_dias', 5799.3, { fecha_fuente: '2026-11-03' }, { ventana_hasta: '2026-11-04' }),
  ficha('metrica:loyverse:tickets:ultimos_30_dias', 524),
  ficha('metrica:loyverse:ingreso:2026-11', 1607.25, {}, { en_curso: true, hasta: '2026-11-04' }),
  ficha('metrica:loyverse:tickets:2026-11', 124),
  ficha('metrica:loyverse:ingreso:2026-10', 4917.3, {}, { en_curso: false, hasta: '2026-10-31' }),
  ficha('metrica:loyverse:tickets:2026-10', 479),
  ficha('metrica:loyverse:ingreso:2026-10:tienda-naufrago', 4530),
  ficha('metrica:loyverse:ingreso:2026-10:tienda-naufrago-guayaquil', 10.3),
  ficha('metrica:loyverse:ingreso:2026-11:tienda-naufrago', 1607.25),
]
const WEB_SIN_VENTAS = resumirPedidos([{ status: 'DELIVERED', es_prueba: true, payment_status: 'CAPTURED', total_usd: 10 }], ['Guayaquil'])
const WEB_CON_UNA = resumirPedidos([{ status: 'DELIVERED', es_prueba: false, payment_status: 'CAPTURED', total_usd: 25, created_at: '2026-11-03T10:00:00Z' }])

describe('la caja, de las fichas a los periodos', () => {
  const { proveedor, periodos } = periodosDeCaja(REALES)
  it('🔴 lee el total del negocio y su proveedor, con tickets', () => {
    expect(proveedor).toBe('loyverse')
    expect(periodos.map((p) => p.periodo)).toEqual(['ultimos_30_dias', '2026-11', '2026-10'])
    expect(periodos[0]).toEqual({ periodo: 'ultimos_30_dias', ingreso: 5799.3, tickets: 524, medido_al: '2026-11-04', en_curso: false })
  })
  it('🔴 la cifra de una tienda no se cuenta como otro periodo: ya está dentro del total', () => {
    expect(periodos.find((p) => p.periodo === '2026-10')?.ingreso).toBe(4917.3)
    expect(JSON.stringify(periodos)).not.toContain('4530')
  })
  it('🔴 sirve para cualquier proveedor de caja', () => {
    expect(periodosDeCaja([ficha('metrica:otra_caja:ingreso:2026-10', 100)]).proveedor).toBe('otra_caja')
  })
  it.each([
    ['retirada', { retirada_en: '2026-11-01' }],
    ['descartada', { descartada: true }],
    ['de prueba', { prueba: true }],
  ])('🔴 una ficha %s no cuenta', (_n, o) => {
    expect(periodosDeCaja([ficha('metrica:loyverse:ingreso:2026-10', 100, o)]).periodos).toEqual([])
  })
  it('🔴 sin una cifra medida no inventa cero', () => {
    expect(periodosDeCaja([ficha('metrica:loyverse:ingreso:2026-10', '100')]).periodos).toEqual([])
  })
  it('🔴 dos vivas del mismo periodo: manda la más nueva', () => {
    const r = periodosDeCaja([ficha('metrica:loyverse:ingreso:2026-10', 1, { creado_en: '2026-11-01' }), ficha('metrica:loyverse:ingreso:2026-10', 2, { creado_en: '2026-11-02' }), ficha('metrica:loyverse:ingreso:2026-10', 3, { creado_en: '2026-10-30' })])
    expect(r.periodos).toHaveLength(1)
    expect(r.periodos[0].ingreso).toBe(2)
  })
  it('sin fecha en los datos, usa la de la ficha', () => { expect(periodosDeCaja([ficha('metrica:loyverse:ingreso:2026-10', 1)]).periodos[0].medido_al).toBe('2026-11-04') })
  it('sin tickets medidos no los inventa', () => { expect(periodosDeCaja([ficha('metrica:loyverse:ingreso:2026-10', 1)]).periodos[0].tickets).toBeNull() })
})

describe('lo que reciben finanzas y el redactor', () => {
  const caja = periodosDeCaja(REALES)
  it('🔴 con la caja medida y 0 por la web: la cifra de la caja, y la frase firmada como desglose', () => {
    const v = armarVentasDelNegocio(caja, WEB_SIN_VENTAS)
    expect(v.estado).toBe('medido')
    expect(v.texto).toContain('ventas del negocio según su caja (loyverse): 5799.30 en 524 tickets en los últimos 30 días, medido al 2026-11-04')
    expect(v.texto).toContain('2026-10 cerró en 4917.30')
    expect(v.texto).toContain('2026-11 va en 1607.25 al 2026-11-04')
    expect(v.texto).toContain('Por la web: sin ventas reales por el sitio todavía; la sede de Guayaquil aún no abre.')
    expect(v.texto).toContain('no se suma')
  })
  it('🔴 no cuenta dos veces: el total no cambia con lo de la web', () => {
    const sin = armarVentasDelNegocio(caja, WEB_SIN_VENTAS), con = armarVentasDelNegocio(caja, WEB_CON_UNA)
    expect(con.ultimos_30_dias).toEqual(sin.ultimos_30_dias)
    expect(con.meses).toEqual(sin.meses)
    expect(con.por_la_web?.ingreso_usd).toBe(25)
    expect(con.texto).toContain('5799.30')
    expect(con.texto).not.toContain('5824.30')
    expect(con.regla).toBe(REGLA_DE_LAS_VENTAS)
  })
  it('🔴 viajan solo los 3 meses más nuevos, sin perder la ventana', () => {
    const v = armarVentasDelNegocio(periodosDeCaja([...['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m) => ficha(`metrica:loyverse:ingreso:${m}`, 10)), REALES[0]]), null)
    expect(v.meses.map((m) => m.periodo)).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(v.ultimos_30_dias?.ingreso).toBe(5799.3)
  })
  it('🔴 sin caja conectada dice que no se sabe el total, jamás «sin ventas», y da lo de la web', () => {
    const v = armarVentasDelNegocio({ proveedor: null, periodos: [] }, WEB_CON_UNA)
    expect(v.estado).toBe('sin_fuente')
    expect(v.texto).toContain('no se sabe cuánto vende en total')
    expect(v.texto).toContain('1 pedido real por el sitio')
  })
  it('🔴 con la caja ilegible no lo confunde con no tenerla', () => {
    const v = armarVentasDelNegocio(null, WEB_SIN_VENTAS)
    expect(v.estado).toBe('no_se_pudo')
    expect(v.texto).toContain('no se pudo leer la caja')
  })
  it('🔴 si lo de la web tampoco se pudo leer, lo dice', () => {
    expect(armarVentasDelNegocio(caja, null).texto).toContain('Por la web: no se pudo leer.')
  })
})

describe('leer de la base', () => {
  const db = (o: { fichas?: unknown[]; errorDeFichas?: boolean; revienta?: boolean } = {}) => {
    const pedidas: string[] = []
    const consulta = (data: unknown[], error: unknown = null, anotar = false) => {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'or', 'limit', 'order', 'range']) c[m] = (...a: unknown[]) => { if (anotar) pedidas.push(`${m}:${String(a[0])}`); return c }
      c.then = (ok: (r: unknown) => unknown) => ok({ data: error ? null : data, error })
      return c
    }
    return {
      pedidas,
      db: {
        from(t: string) {
          if (t === 'clients') return consulta([{ slug: 'sitio', config: {} }])
          if (t === 'cerebro_fichas') { if (o.revienta) throw new Error('caída'); return consulta(o.fichas ?? [], o.errorDeFichas ? { message: 'x' } : null, true) }
          return consulta([])
        },
        schema: () => ({ from: () => consulta([]) }),
      } as unknown as DbDeVentas,
    }
  }
  it('🔴 lee las fichas del cliente, sin retiradas, y las junta con lo de la web', async () => {
    const b = db({ fichas: REALES })
    const v = await leerVentasDelNegocio(b.db, CL)
    expect(v).toMatchObject({ estado: 'medido', proveedor: 'loyverse', por_la_web: { estado: 'medido', pedidos_reales: 0 } })
    expect(b.pedidas).toContain(`eq:client_id`)
    expect(b.pedidas).toContain('is:retirada_en')
  })
  it('🔴 un error de lectura dice no_se_pudo', async () => { expect((await leerVentasDelNegocio(db({ errorDeFichas: true }).db, CL)).estado).toBe('no_se_pudo') })
  it('🔴 una base caída no revienta', async () => { expect((await leerVentasDelNegocio(db({ revienta: true }).db, CL)).estado).toBe('no_se_pudo') })
  it('🔴 sin cliente no consulta fichas', async () => {
    const b = db({ revienta: true })
    expect((await leerVentasDelNegocio(b.db, null)).estado).toBe('no_se_pudo')
    expect(b.pedidas).toEqual([])
  })
})
