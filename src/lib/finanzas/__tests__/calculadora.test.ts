/** La calculadora financiera: determinista, sin modelo, cada número con su origen (dato o supuesto) y su rango. 3 rubros y 3 monedas (COP, USD, EUR). */
import { describe, expect, it } from 'vitest'
import { BATERIA_DE_RUBROS } from '../../rubros-de-prueba/baterias'
import { bloqueFinanciero, calcular, cifrasObligatorias, formatearDinero, type Dato, type EntradaFinanciera, type SalidaFinanciera } from '../calculadora'

const dato = (valor: number, fuente = 'precio publicado en su sitio'): Dato => ({ valor, origen: 'dato', fuente })
const supuesto = (valor: number, min: number, max: number, fuente = 'rango de mercado del sector (referencia pública)'): Dato => ({ valor, min, max, origen: 'supuesto', fuente })

const BASE: EntradaFinanciera = { moneda: 'USD', ticket: dato(20), margen: dato(0.5, 'costos que declara el negocio'), recompra: dato(1, 'historial de pedidos del negocio'), costo_pauta_por_cliente: supuesto(5, 4, 8), meta_clientes_nuevos: dato(100, 'meta del negocio') }
const ok = (e: EntradaFinanciera): SalidaFinanciera => { const r = calcular(e); if (!r.ok) throw new Error(JSON.stringify(r.faltan)); return r }

describe('los números (a mano)', () => {
  const s = ok(BASE)
  it('margen por venta, valor por cliente, costo máximo, retorno necesario y presupuesto de la meta', () => {
    expect(s.margen_por_venta.valor).toBe(10); expect(s.compras_por_cliente.valor).toBe(2); expect(s.valor_por_cliente.valor).toBe(20)
    expect(s.costo_maximo_por_cliente.valor).toBe(14) // 20 × (1 − 0,3)
    expect(s.retorno_necesario.valor).toBe(2) // 1 / 0,5
    expect(s.presupuesto_para_la_meta.valor).toBe(500); expect([s.presupuesto_para_la_meta.min, s.presupuesto_para_la_meta.max]).toEqual([400, 800])
    expect(s.punto_de_equilibrio_ventas.valor).toBe(50) // 500 / 10
  })
  it('≥ 2 escenarios con TODAS sus cifras: prudente 70 % de la meta con pauta +25 %, objetivo, ambicioso 140 % con +15 %', () => {
    expect(s.escenarios.map((e) => e.nombre)).toEqual(['prudente', 'objetivo', 'ambicioso'])
    const [p, o, a] = s.escenarios
    expect([p.clientes.valor, p.costo_por_cliente.valor, p.inversion.valor]).toEqual([70, 6.25, 437.5])
    expect([o.clientes.valor, o.inversion.valor, o.ventas.valor, o.ingreso.valor, o.utilidad.valor]).toEqual([100, 500, 200, 4000, 1500])
    expect([a.clientes.valor, a.costo_por_cliente.valor, a.inversion.valor]).toEqual([140, 5.75, 805])
    for (const e of s.escenarios) for (const k of ['clientes', 'costo_por_cliente', 'inversion', 'ventas', 'ingreso', 'utilidad', 'retorno_primera_compra', 'punto_de_equilibrio_clientes'] as const) expect(Number.isFinite(e[k].valor), `${e.nombre}.${k}`).toBe(true)
    expect(o.retorno_primera_compra.valor).toBe(4); expect(o.punto_de_equilibrio_clientes.valor).toBe(25)
    expect(o.rentable).toBe(true)
  })
  it('es determinista: la misma entrada da exactamente la misma salida', () => { expect(JSON.stringify(ok(BASE))).toBe(JSON.stringify(ok(JSON.parse(JSON.stringify(BASE))))) })
  it('el rango del costo de pauta se propaga: la utilidad del escenario objetivo va de más a menos y el peor caso puede dejar de ser rentable', () => {
    const o = s.escenarios[1]
    expect(o.utilidad.min).toBeLessThan(o.utilidad.valor); expect(o.utilidad.max).toBeGreaterThan(o.utilidad.valor)
    const caro = ok({ ...BASE, costo_pauta_por_cliente: supuesto(15, 10, 40) })
    expect(caro.escenarios[1].rentable).toBe(true); expect(caro.escenarios[1].rentable_en_el_peor_caso).toBe(false)
    expect(caro.costo_maximo_por_cliente.valor).toBeLessThan(15) // el mismo costo máximo, pero la pauta ya lo supera: queda a la vista
  })
})

describe('cada número dice si es dato o supuesto, y de qué depende', () => {
  it('con la pauta como supuesto: el presupuesto y los escenarios son SUPUESTO y dependen de la pauta; el margen por venta es DATO', () => {
    const s = ok(BASE)
    expect(s.margen_por_venta.origen).toBe('dato'); expect(s.margen_por_venta.depende_de).toEqual(['ticket', 'margen']); expect(s.margen_por_venta.supuestos_de).toEqual([])
    expect(s.presupuesto_para_la_meta.origen).toBe('supuesto'); expect(s.presupuesto_para_la_meta.supuestos_de).toEqual(['cpa'])
    expect(s.costo_maximo_por_cliente.origen).toBe('supuesto'); expect(s.costo_maximo_por_cliente.supuestos_de).toContain('utilidad') // la regla del 30 % de la calculadora
    for (const e of s.escenarios) expect(e.inversion.origen).toBe('supuesto')
  })
  it('todo dato (y utilidad objetivo dada como dato): el presupuesto es DATO; los escenarios siguen siendo supuesto (son hipótesis por definición)', () => {
    const s = ok({ ...BASE, costo_pauta_por_cliente: dato(5, 'cotización de la plataforma de anuncios'), utilidad_objetivo: dato(0.25, 'objetivo que declara el negocio') })
    expect(s.presupuesto_para_la_meta.origen).toBe('dato'); expect(s.costo_maximo_por_cliente.origen).toBe('dato')
    expect(s.escenarios.every((e) => e.inversion.origen === 'supuesto')).toBe(true)
  })
  it('las entradas conservan su fuente y las reglas propias de la calculadora van declaradas (no escondidas)', () => {
    const s = ok(BASE)
    expect(s.entradas.ticket.fuente).toBe('precio publicado en su sitio'); expect(s.entradas.costo_pauta_por_cliente.origen).toBe('supuesto')
    expect(s.supuestos_de_la_calculadora.map((x) => x.nombre)).toEqual(expect.arrayContaining(['utilidad_objetivo', 'escenario_prudente_meta', 'escenario_ambicioso_costo_de_pauta']))
  })
})

describe('nunca celdas vacías: lo que falta o no es razonable se DICE', () => {
  it('falta todo → lista cada campo', () => {
    const r = calcular({ moneda: 'USD' } as unknown as EntradaFinanciera)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.faltan.map((f) => f.campo)).toEqual(expect.arrayContaining(['ticket', 'recompra', 'costo_pauta_por_cliente', 'meta_clientes_nuevos', 'margen']))
  })
  it.each([
    ['sin fuente', { ...BASE, ticket: { valor: 20, origen: 'dato', fuente: '' } as Dato }, /fuente/],
    ['margen mayor que 1', { ...BASE, margen: dato(1.4) }, /fuera de lo razonable/],
    ['ticket cero', { ...BASE, ticket: dato(0) }, /fuera de lo razonable/],
    ['rango al revés', { ...BASE, costo_pauta_por_cliente: { valor: 5, min: 9, max: 4, origen: 'supuesto', fuente: 'rango de mercado' } }, /mínimo es mayor/],
    ['valor fuera de su rango', { ...BASE, costo_pauta_por_cliente: supuesto(10, 4, 8) }, /por encima de su máximo/],
    ['no dice si es dato o supuesto', { ...BASE, recompra: { valor: 1, fuente: 'historial de pedidos' } as unknown as Dato }, /dato o supuesto/],
    ['valor que no es número', { ...BASE, meta_clientes_nuevos: { valor: NaN, origen: 'dato', fuente: 'meta del negocio' } as Dato }, /no es un número/],
  ])('%s', (_n, e, re) => {
    const r = calcular(e as EntradaFinanciera)
    expect(r.ok).toBe(false); if (!r.ok) expect(JSON.stringify(r.faltan)).toMatch(re)
  })
  it('costo variable en lugar de margen; si el costo variable ≥ ticket no hay margen y se dice', () => {
    const { margen: _m, ...sinMargen } = BASE
    const s = ok({ ...sinMargen, costo_variable: dato(10, 'costos que declara el negocio') })
    expect(s.margen_por_venta.valor).toBe(10); expect(s.entradas.margen.valor).toBe(0.5)
    const r = calcular({ ...sinMargen, costo_variable: dato(20, 'costos que declara el negocio') })
    expect(r.ok).toBe(false)
  })
})

describe('3 rubros × 3 monedas (la batería de rubros)', () => {
  const casos: Array<{ rubro: string; e: EntradaFinanciera }> = [
    { rubro: 'comida', e: { moneda: 'USD', ticket: dato(4.5, 'precios publicados en su carta'), margen: supuesto(0.6, 0.5, 0.7, 'margen típico de comida preparada (rango del sector)'), recompra: supuesto(2, 1, 4, 'frecuencia de recompra típica de un local de barrio'), costo_pauta_por_cliente: supuesto(1.2, 0.8, 2, 'costo de pauta local en redes (rango de mercado)'), meta_clientes_nuevos: supuesto(300, 200, 400, 'propuesta a confirmar por el dueño') } },
    { rubro: 'clinica', e: { moneda: 'COP', ticket: dato(45000, 'tarifa publicada'), margen: supuesto(0.55, 0.45, 0.65, 'margen típico de consulta (rango del sector)'), recompra: supuesto(0.5, 0.2, 1, 'seguimiento de pacientes (rango)'), costo_pauta_por_cliente: supuesto(18000, 12000, 30000, 'costo de pauta de salud en la región (rango)'), meta_clientes_nuevos: dato(40, 'meta que declara la clínica') } },
    { rubro: 'servicio_b2b', e: { moneda: 'EUR', ticket: dato(1800, 'tarifa publicada'), costo_variable: supuesto(900, 700, 1100, 'costo directo típico del servicio (rango)'), recompra: supuesto(0.2, 0, 0.5, 'renovación típica B2B (rango)'), costo_pauta_por_cliente: supuesto(700, 400, 1200, 'costo por contacto cualificado B2B (rango)'), meta_clientes_nuevos: dato(6, 'meta del negocio') } },
  ]
  it.each(casos)('$rubro ($e.moneda): cuadra por dentro y por fuera', ({ e }) => {
    const s = ok(e)
    expect(s.moneda).toBe(e.moneda)
    const o = s.escenarios[1]
    // ingreso = ventas × ticket; utilidad = ventas × margen por venta − inversión; inversión = clientes × costo
    expect(o.ingreso.valor).toBeCloseTo(o.ventas.valor * e.ticket.valor, 1)
    expect(o.utilidad.valor).toBeCloseTo(o.ventas.valor * s.margen_por_venta.valor - o.inversion.valor, 1)
    expect(o.inversion.valor).toBeCloseTo(e.meta_clientes_nuevos.valor * e.costo_pauta_por_cliente.valor, 1)
    expect(s.presupuesto_para_la_meta.valor).toBe(o.inversion.valor)
    for (const c of [s.costo_maximo_por_cliente, s.presupuesto_para_la_meta, ...s.escenarios.map((x) => x.inversion)]) { expect(c.min).toBeLessThanOrEqual(c.valor); expect(c.max).toBeGreaterThanOrEqual(c.valor); expect(['dato', 'supuesto']).toContain(c.origen) }
    expect(bloqueFinanciero(s).join('\n')).toContain(`Moneda: ${e.moneda}`)
  })
  it('las cifras que el plan debe traer: costo máximo, presupuesto de la meta y la inversión de cada escenario', () => {
    const s = ok(casos[1].e)
    expect(cifrasObligatorias(s).map((c) => c.que)).toEqual(['costo máximo por cliente nuevo', 'presupuesto para la meta', 'inversión del escenario prudente', 'inversión del escenario objetivo', 'inversión del escenario ambicioso'])
  })
  it('el bloque dice dato o supuesto en cada línea y manda usarlo tal cual', () => {
    const t = bloqueFinanciero(ok(casos[0].e)).join('\n')
    expect(t).toMatch(/úsalo TAL CUAL, no recalcules/); expect(t).toMatch(/COSTO MÁXIMO por cliente nuevo/); expect(t).toMatch(/PRESUPUESTO PARA LA META/); expect(t).toMatch(/INVERSIÓN/)
    expect(t.split('\n').filter((l) => /^- (PRESUPUESTO|COSTO|margen|valor)/.test(l)).every((l) => /· (dato|supuesto)/.test(l))).toBe(true)
    expect(t).toMatch(/precios publicados en su carta/); expect(t).toMatch(/rango de mercado/)
  })
  it('agnóstico: la calculadora no nombra un cliente, un lugar ni un rubro', async () => {
    const { readFileSync } = await import('node:fs'); const { join } = await import('node:path')
    const fuente = readFileSync(join(process.cwd(), 'src/lib/finanzas/calculadora.ts'), 'utf8')
    expect(fuente).not.toMatch(/n[aá]ufrago|ol[oó]n\b|guayaquil|ecuador|restaurante|cevich|encebollado|marisc|cafeter[ií]a|cl[ií]nica|hotel|p[eé]rez|peniche/i)
    expect(BATERIA_DE_RUBROS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('dinero legible', () => {
  it.each([[1250.5, 'USD', 'USD 1.250,50'], [45000, 'COP', 'COP 45.000'], [1800, 'EUR', 'EUR 1.800'], [437.5, 'USD', 'USD 437,50'], [12, 'USD', 'USD 12']])('%s %s', (n, m, esperado) => {
    expect(formatearDinero(n, m).replace(/\s/g, ' ')).toMatch(new RegExp('^' + m + ' '))
    expect(formatearDinero(n, m).replace(/[  ]/g, '')).toBe(esperado.replace(/ /g, ''))
  })
})
