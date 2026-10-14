/**
 * OFICINA FINANCIERA · F2 · la calculadora (CC#1 · 14-oct) · diseño v2 rev. 8 §4 y §7.
 * Un solo motor, siete casos muy distintos (SOLO PRUEBAS: ninguna regla del código nombra un rubro, ciudad, cliente, producto, evento ni día).
 * Se prueba: las tablas doradas del papel; propiedades (suma exacta, monotonía, Meta+IG ≥ 60 %, sin NaN); bordes (rechazo con motivo); y que el 2.1 B / 2.2 A estén aplicados.
 */
import { describe, expect, it } from 'vitest'
import { calcular, chequeoDePrimeraVenta, primeraLecturaDia, repartoInverso, veredictoDe } from '../src/lib/finanzas/calculadora'
import { repartirPresupuesto } from '../src/lib/finanzas/repartir'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const ref = (min: number, max: number, base?: number) => ({ min, max, base, tipo: 'supuesto' as const, fuente: 'referencia de prueba (supuesto)' })
const ok = (e: Entrada): Bloque => { const r = calcular(e); if (!r.ok) throw new Error(r.errores.join(' · ')); return r }

const CASOS: Record<string, Entrada> = {
  c1: { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: ref(0.4, 1.2), dias_activos_por_semana: 5, produccion: { fraccion: 0.25, origen: 'plan' }, canales: [{ canal: 'canal_a', peso: 0.1, piso_diario: 29.7 }] },
  c2: { meta_por_semana: 10, ticket: 29, margen: 0.45, referencia: ref(8, 20), dias_activos_por_semana: 7, produccion: { fraccion: 0.2, origen: 'supuesto' }, canales: [{ canal: 'canal_a', peso: 0.15, piso_diario: 182 }], evento_alterno: { nombre: 'alterno', referencia: ref(1.5, 4) } },
  c3: { meta_por_semana: 1, pasos: [{ tasa: 0.3 }, { tasa: 0.4 }], ticket: 400000, margen: 0.6, referencia: ref(25000, 70000), dias_activos_por_semana: 5, ciclo_dias: 60, produccion: { fraccion: 0.15, origen: 'supuesto' }, canales: [{ canal: 'canal_b', peso: 0.25, piso_diario: 30000 }] },
  c4: { meta_por_semana: 12, pasos: [{ tasa: 0.15 }], ticket: 30, margen: 0.8, periodos: 6, referencia: ref(3, 9), dias_activos_por_semana: 7, produccion: { fraccion: 0.2, origen: 'supuesto' }, canales: [{ canal: 'canal_c', peso: 0.1, piso_diario: 15 }] },
  c5: { meta_por_semana: 6, pasos: [{ tasa: 0.4 }, { tasa: 0.75 }], ticket: 45, margen: 0.6, periodos: 2, referencia: ref(2, 6), dias_activos_por_semana: 5, produccion: { fraccion: 0.15, origen: 'supuesto' }, canales: [{ canal: 'canal_d', peso: 0.05, piso_diario: 0 }] },
  c6: { meta_por_semana: 150, ticket: 20, margen: 0.7, referencia: ref(4, 12), dias_activos_por_semana: 7, horizonte_dias: 14, produccion: { fraccion: 0.3, origen: 'plan' }, canales: [{ canal: 'canal_e', peso: 0.1, piso_diario: 50 }] },
  c7: { meta_por_semana: 25, referencia: ref(1.5, 5), dias_activos_por_semana: 7, produccion: { fraccion: 0.25, origen: 'supuesto' }, canales: [{ canal: 'canal_f', peso: 0.05, piso_diario: 0 }] },
}

describe('tablas doradas · los siete casos del papel (rev. 8 §7)', () => {
  const dorada: Record<string, { techo: number; ver: [string, string, string]; sens: [string, string]; res: number; sem: number; dia: number; min: number; conj: number; total: number; metaig: number; prod: number; lectura: number }> = {
    c1: { techo: 0.73, ver: ['sigo', 'ajusto_recorte', 'paro'], sens: ['sigo', 'ajusto_recorte'], res: 50, sem: 52, dia: 10.4, min: 10.4, conj: 1, total: 375.56, metaig: 281.67, prod: 93.89, lectura: 14 },
    c2: { techo: 9.14, ver: ['ajusto', 'ajusto_recorte', 'paro'], sens: ['ajusto', 'paro'], res: 10, sem: 182, dia: 26, min: 130, conj: 0, total: 1232.5, metaig: 986, prod: 246.5, lectura: 14 },
    c3: { techo: 20160, ver: ['ajusto_recorte', 'paro', 'paro'], sens: ['paro', 'paro'], res: 8.33, sem: 514583.33, dia: 102916.67, min: 617500, conj: 0, total: 4645544, metaig: 2787326, prod: 696832, lectura: 60 },
    c4: { techo: 15.12, ver: ['sigo', 'sigo', 'sigo'], sens: ['sigo', 'sigo'], res: 80, sem: 624, dia: 89.14, min: 55.71, conj: 1, total: 4829, metaig: 3380, prod: 966, lectura: 14 },
    c5: { techo: 11.34, ver: ['sigo', 'sigo', 'sigo'], sens: ['sigo', 'sigo'], res: 20, sem: 104, dia: 20.8, min: 52, conj: 0, total: 704, metaig: 563, prod: 106, lectura: 14 },
    c6: { techo: 9.8, ver: ['sigo', 'ajusto', 'ajusto_recorte'], sens: ['sigo', 'ajusto'], res: 150, sem: 1560, dia: 222.86, min: 74.29, conj: 3, total: 12071, metaig: 8450, prod: 3621, lectura: 4 },
    c7: { techo: 3.25, ver: ['sigo', 'ajusto', 'paro'], sens: ['sigo', 'ajusto_recorte'], res: 25, sem: 105.63, dia: 15.09, min: 30.18, conj: 0, total: 817, metaig: 572, prod: 204, lectura: 14 },
  }
  for (const [k, g] of Object.entries(dorada)) {
    it(`${k}: techo, veredictos, aprendizaje y reparto coinciden con el papel`, () => {
      const b = ok(CASOS[k])
      expect(b.techo.por_resultado).toBeCloseTo(g.techo, 2)
      expect([b.veredictos.cota_baja, b.veredictos.base, b.veredictos.cota_alta]).toEqual(g.ver)
      expect([b.veredictos.sens_menos, b.veredictos.sens_mas]).toEqual(g.sens)
      expect(b.aprendizaje.resultados_por_semana).toBeCloseTo(g.res, 1)
      expect(b.cifras.pauta_rendimiento_semana.valor).toBeCloseTo(g.sem, 1)
      expect(b.aprendizaje.diario).toBeCloseTo(g.dia, 1)
      expect(b.aprendizaje.minimo_por_conjunto).toBeCloseTo(g.min, 1)
      expect(b.aprendizaje.conjuntos).toBe(g.conj)
      expect(b.reparto.total_mes).toBeCloseTo(g.total, 0)
      expect(b.reparto.meta_ig).toBeCloseTo(g.metaig, 0)
      expect(b.reparto.produccion.monto).toBeCloseTo(g.prod, 0)
      expect(b.primera_lectura_dia).toBe(g.lectura)
    })
  }
  it('c2 · el evento alterno cabe (mínimo 25,54 ≤ diario 26) y se declara', () => {
    const b = ok(CASOS.c2)
    expect(b.alterno).toMatchObject({ nombre: 'alterno', conjuntos: 1 })
    expect(b.alterno!.minimo_por_conjunto).toBeCloseTo(25.54, 2)
  })
  it('c7 · sin valor monetario el techo es la referencia de mercado SIN arranque (R9), y el base NO sale «sigo» por construcción', () => {
    const b = ok(CASOS.c7)
    expect(b.techo.sin_valor_monetario).toBe(true)
    expect(b.techo.por_resultado).toBeCloseTo(3.25, 2)
    expect(b.costos.base).toBeCloseTo(4.23, 2)
    expect(b.veredictos.base).toBe('ajusto')
  })
})

describe('firmas 14-oct 2.1 B y 2.2 A', () => {
  it('2.2 A · un canal que no alcanza su piso se SUMA a Meta+IG y deja de existir el «sin asignar»', () => {
    const sin = ok({ ...CASOS.c1, canales: [] })
    const con = ok(CASOS.c1)
    expect(con.reparto.otros[0]).toMatchObject({ canal: 'canal_a', activo: false, monto: 0 })
    expect(con.reparto.sumado_a_meta_ig).toBeGreaterThan(0)
    expect(con.reparto.total_mes).toBeCloseTo(sin.reparto.total_mes, 1)
    expect(con.reparto.meta_ig).toBeCloseTo(sin.reparto.meta_ig, 1)
  })
  it('2.2 A · un canal que SÍ alcanza su piso recibe su parte y Meta+IG baja, pero nunca de 60 %', () => {
    const b = ok(CASOS.c3)
    expect(b.reparto.otros[0].activo).toBe(true)
    expect(b.reparto.otros[0].monto).toBeGreaterThan(0)
    expect(b.reparto.parte_meta_ig).toBeGreaterThanOrEqual(0.6 - 1e-9)
  })
  it('un canal diferido por el plan NO suma a Meta+IG: queda con su condición', () => {
    const b = ok({ ...CASOS.c1, canales: [{ canal: 'canal_a', peso: 0.1, piso_diario: 0, activo: false, condicion: 'señal de activación' }] })
    expect(b.reparto.otros[0]).toMatchObject({ activo: false, monto: 0 })
    expect(b.reparto.otros[0].motivo).toContain('diferido')
    expect(b.reparto.sumado_a_meta_ig).toBe(0)
  })
  it('2.1 B · la producción es un renglón VISIBLE dentro del total y MONTO FIJO: no sube en la temporada', () => {
    const b = ok(CASOS.c1)
    expect(b.reparto.produccion.monto).toBeGreaterThan(0)
    expect(b.reparto.total_mes).toBeCloseTo(b.reparto.meta_ig + b.reparto.produccion.monto + b.reparto.otros.reduce((s, o) => s + o.monto, 0), 1)
    // el calendario de 12 semanas lleva 3 meses de producción fija aunque la pauta de rendimiento suba en la temporada
    expect(b.calendario.produccion_total).toBeCloseTo(b.reparto.produccion.monto * 3, 1)
    const normal = ok({ ...CASOS.c1, calendario: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] })
    const subida = ok({ ...CASOS.c1, calendario: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1] })
    expect(subida.calendario.rendimiento_total).toBeGreaterThan(normal.calendario.rendimiento_total)
    expect(subida.calendario.produccion_total).toBe(normal.calendario.produccion_total)
  })
  it('producción dada como MONTO fijo: el total sube lo justo y el monto no cambia con la meta', () => {
    const a = ok({ ...CASOS.c1, produccion: { monto: 100, origen: 'plan' } })
    const b = ok({ ...CASOS.c1, meta_por_semana: 30, produccion: { monto: 100, origen: 'plan' } })
    expect(a.reparto.produccion.monto).toBeCloseTo(100, 1)
    expect(b.reparto.produccion.monto).toBeCloseTo(100, 1)
    expect(b.reparto.total_mes).toBeGreaterThan(a.reparto.total_mes)
  })
})

describe('propiedades', () => {
  it('el reparto suma EXACTAMENTE el total en centavos y nada es negativo', () => {
    for (const k of Object.keys(CASOS)) {
      const b = ok(CASOS[k])
      const suma = Math.round((b.reparto.meta_ig + b.reparto.produccion.monto + b.reparto.otros.reduce((s, o) => s + o.monto, 0)) * 100)
      expect(suma).toBe(Math.round(b.reparto.total_mes * 100))
      for (const v of [b.reparto.meta_ig, b.reparto.produccion.monto, ...b.reparto.otros.map((o) => o.monto)]) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
  it('Meta+IG nunca baja del 60 % del total', () => {
    for (const k of Object.keys(CASOS)) expect(ok(CASOS[k]).reparto.parte_meta_ig).toBeGreaterThanOrEqual(0.6 - 1e-3)
  })
  it('producción + otros canales pasan del 40 %: los otros se escalan y Meta+IG queda en EXACTAMENTE 60 %', () => {
    const b = ok({ ...CASOS.c1, produccion: { fraccion: 0.3, origen: 'plan' }, canales: [{ canal: 'canal_a', peso: 0.3, piso_diario: 0 }] })
    expect(b.reparto.parte_meta_ig).toBeCloseTo(0.6, 3)
    expect(b.reparto.produccion.fraccion).toBeCloseTo(0.3, 3)
    expect(b.reparto.otros[0].monto / b.reparto.total_mes).toBeCloseTo(0.1, 3)
  })
  it('la producción se topa al 40 % del total (y se dice)', () => {
    const b = ok({ ...CASOS.c1, canales: [], produccion: { fraccion: 0.7, origen: 'supuesto' } })
    expect(b.reparto.produccion.fraccion).toBeCloseTo(0.4, 3)
    expect(b.reparto.parte_meta_ig).toBeCloseTo(0.6, 3)
    expect(b.alertas.join(' ')).toContain('excede el tope')
  })
  it('sin NaN ni Infinity en ninguna cifra, y ninguna celda vacía (si falta es «sin_base» con motivo)', () => {
    for (const k of Object.keys(CASOS)) {
      const b = ok(CASOS[k])
      for (const c of Object.values(b.cifras)) {
        if (c.valor == null) { expect(c.tipo).toBe('sin_base'); expect(c.motivo).toBeTruthy() } else expect(Number.isFinite(c.valor)).toBe(true)
      }
    }
    expect(ok({ ...CASOS.c7, produccion: null }).cifras.produccion_mes).toMatchObject({ valor: null, tipo: 'sin_base' })
  })
  it('monotonía: más costo por resultado nunca mejora el veredicto', () => {
    const orden = ['sigo', 'ajusto', 'ajusto_recorte', 'paro']
    let previo = -1
    for (let m = 0.2; m <= 6; m += 0.2) {
      const v = veredictoDe(m, 3)
      expect(orden.indexOf(v)).toBeGreaterThanOrEqual(previo)
      previo = orden.indexOf(v)
    }
  })
  it('monotonía: más meta nunca baja la pauta; menos días activos nunca baja el mínimo diario por conjunto', () => {
    const a = ok({ ...CASOS.c1, meta_por_semana: 10 }), b = ok({ ...CASOS.c1, meta_por_semana: 20 })
    expect(b.cifras.pauta_rendimiento_semana.valor!).toBeGreaterThan(a.cifras.pauta_rendimiento_semana.valor!)
    const d7 = ok({ ...CASOS.c1, dias_activos_por_semana: 7 }), d5 = ok({ ...CASOS.c1, dias_activos_por_semana: 5 })
    expect(d5.aprendizaje.minimo_por_conjunto).toBeGreaterThan(d7.aprendizaje.minimo_por_conjunto)
  })
  it('con 7 días activos el mínimo por conjunto es el de la consulta: costo × 50 ÷ 7', () => {
    const b = ok({ ...CASOS.c4 })
    expect(b.aprendizaje.minimo_por_conjunto).toBeCloseTo((7.8 * 50) / 7, 1)
  })
  it('determinista: la misma entrada da exactamente el mismo bloque', () => {
    for (const k of Object.keys(CASOS)) expect(JSON.stringify(calcular(CASOS[k]))).toBe(JSON.stringify(calcular(CASOS[k])))
  })
})

describe('umbrales y primera lectura', () => {
  it('sigo ≤ 1× · ajusto ≤ 1,4× · ajusto con recorte ≤ 2× · paro > 2× (y sin techo positivo, paro)', () => {
    expect(veredictoDe(3, 3)).toBe('sigo')
    expect(veredictoDe(3.01, 3)).toBe('ajusto')
    expect(veredictoDe(4.2, 3)).toBe('ajusto')
    expect(veredictoDe(4.21, 3)).toBe('ajusto_recorte')
    expect(veredictoDe(6, 3)).toBe('ajusto_recorte')
    expect(veredictoDe(6.01, 3)).toBe('paro')
    expect(veredictoDe(1, 0)).toBe('paro')
  })
  it('primera lectura: el mayor entre 14 días (25 % del horizonte si < 28 días, mínimo 3) y el ciclo', () => {
    expect(primeraLecturaDia()).toBe(14)
    expect(primeraLecturaDia(90, null)).toBe(14)
    expect(primeraLecturaDia(14, null)).toBe(4)
    expect(primeraLecturaDia(5, null)).toBe(3)
    expect(primeraLecturaDia(27, null)).toBe(7)
    expect(primeraLecturaDia(28, null)).toBe(14)
    expect(primeraLecturaDia(90, 60)).toBe(60)
    expect(primeraLecturaDia(14, 60)).toBe(60)
  })
  it('chequeo de primera venta: valor mínimo = (costo por venta ÷ h + entrega) ÷ margen', () => {
    const c = chequeoDePrimeraVenta({ valor_oferta: 4, margen: 0.55, costo_entrega: 2, costo_por_venta: 3.47 })
    expect(c.paga).toBe(false)
    expect(c.valor_minimo).toBeCloseTo((3.4667 / 0.7 + 2) / 0.55, 1)
    expect(chequeoDePrimeraVenta({ valor_oferta: 20, margen: 0.55, costo_entrega: 0, costo_por_venta: 3 }).paga).toBe(true)
  })
})

describe('bordes · se rechaza con motivo (nunca un número inventado)', () => {
  const malos: Array<[string, Partial<Entrada> | ((e: Entrada) => Entrada)]> = [
    ['meta 0', { meta_por_semana: 0 }], ['meta negativa', { meta_por_semana: -1 }], ['meta NaN', { meta_por_semana: Number.NaN }], ['meta texto', { meta_por_semana: '15' as unknown as number }],
    ['días 0', { dias_activos_por_semana: 0 }], ['días 8', { dias_activos_por_semana: 8 }],
    ['tasa 0', { pasos: [{ tasa: 0 }] }], ['tasa 1,5', { pasos: [{ tasa: 1.5 }] }],
    ['margen 2', { margen: 2 }], ['ticket negativo', { ticket: -5 }], ['periodos 0', { periodos: 0 }], ['entrega negativa', { costo_entrega: -1 }],
    ['marca 1', { marca: 1 }], ['h 0', { h: 0 }],
    ['sin referencia', { referencia: null }], ['referencia invertida', { referencia: { min: 5, max: 2, tipo: 'supuesto', fuente: 'x' } }], ['referencia sin fuente', { referencia: { min: 1, max: 2, tipo: 'supuesto', fuente: '' } }],
    ['referencia base fuera de rango', { referencia: { min: 1, max: 2, base: 3, tipo: 'supuesto', fuente: 'x' } }],
    ['arranque invertido', { arranque: { min: 0.4, base: 0.3, max: 0.2 } }], ['producción fracción 2', { produccion: { fraccion: 2, origen: 'plan' } }],
    ['canal con peso 2', { canales: [{ canal: 'x', peso: 2, piso_diario: 0 }] }], ['calendario vacío', { calendario: [] }],
  ]
  for (const [nombre, cambio] of malos) {
    it(`${nombre}: rechazada con motivo y sin cifras`, () => {
      const r = calcular({ ...CASOS.c1, ...(cambio as Partial<Entrada>) })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errores.length).toBeGreaterThan(0)
    })
  }
  it('una venta que no deja contribución positiva: techo 0, todo «paro» y se dice', () => {
    const b = ok({ ...CASOS.c1, ticket: 2, margen: 0.5, costo_entrega: 5 })
    expect(b.veredictos.cota_baja).toBe('paro')
    expect(b.alertas.join(' ')).toContain('no deja contribución')
  })
  it('repartirPresupuesto: invariante de suma, centavo al mayor, nada negativo y «sin asignar» declarado', () => {
    const r = repartirPresupuesto(100, [{ clave: 'a', peso: 1 }, { clave: 'b', peso: 1 }, { clave: 'c', peso: 1 }])
    expect(r.partes.reduce((s, p) => Math.round(s + p.monto * 100), 0)).toBe(10000)
    expect(r.partes[0].monto).toBe(33.34)
    expect(repartirPresupuesto(50, []).sin_asignar).toBe(50)
    expect(repartirPresupuesto(50, [{ clave: 'a', peso: 0 }]).sin_asignar).toBe(50)
    expect(() => repartirPresupuesto(-1, [{ clave: 'a', peso: 1 }])).toThrow()
    expect(() => repartirPresupuesto(10, [{ clave: 'a', peso: -1 }])).toThrow()
  })
  it('repartoInverso: sin canales ni producción, Meta+IG es todo el total', () => {
    const r = repartoInverso({ metaIgNecesario: 100, produccion: null, canales: [] })
    expect(r.totalMes).toBeCloseTo(100, 4)
    expect(r.metaIg).toBeCloseTo(100, 4)
  })
})
