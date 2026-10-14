/**
 * OFICINA FINANCIERA · F5 · reparto por pieza (CC#1 · 14-oct): la invariante de suma exacta, sin negativos, y lo que no tiene dónde ir queda «sin asignar» declarado.
 */
import { describe, expect, it } from 'vitest'
import { repartirPorPieza, repartirPorSemana, repartirPresupuesto } from '../src/lib/finanzas/repartir'
import { calcular } from '../src/lib/finanzas/calculadora'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const centavos = (x: number) => Math.round(x * 100)

describe('repartirPorPieza', () => {
  it('reparte cada semana entre sus piezas por peso y la suma es EXACTA', () => {
    const r = repartirPorPieza([0, 0, 44.57, 44.57], [
      { pieza_id: 'p1', semana: 3 }, { pieza_id: 'p2', semana: 3 }, { pieza_id: 'p3', semana: 3, peso: 2 },
      { pieza_id: 'p4', semana: 4 },
    ])
    const sumaPiezas = r.piezas.reduce((s, p) => s + centavos(p.monto), 0)
    expect(sumaPiezas + centavos(r.sin_asignar_total)).toBe(centavos(r.total))
    expect(r.piezas.find((p) => p.pieza_id === 'p4')!.monto).toBe(44.57)
    expect(r.piezas.find((p) => p.pieza_id === 'p3')!.monto).toBeGreaterThan(r.piezas.find((p) => p.pieza_id === 'p1')!.monto)
    for (const p of r.piezas) expect(p.monto).toBeGreaterThanOrEqual(0)
  })
  it('una semana con pauta y SIN piezas queda «sin asignar» y se declara por semana', () => {
    const r = repartirPorPieza([10, 20, 0], [{ pieza_id: 'p1', semana: 1 }])
    expect(r.sin_asignar_total).toBe(20)
    expect(r.por_semana[1]).toEqual({ semana: 2, total: 20, sin_asignar: 20 })
    expect(r.por_semana[2]).toEqual({ semana: 3, total: 0, sin_asignar: 0 })
    expect(r.piezas).toEqual([{ pieza_id: 'p1', semana: 1, zona: null, monto: 10 }])
  })
  it('reparte primero entre zonas por su peso y luego entre piezas de la zona', () => {
    const r = repartirPorPieza([100], [
      { pieza_id: 'a', semana: 1, zona: 'z1' }, { pieza_id: 'b', semana: 1, zona: 'z1' }, { pieza_id: 'c', semana: 1, zona: 'z2' },
    ], { z1: 0.65, z2: 0.35 })
    expect(r.piezas.filter((p) => p.zona === 'z1').reduce((s, p) => s + p.monto, 0)).toBeCloseTo(65, 2)
    expect(r.piezas.find((p) => p.pieza_id === 'c')!.monto).toBeCloseTo(35, 2)
    expect(r.piezas.reduce((s, p) => s + centavos(p.monto), 0)).toBe(10000)
  })
  it('una zona con peso 0: no recibe nada y su parte pasa a las otras (nada negativo, suma exacta)', () => {
    const r = repartirPorPieza([100], [{ pieza_id: 'a', semana: 1, zona: 'z1' }, { pieza_id: 'b', semana: 1, zona: 'z2' }], { z1: 0, z2: 1 })
    expect(r.piezas.find((p) => p.pieza_id === 'a')!.monto).toBe(0)
    expect(r.piezas.find((p) => p.pieza_id === 'b')!.monto).toBe(100)
  })
  it('todas las piezas con peso 0: el dinero queda «sin asignar», no se pierde', () => {
    const r = repartirPorPieza([30], [{ pieza_id: 'a', semana: 1, peso: 0 }, { pieza_id: 'b', semana: 1, peso: 0 }])
    expect(r.sin_asignar_total).toBe(30)
    expect(r.piezas.every((p) => p.monto === 0)).toBe(true)
  })
  it('rechaza piezas mal formadas', () => {
    expect(() => repartirPorPieza([10], [{ pieza_id: '', semana: 1 }])).toThrow()
    expect(() => repartirPorPieza([10], [{ pieza_id: 'a', semana: 0 }])).toThrow()
    expect(() => repartirPorPieza([10], [{ pieza_id: 'a', semana: 1.5 }])).toThrow()
    expect(() => repartirPorPieza([10], [{ pieza_id: 'a', semana: 1, peso: -1 }])).toThrow()
  })
  it('semanas con monto negativo o NaN no aportan (se tratan como 0, nunca negativo)', () => {
    const r = repartirPorPieza([-5, 10, Number.NaN], [{ pieza_id: 'a', semana: 1 }, { pieza_id: 'b', semana: 2 }])
    expect(r.total).toBe(10)
    for (const p of r.piezas) expect(p.monto).toBeGreaterThanOrEqual(0)
  })
  it('con el calendario real del bloque: la suma de piezas + sin asignar = la pauta de rendimiento del horizonte', () => {
    const e: Entrada = { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'prueba' }, dias_activos_por_semana: 5 }
    const b = calcular(e) as Bloque
    const piezas = b.calendario.por_semana.flatMap((m, i) => (m > 0 ? [{ pieza_id: `s${i + 1}a`, semana: i + 1 }, { pieza_id: `s${i + 1}b`, semana: i + 1 }] : []))
    const r = repartirPorPieza(b.calendario.por_semana, piezas)
    expect(r.sin_asignar_total).toBe(0)
    expect(r.piezas.reduce((s, p) => s + centavos(p.monto), 0)).toBe(centavos(r.total))
    expect(Math.abs(r.total - b.calendario.rendimiento_total)).toBeLessThan(0.1)
  })
  it('R8 · el centavo que sobra va a la parte de MAYOR peso (primera en empate), no a la primera', () => {
    const r1 = repartirPresupuesto(0.1, [{ clave: 'a', peso: 1 }, { clave: 'b', peso: 1 }, { clave: 'c', peso: 5 }])
    expect(r1.partes.map((p) => p.monto)).toEqual([0.01, 0.01, 0.08])
    const r2 = repartirPresupuesto(0.1, [{ clave: 'a', peso: 1 }, { clave: 'b', peso: 3 }, { clave: 'c', peso: 3 }])
    expect(r2.partes.map((p) => p.monto)).toEqual([0.01, 0.05, 0.04])
    // pesos desiguales con una zona más pesada: la suma sigue exacta
    const r3 = repartirPorPieza([0.1], [{ pieza_id: 'p1', semana: 1, zona: 'z1' }, { pieza_id: 'p2', semana: 1, zona: 'z2' }], { z1: 1, z2: 5 })
    expect(r3.piezas.map((p) => Math.round(p.monto * 100)).reduce((s, x) => s + x, 0)).toBe(10)
    expect(r3.piezas.find((p) => p.pieza_id === 'p2')!.monto).toBeGreaterThan(r3.piezas.find((p) => p.pieza_id === 'p1')!.monto)
  })
  it('repartirPorSemana: el factor 0 no recibe nada y la suma es exacta', () => {
    const r = repartirPorSemana(100, [0, 1, 1, 2])
    expect(r[0]).toBe(0)
    expect(r.reduce((s, x) => s + centavos(x), 0)).toBe(10000)
  })
})
