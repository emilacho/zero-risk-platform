/**
 * 21-nov · opción A (GO de Lenovo 02:47Z) · CC1. Antes `razonamiento-temporal.test.ts` (#1260): lo temporal se deshace.
 * Lo que se fija:
 *  · los 4 pasos largos van por el corredor y TODOS los pasos vuelven a pedir `maximo` (firma de Emilio «nada se recorta»);
 *  · punto 5 (hallazgo de CC7): el tope de una llamada cubre UN turno al techo de salida (el SDK solo corta entre turnos), calculado con el precio del modelo;
 *  · el cuerpo del agente lleva el tope de SU paso; el piso de la bolsa de planificación queda en 12 × 3 = US$ 36 (aceptado por Lenovo);
 *  · la bolsa propia de las fichas alcanza para sus 3 intentos caídos (3 × 3 = US$ 9) y el DEFAULT de la columna es el mismo número.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bolsaDePlanificacion, COSTO_DE_UN_TURNO_AL_TECHO_USD, MAXIMO_DE_INTENTOS, MODELO_POR_DEFECTO, PASOS_POR_EL_CORREDOR, PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON, PRESUPUESTO_LECTOR_POR_OMISION,
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
  it('🔴 los 4 pasos por el corredor llevan ese tope (fichas: decisión de Lenovo 03:37Z, opción a); el brief, el de siempre (US$ 1)', () => {
    expect(TOPE_POR_PASO_USD).toEqual({ estrategia: 3, calendario: 3, fechas: 3, fichas: 3 })
    expect(Object.fromEntries(PASOS.map((p) => [p, topeDelPaso(p)]))).toEqual({ estrategia: 3, calendario: 3, fechas: 3, brief: 1, fichas: 3 })
    for (const p of PASOS_POR_EL_CORREDOR) expect(topeDelPaso(p), p).toBeGreaterThanOrEqual(COSTO_DE_UN_TURNO_AL_TECHO_USD)
  })
  it('🔴 el cuerpo del agente lleva el tope de SU paso', () => {
    for (const p of PASOS) expect(cuerpoDeRunSdk(p, MODELO_POR_DEFECTO, 't', { type: 'object' }, 'c1').max_budget_usd, p).toBe(topeDelPaso(p))
  })
  it('🔴 la bolsa propia de las fichas alcanza para TODOS sus intentos caídos (cada uno cuenta su tope entero): 3 × 3 = US$ 9', () => {
    expect(PRESUPUESTO_LECTOR_POR_OMISION).toBe(9)
    expect(MAXIMO_DE_INTENTOS * topeDelPaso('fichas')).toBe(PRESUPUESTO_LECTOR_POR_OMISION)
  })
  it('🔴 el DEFAULT de la columna en la base es el mismo número que la constante (la migración nueva; la vieja decía 2)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '202611210400_cadena_bolsa_del_lector_nueve.sql'), 'utf8')
    expect(sql).toContain(`ALTER TABLE public.cadena_campanas ALTER COLUMN presupuesto_lector_usd SET DEFAULT ${PRESUPUESTO_LECTOR_POR_OMISION};`)
    // las campañas con la bolsa del valor viejo (exactamente 2) suben; una bolsa fijada a mano no se toca
    expect(sql).toContain(`UPDATE public.cadena_campanas SET presupuesto_lector_usd = ${PRESUPUESTO_LECTOR_POR_OMISION} WHERE presupuesto_lector_usd = 2;`)
  })
  it('🔴 el piso de la bolsa de planificación es 12 vueltas × US$ 3 = US$ 36', () => {
    expect(TOPE_DE_VUELTAS_DEL_SUBFLUJO).toBe(12)
    expect(bolsaDePlanificacion(0)).toBe(36)
    expect(bolsaDePlanificacion(1)).toBe(36)
  })
})
