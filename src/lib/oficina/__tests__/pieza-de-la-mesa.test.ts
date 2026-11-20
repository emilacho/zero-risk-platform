/**
 * 19-nov · los 2 🟡 de CC6 sobre #1191 (`CERTIFICACION-CC6-1191-la-gran-idea-mira-lo-real.md`):
 *  d1 · la hoja de la gran idea lleva el PLAN del marco (no solo el marco);
 *  d2 · la mesa de pieza lleva su FILA (se perdió la prueba al mudar el código a `pieza-de-la-mesa.ts`).
 * La fila es la forma real de producción `{id, hora, fecha}` (encargo del reel de Olón, la misma de `mesa-lee-el-indice.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { ARTEFACTO_MARCO } from '../mesa/de-la-cadena'
import { leeElIndice, piezaDeLaMesa } from '../mesa/pieza-de-la-mesa'
import type { Encargo } from '../puertos'

const FILA_REAL = { id: 's4-d5-vie_reel_olon', hora: '09:00', fecha: '2026-11-27' }
const enc = (artefactos: Record<string, { datos: Record<string, unknown> }>, sala_ref: unknown = { fila: FILA_REAL }) =>
  ({ id: 'enc-1', client_id: 'c1', sala_ref, estado_del_motor: { artefactos } }) as unknown as Encargo

describe('d1 · la hoja de la gran idea: el marco COMPLETO más el plan', () => {
  const MARCO = '## La gran idea que pide la cadena\nMarco entero de la campaña de diciembre.'
  const PLAN = 'Plan de 90 días: serie de posts de producto antes de la pauta.'
  it('lleva el marco y «## El plan de trabajo» con el plan del marco', () => {
    const p = piezaDeLaMesa(enc({ [ARTEFACTO_MARCO]: { datos: { marco_texto: MARCO, plan_texto: PLAN } } }), { tipo: 'concepto' })
    expect(p.hoja).toContain(MARCO)
    expect(p.hoja).toContain('## El plan de trabajo\n' + PLAN)
  })
  it('la gran idea no manda fila (no es una pieza del calendario)', () => {
    const p = piezaDeLaMesa(enc({ [ARTEFACTO_MARCO]: { datos: { marco_texto: MARCO, plan_texto: PLAN } } }), { tipo: 'concepto' })
    expect(p).not.toHaveProperty('fila')
  })
})

describe('d2 · la mesa de pieza lleva su fila como texto', () => {
  const base = { encargo: { datos: { brief: { texto: 'BRF-0100 · el brief de la pieza' }, F: { plan_texto: 'el plan del encargo' } } } }
  it('con la fila real {id, hora, fecha}, la pieza que va al índice y a la entrega lleva su id', () => {
    const p = piezaDeLaMesa(enc(base), { tipo: 'carrusel' })
    expect(p.fila).toBe('s4-d5-vie_reel_olon')
    expect(p.hoja).toContain('BRF-0100')
    expect(p.hoja).toContain('## El plan de trabajo\nel plan del encargo')
  })
  it('sin fila en el encargo, no va fila', () => {
    expect(piezaDeLaMesa(enc(base, {}), { tipo: 'carrusel' })).not.toHaveProperty('fila')
  })
  it('qué mesas leen: las de pieza y la gran idea; el brief de la cadena no', () => {
    expect(leeElIndice('carrusel')).toBe(true)
    expect(leeElIndice('concepto')).toBe(true)
    expect(leeElIndice('brief')).toBe(false)
  })
})
