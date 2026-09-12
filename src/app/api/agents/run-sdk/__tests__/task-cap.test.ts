/**
 * Tests · tope de `task` en /api/agents/run-sdk.
 *  8.000 → 16.000 (CC#1 2026-08-11) → **120.000** (CC#2 · E8 · 2026-09-12).
 *
 * Tres cosas a la vez:
 *  (a) el tope es COMPARTIDO (lentes · revisores · re-síntesis · el redactor del plan);
 *  (b) el que DECIDE es el contrato JSON Schema: **rechaza con 400**, gratis, antes del
 *      modelo. `sanitizeString` recorta, pero nunca llega a verse para tareas largas;
 *  (c) el pedido REAL del redactor (17.744 · corrida 132800) tiene que ATRAVESAR.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeString } from '@/lib/validation'
import { TASK_MAX_CHARS } from '../route'
import contrato from '@/lib/contracts/inputs/agents-run-sdk.json'

/**
 * EL TOPE QUE MANDA · lección del tiro de Almai (exec 90406 · $0.98 perdidos).
 *
 * Hay DOS topes en este camino y el que decide es el PRIMERO:
 *   1. contrato JSON Schema `agents-run-sdk.json` → 400 `E-INPUT-INVALID` · RECHAZA
 *   2. `sanitizeString(body.task, TASK_MAX_CHARS)` en route.ts · RECORTA en silencio
 * Subir sólo el (2) no sirve de nada: una tarea larga muere en el (1) y nunca llega.
 * Este test los ATA para que no puedan volver a divergir.
 */
describe('los DOS topes del camino · atados', () => {
  const delContrato = (contrato as { properties: { task: { maxLength: number } } }).properties.task
    .maxLength

  it('el contrato (el que RECHAZA) también está en 120.000', () => {
    expect(delContrato).toBe(120_000)
  })

  it('contrato y route.ts coinciden · si alguien mueve uno, este test cae', () => {
    expect(delContrato).toBe(TASK_MAX_CHARS)
  })

  it('la tarea del juez que se perdió (9.049) ahora entra por los dos', () => {
    const JUEZ_ALMAI = 9_049
    expect(JUEZ_ALMAI).toBeLessThanOrEqual(delContrato) // antes: 8000 → 400 E-INPUT-INVALID
    expect(JUEZ_ALMAI).toBeLessThanOrEqual(TASK_MAX_CHARS)
  })
})

const delContratoTask = (contrato as { properties: { task: { maxLength: number } } }).properties
  .task.maxLength

describe('TASK_MAX_CHARS · el tope del endpoint', () => {
  it('es 120.000 · techo medido (1 MB del corredor) con 8× de margen', () => {
    expect(TASK_MAX_CHARS).toBe(120_000)
  })

  /**
   * 🔴 EL ROJO DE E8 · contra el tope de 16.000 este test CAE.
   * El pedido del redactor medido en la corrida real 132800 · y el documento de
   * referencia todavía viaja VACÍO: cuando se cablee, crece.
   */
  it('🔴 el pedido REAL del redactor (17.744) entra por los DOS topes', () => {
    const PEDIDO_REAL_132800 = 17_744
    expect(PEDIDO_REAL_132800).toBeLessThanOrEqual(delContratoTask)
    expect(PEDIDO_REAL_132800).toBeLessThanOrEqual(TASK_MAX_CHARS)
  })

  it('queda MUY por debajo del techo duro medido · el 1 MB del corredor', () => {
    const TECHO_DURO_CORREDOR = 1_000_000 // medido: 977 KB → 200 · 1,17 MB → 413
    expect(TASK_MAX_CHARS).toBeLessThan(TECHO_DURO_CORREDOR / 8)
  })

  it('deja lugar sobre los 7.900 con que el grafo ya recorta sus prompts', () => {
    expect(TASK_MAX_CHARS).toBeGreaterThan(7_900)
  })
})

describe('el contrato REAL de sanitizeString · recorta, NO rechaza', () => {
  it('una tarea por encima del tope NO se rechaza acá · vuelve recortada', () => {
    const larga = 'x'.repeat(TASK_MAX_CHARS + 4_000)
    const r = sanitizeString(larga, TASK_MAX_CHARS)
    expect(r).not.toBeNull() // ← si rechazara, sería null y el endpoint daría 400
    expect(r).toHaveLength(TASK_MAX_CHARS)
  })

  it('el recorte es MUDO · no hay señal de que faltó texto', () => {
    const larga = 'A'.repeat(TASK_MAX_CHARS) + 'ESTO-SE-PIERDE'
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
