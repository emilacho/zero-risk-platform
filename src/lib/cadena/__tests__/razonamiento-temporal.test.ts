/**
 * 21-nov · ⚠️ MEDIDA TEMPORAL (Lenovo 01:58Z, frente a la firma de Emilio «nada se recorta») · CC1.
 * La estrategia al máximo pasó de 13:20 y n8n corta a los ~5:46 sin bytes: ese paso baja a `high`. Los demás siguen en `maximo`.
 * Lo que se fija:
 *  · la estrategia pide `high`; calendario, fechas, brief y fichas siguen pidiendo `maximo`;
 *  · lo temporal es una lista CORTA y con nombre (si alguien agrega un paso, esta prueba lo obliga a decirlo);
 *  · todo valor temporal lo acepta la ruta del agente (si no, el pedido daría 400 y la campaña no avanzaría).
 */
import { describe, expect, it } from 'vitest'
import { RAZONAMIENTO_POR_DEFECTO, RAZONAMIENTO_TEMPORAL_POR_PASO, razonamientoDelPaso, type Paso } from '../constantes'
import { cuerpoDeRunSdk } from '../pasos'
import { MODOS_DE_RAZONAMIENTO_DEL_PEDIDO } from '../../razonamiento'

const PASOS: Paso[] = ['estrategia', 'calendario', 'fechas', 'brief', 'fichas']

describe('razonamiento temporal por paso', () => {
  it('🔴 la estrategia pide high; los demás pasos siguen en maximo', () => {
    expect(RAZONAMIENTO_POR_DEFECTO).toBe('maximo')
    expect(Object.fromEntries(PASOS.map((p) => [p, razonamientoDelPaso(p)]))).toEqual({ estrategia: 'high', calendario: 'maximo', fechas: 'maximo', brief: 'maximo', fichas: 'maximo' })
  })
  it('🔴 lo temporal es solo la estrategia (agregar un paso se decide y se anota, no se cuela)', () => {
    expect(RAZONAMIENTO_TEMPORAL_POR_PASO).toEqual({ estrategia: 'high' })
  })
  it('🔴 el cuerpo del agente lleva el razonamiento de SU paso', () => {
    expect(cuerpoDeRunSdk('estrategia', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('high')
    expect(cuerpoDeRunSdk('calendario', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('maximo')
    expect(cuerpoDeRunSdk('fichas', 'claude-opus-5-5', 't', { type: 'object' }, 'c1').thinking_mode).toBe('maximo')
  })
  it('🔴 cada valor temporal lo acepta la ruta del agente', () => {
    for (const v of Object.values(RAZONAMIENTO_TEMPORAL_POR_PASO)) expect(MODOS_DE_RAZONAMIENTO_DEL_PEDIDO).toContain(v)
  })
})
