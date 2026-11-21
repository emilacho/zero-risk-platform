/**
 * 21-nov · opción A (GO de Lenovo 02:47Z) · CC1. Antes `razonamiento-temporal.test.ts` (#1260): lo temporal se deshace.
 * Lo que se fija:
 *  · los 4 pasos largos van por el corredor y TODOS los pasos vuelven a pedir `maximo` (firma de Emilio «nada se recorta»);
 *  · punto 5 (hallazgo de CC7): el tope de una llamada cubre UN turno al techo de salida (el SDK solo corta entre turnos), calculado con el precio del modelo;
 *  · el cuerpo del agente lleva el tope de SU paso; el piso de la bolsa de planificación queda en 12 × 3 = US$ 36 (aceptado por Lenovo);
 *  · en la bolsa propia de las fichas caben al menos 2 intentos caídos (cada uno cuenta su tope entero).
 */
import { describe, expect, it } from 'vitest'
import {
  bolsaDePlanificacion, COSTO_DE_UN_TURNO_AL_TECHO_USD, MODELO_POR_DEFECTO, PASOS_POR_EL_CORREDOR, PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON, PRESUPUESTO_LECTOR_POR_OMISION,
  RAZONAMIENTO_POR_DEFECTO, razonamientoDelPaso, TECHO_DE_SALIDA_TOKENS, TOPE_DE_UN_TURNO_AL_TECHO_USD, TOPE_DE_VUELTAS_DEL_SUBFLUJO, TOPE_POR_PASO_USD, topeDelPaso, type Paso,
} from '../constantes'
import { cuerpoDeRunSdk } from '../pasos'

const PASOS: Paso[] = ['estrategia', 'calendario', 'fechas', 'brief', 'fichas']

describe('razonamiento: todos al máximo (se deshace lo temporal de #1260)', () => {
  it('🔴 los 4 pasos largos van por el corredor', () => {
    expect([...PASOS_POR_EL_CORREDOR]).toEqual(['estrategia', 'calendario', 'fechas', 'fichas'])
  })
  it('🔴 todos los pasos piden maximo, también en el cuerpo del agente', () => {
    expect(RAZONAMIENTO_POR_DEFECTO).toBe('maximo')
    expect(Object.fromEntries(PASOS.map((p) => [p, razonamientoDelPaso(p)]))).toEqual({ estrategia: 'maximo', calendario: 'maximo', fechas: 'maximo', brief: 'maximo', fichas: 'maximo' })
    for (const p of PASOS) expect(cuerpoDeRunSdk(p, MODELO_POR_DEFECTO, 't', { type: 'object' }, 'c1').thinking_mode, p).toBe('maximo')
  })
})

describe('el tope de una llamada cubre un turno al techo de salida (punto 5)', () => {
  it('🔴 el peor caso de un turno sale del precio del modelo de la cadena y del techo de 128K: US$ 2,96', () => {
    expect(MODELO_POR_DEFECTO).toBe('claude-opus-5-5')
    expect(PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON).toEqual({ entrada: 4, salida: 20 })
    expect(TECHO_DE_SALIDA_TOKENS).toBe(128_000)
    expect(COSTO_DE_UN_TURNO_AL_TECHO_USD).toBeCloseTo(2.96, 6)
  })
  it('🔴 el tope de un turno al techo lo cubre (y no es un número suelto: US$ 3)', () => {
    expect(TOPE_DE_UN_TURNO_AL_TECHO_USD).toBe(3)
    expect(TOPE_DE_UN_TURNO_AL_TECHO_USD).toBeGreaterThanOrEqual(COSTO_DE_UN_TURNO_AL_TECHO_USD)
  })
  it('🔴 estrategia, calendario y fechas llevan ese tope; brief y fichas, el de siempre (US$ 1 · las fichas esperan decisión)', () => {
    expect(TOPE_POR_PASO_USD).toEqual({ estrategia: 3, calendario: 3, fechas: 3 })
    expect(Object.fromEntries(PASOS.map((p) => [p, topeDelPaso(p)]))).toEqual({ estrategia: 3, calendario: 3, fechas: 3, brief: 1, fichas: 1 })
    for (const p of ['estrategia', 'calendario', 'fechas'] as Paso[]) expect(topeDelPaso(p), p).toBeGreaterThanOrEqual(COSTO_DE_UN_TURNO_AL_TECHO_USD)
  })
  it('🔴 el cuerpo del agente lleva el tope de SU paso', () => {
    for (const p of PASOS) expect(cuerpoDeRunSdk(p, MODELO_POR_DEFECTO, 't', { type: 'object' }, 'c1').max_budget_usd, p).toBe(topeDelPaso(p))
  })
  it('🔴 en la bolsa propia de las fichas caben al menos 2 intentos caídos (cada uno cuenta su tope entero)', () => {
    expect(2 * topeDelPaso('fichas')).toBeLessThanOrEqual(PRESUPUESTO_LECTOR_POR_OMISION)
  })
  it('🔴 el piso de la bolsa de planificación es 12 vueltas × US$ 3 = US$ 36', () => {
    expect(TOPE_DE_VUELTAS_DEL_SUBFLUJO).toBe(12)
    expect(bolsaDePlanificacion(0)).toBe(36)
    expect(bolsaDePlanificacion(1)).toBe(36)
  })
})
