/**
 * 21-nov · ⚠️ MEDIDA TEMPORAL (Lenovo 01:58Z y 02:16Z, frente a la firma de Emilio «nada se recorta») · CC1, la termina CC4 (GO 02:32Z).
 * Los 4 pasos que esperan al agente en la MISMA llamada (estrategia, calendario, fechas especiales y fichas) bajan a `high`: la estrategia al máximo pasó de 13:20
 * y n8n corta a los ~5:46 sin bytes. El brief no (su vuelta la entrega el corredor): sigue en `maximo`.
 * Cada uno de esos 4 lleva un tope por llamada que cubre su peor caso (regla firmada: el tope cubre el peor caso; un tope no es gasto).
 * Lo que se fija:
 *  · los 4 pasos piden `high`; el brief sigue pidiendo `maximo`;
 *  · lo temporal es una lista CORTA y con nombre (si alguien agrega o quita un paso, esta prueba lo obliga a decirlo);
 *  · todo valor temporal lo acepta la ruta del agente (si no, el pedido daría 400 y la campaña no avanzaría);
 *  · los topes: estrategia, calendario y fechas US$ 3; fichas y brief, el de siempre (US$ 1);
 *  · el cuerpo del agente lleva el tope de SU paso, y en la bolsa propia de las fichas caben al menos 2 intentos caídos (un intento caído cuenta el tope entero);
 *  · el piso de la bolsa de planificación sube a 12 × 3 = US$ 36 (aceptado por Lenovo).
 */
import { describe, expect, it } from 'vitest'
import { bolsaDePlanificacion, PRESUPUESTO_LECTOR_POR_OMISION, RAZONAMIENTO_POR_DEFECTO, RAZONAMIENTO_TEMPORAL_POR_PASO, razonamientoDelPaso, TOPE_DE_VUELTAS_DEL_SUBFLUJO, TOPE_TEMPORAL_POR_PASO_USD, topeDelPaso, type Paso } from '../constantes'
import { cuerpoDeRunSdk } from '../pasos'
import { MODOS_DE_RAZONAMIENTO_DEL_PEDIDO } from '../../razonamiento'

const PASOS: Paso[] = ['estrategia', 'calendario', 'fechas', 'brief', 'fichas']

describe('razonamiento temporal por paso', () => {
  it('🔴 los 4 pasos de la misma llamada piden high; el brief sigue en maximo', () => {
    expect(RAZONAMIENTO_POR_DEFECTO).toBe('maximo')
    expect(Object.fromEntries(PASOS.map((p) => [p, razonamientoDelPaso(p)]))).toEqual({ estrategia: 'high', calendario: 'high', fechas: 'high', brief: 'maximo', fichas: 'high' })
  })
  it('🔴 lo temporal son esos 4 pasos y nada más (agregar o quitar uno se decide y se anota, no se cuela)', () => {
    expect(RAZONAMIENTO_TEMPORAL_POR_PASO).toEqual({ estrategia: 'high', calendario: 'high', fechas: 'high', fichas: 'high' })
  })
  it('🔴 el cuerpo del agente lleva el razonamiento de SU paso', () => {
    expect(cuerpoDeRunSdk('estrategia', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('high')
    expect(cuerpoDeRunSdk('calendario', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('high')
    expect(cuerpoDeRunSdk('fechas', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('high')
    expect(cuerpoDeRunSdk('fichas', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('high')
    expect(cuerpoDeRunSdk('brief', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('maximo')
  })
  it('🔴 cada valor temporal lo acepta la ruta del agente', () => {
    for (const v of Object.values(RAZONAMIENTO_TEMPORAL_POR_PASO)) expect(MODOS_DE_RAZONAMIENTO_DEL_PEDIDO).toContain(v)
  })
})

describe('tope temporal por llamada (cubre el peor caso en high)', () => {
  it('🔴 estrategia, calendario y fechas US$ 3; fichas y brief, el de siempre (US$ 1)', () => {
    expect(TOPE_TEMPORAL_POR_PASO_USD).toEqual({ estrategia: 3, calendario: 3, fechas: 3 })
    expect(Object.fromEntries(PASOS.map((p) => [p, topeDelPaso(p)]))).toEqual({ estrategia: 3, calendario: 3, fechas: 3, brief: 1, fichas: 1 })
  })
  it('🔴 el cuerpo del agente lleva el tope de SU paso', () => {
    for (const p of PASOS) expect(cuerpoDeRunSdk(p, 'claude-opus-5-5', 't', { type: 'object' }, 'c1').max_budget_usd).toBe(topeDelPaso(p))
    expect(cuerpoDeRunSdk('estrategia', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').max_budget_usd).toBe(3)
  })
  it('🔴 en la bolsa propia de las fichas caben al menos 2 intentos caídos (cada uno cuenta su tope entero)', () => {
    expect(2 * topeDelPaso('fichas')).toBeLessThanOrEqual(PRESUPUESTO_LECTOR_POR_OMISION)
  })
  it('🔴 el piso de la bolsa de planificación es el peor caso con los topes nuevos: 12 × 3 = US$ 36', () => {
    expect(TOPE_DE_VUELTAS_DEL_SUBFLUJO).toBe(12)
    expect(bolsaDePlanificacion(0)).toBe(36)
    expect(bolsaDePlanificacion(1)).toBe(36)
  })
})
