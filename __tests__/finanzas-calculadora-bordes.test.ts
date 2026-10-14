/**
 * OFICINA FINANCIERA · F2 · reparo R1 de CC#3: el piso de aprendizaje en el BORDE de la coma flotante (50 resultados «justo» no puede salir 49,999… ni 0 conjuntos).
 */
import { describe, expect, it } from 'vitest'
import { calcular, veredictoDe } from '../src/lib/finanzas/calculadora'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const base = (meta: number, tasa: number, n = 5): Entrada => ({ meta_por_semana: meta, pasos: [{ tasa }], ticket: 10, margen: 0.5, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'prueba' }, dias_activos_por_semana: n })
const ok = (e: Entrada) => calcular(e) as Bloque

describe('el borde del piso: resultados por semana EXACTAMENTE 50', () => {
  for (const [meta, tasa] of [[7, 0.14], [14, 0.28], [17, 0.34], [15, 0.3], [10, 0.2], [25, 0.5], [35, 0.7], [3, 0.06], [9, 0.18], [13, 0.26], [21, 0.42]] as Array<[number, number]>) {
    it(`meta ${meta} y tasa ${tasa}: 50 resultados, 1 conjunto, sin «dilución» ni «aprendizaje limitado»`, () => {
      // la división en coma flotante da 49,999… en varios de estos pares (7 ÷ 0,14; 17 ÷ 0,34)
      const b = ok(base(meta, tasa))
      expect(b.aprendizaje.conjuntos).toBe(1)
      expect(b.aprendizaje.dilucion).toBe(false)
      expect(b.aprendizaje.limitado).toBe(false)
      expect(b.alertas.join(' ')).not.toContain('dilución')
      expect(b.alertas.join(' ')).not.toContain('aprendizaje limitado')
    })
  }
  it('el borde NO regala: 49 resultados siguen siendo «aprendizaje limitado» y 0 conjuntos', () => {
    const b = ok(base(49, 1))
    expect(b.aprendizaje.limitado).toBe(true)
    expect(b.aprendizaje.conjuntos).toBe(0)
    expect(b.aprendizaje.dilucion).toBe(true)
  })
  it('justo por encima: 100 resultados caben 2 conjuntos; 99,9 caben 1', () => {
    expect(ok(base(100, 1)).aprendizaje.conjuntos).toBe(2)
    expect(ok(base(99.9, 1)).aprendizaje.conjuntos).toBe(1)
  })
  it('con 7 días activos el borde se comporta igual', () => {
    const b = ok(base(7, 0.14, 7))
    expect(b.aprendizaje.conjuntos).toBe(1)
    expect(b.aprendizaje.limitado).toBe(false)
  })
})

describe('ronda 2 de CC#3 · los bordes exactos del veredicto y el tope de la producción fija', () => {
  it('«sigo» en el borde con coma flotante: 0,1 + 0,2 contra un techo de 0,3 es «sigo» (no «ajusto»)', () => {
    expect(0.1 + 0.2 > 0.3).toBe(true)
    expect(veredictoDe(0.1 + 0.2, 0.3)).toBe('sigo')
    expect(veredictoDe(0.30001, 0.3)).toBe('ajusto')
  })
  it('«ajusto» y «paro» también en el borde: 1,4× y 2× del techo valen por igual aunque la multiplicación se corra', () => {
    expect(veredictoDe(4.2, 3)).toBe('ajusto')
    expect(veredictoDe(0.6000000000000001, 0.3)).toBe('ajusto_recorte')
    expect(veredictoDe(0.6001, 0.3)).toBe('paro')
  })
  it('la producción como MONTO FIJO mayor al 40 % del total se topa al 40 % y Meta+IG queda en 60 %', () => {
    const b = ok({ ...base(15, 0.3), produccion: { monto: 100000, origen: 'plan' } })
    expect(b.reparto.produccion.fraccion).toBeCloseTo(0.4, 3)
    expect(b.alertas.join(' ')).toContain('el monto fijo excede el 40 % del total')
    expect(b.reparto.parte_meta_ig).toBeGreaterThanOrEqual(0.6 - 1e-3)
  })
  it('un monto fijo MENOR al 40 % se respeta tal cual', () => {
    const b = ok({ ...base(15, 0.3), produccion: { monto: 10, origen: 'plan' } })
    expect(b.reparto.produccion.monto).toBe(10)
  })
})
