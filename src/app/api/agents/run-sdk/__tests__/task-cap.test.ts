/**
 * Tests · tope de `task` en /api/agents/run-sdk (CC#1 2026-08-11).
 *
 * Dos cosas a la vez:
 *  (a) el tope subió de 8.000 a 16.000 · es COMPARTIDO (lentes · revisores · re-síntesis);
 *  (b) el contrato real es **RECORTE SILENCIOSO**, no rechazo. El postmortem del 01-jul
 *      afirmaba lo contrario ("rechazado en route antes de llegar al agente") y esa
 *      creencia sobrevivió: una tarea larga NO falla, llega CORTADA sin aviso.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeString } from '@/lib/validation'
import { TASK_MAX_CHARS } from '../route'

describe('TASK_MAX_CHARS · el tope del endpoint', () => {
  it('es 16.000 · el doble del anterior', () => {
    expect(TASK_MAX_CHARS).toBe(16_000)
  })

  it('deja lugar sobre los 7.900 con que el grafo ya recorta sus prompts', () => {
    expect(TASK_MAX_CHARS).toBeGreaterThan(7_900)
  })
})

describe('el contrato REAL de sanitizeString · recorta, NO rechaza', () => {
  it('una tarea de 20.000 NO se rechaza · vuelve recortada a 16.000', () => {
    const larga = 'x'.repeat(20_000)
    const r = sanitizeString(larga, TASK_MAX_CHARS)
    expect(r).not.toBeNull() // ← si rechazara, sería null y el endpoint daría 400
    expect(r).toHaveLength(TASK_MAX_CHARS)
  })

  it('el recorte es MUDO · no hay señal de que faltó texto', () => {
    const larga = 'A'.repeat(16_000) + 'ESTO-SE-PIERDE'
    const r = sanitizeString(larga, TASK_MAX_CHARS)
    expect(r).toHaveLength(TASK_MAX_CHARS)
    expect(r).not.toContain('ESTO-SE-PIERDE')
    expect(r).not.toContain('…') // ni siquiera una elipsis que delate el corte
  })

  it('lo que ANTES se cortaba (8.001-16.000) ahora pasa entero', () => {
    const media = 'y'.repeat(12_000)
    expect(sanitizeString(media, 8_000)).toHaveLength(8_000) // el tope viejo la mutilaba
    expect(sanitizeString(media, TASK_MAX_CHARS)).toHaveLength(12_000) // ahora entra entera
  })

  it('una tarea normal (7.900, el tope del grafo) pasa intacta', () => {
    const normal = 'z'.repeat(7_900)
    expect(sanitizeString(normal, TASK_MAX_CHARS)).toBe(normal)
  })

  it('sigue devolviendo null con entrada vacía o no-texto · eso SÍ da 400', () => {
    expect(sanitizeString('', TASK_MAX_CHARS)).toBeNull()
    expect(sanitizeString('   ', TASK_MAX_CHARS)).toBeNull()
    expect(sanitizeString(undefined, TASK_MAX_CHARS)).toBeNull()
    expect(sanitizeString(42, TASK_MAX_CHARS)).toBeNull()
  })
})
