/**
 * Tests · JOURNEY_WORKFLOW_MAP + helpers · Model B (conexión 2026-06-05).
 */
import { describe, it, expect } from 'vitest'
import {
  JOURNEY_WORKFLOW_MAP,
  getJourneyWorkflowTarget,
  isWorkflowJourney,
} from '@/lib/sala-journey-dispatch'

describe('JOURNEY_WORKFLOW_MAP · Phase 1 scope', () => {
  it('canon · ONBOARD maps to LyVoKcrypS5uLyuu (Client Onboarding E2E v2)', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD
    expect(target).toBeDefined()
    expect(target!.workflow_id).toBe('LyVoKcrypS5uLyuu')
    expect(target!.webhook_path).toBe('zero-risk/deal-won-onboarding')
    expect(target!.worker_name).toMatch(/Client Onboarding E2E v2/)
  })

  it('canon · ONBOARD declares 7 canonical phase_boundaries · coarse-grain libreto · CC#4-aligned (Costura C)', () => {
    const target = JOURNEY_WORKFLOW_MAP.ONBOARD!
    expect(target.phase_boundaries.length).toBe(7)
    expect(target.phase_boundaries[0]).toBe('INTAKE')
    expect(target.phase_boundaries[target.phase_boundaries.length - 1]).toBe(
      'APIFY_WIRE',
    )
  })

  it('canon · ONBOARD declares an idempotency_suffix (STOP-2 dispatch-único)', () => {
    expect(JOURNEY_WORKFLOW_MAP.ONBOARD!.idempotency_suffix).toMatch(/onboard/)
  })

  // ACTUALIZADA · E57 (CC#2 2026-09-16). Hasta hoy esta prueba exigía que
  // `PRODUCE` estuviera SIN destino, junto con los otros cuatro: era cierto y
  // deliberado desde el 05-jun. E57 le dio destino a `PRODUCE` para que el
  // repartidor tenga a quién despachar `planeación` SIN abrir la taxonomía de
  // seis (que está reservada a Emilio · §144). Los otros CUATRO siguen sin
  // destino y esta prueba lo sigue exigiendo: es el guarda de que no se abrió
  // el mapa de par en par.
  it('canon · ACQUIRE/ALWAYS_ON/REVIEW/GROWTH siguen deliberately UNMAPPED · legacy agent path', () => {
    expect(JOURNEY_WORKFLOW_MAP.ACQUIRE).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.ALWAYS_ON).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.REVIEW).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.GROWTH).toBeUndefined()
  })

  it('canon · PRODUCE YA tiene destino · planeación (E57)', () => {
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE).toBeDefined()
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE!.workflow_id).toBe('X9F0zp6LQ2xGEYVS')
  })

  it('canon · JOURNEY_WORKFLOW_MAP is immutable (Object.freeze)', () => {
    expect(Object.isFrozen(JOURNEY_WORKFLOW_MAP)).toBe(true)
  })
})

describe('getJourneyWorkflowTarget', () => {
  it('canon · returns target for mapped journey', () => {
    const target = getJourneyWorkflowTarget('ONBOARD')
    expect(target?.workflow_id).toBe('LyVoKcrypS5uLyuu')
  })
  // ACTUALIZADA · E57 · el ejemplo de «sin destino» pasa de PRODUCE (que ya lo
  // tiene) a ACQUIRE (que sigue sin tenerlo). La propiedad que se prueba no
  // cambió: un recorrido sin entrada en el mapa devuelve undefined.
  it('canon · returns undefined for unmapped journey', () => {
    expect(getJourneyWorkflowTarget('ACQUIRE')).toBeUndefined()
  })
})

describe('isWorkflowJourney', () => {
  it('canon · true for mapped journey', () => {
    expect(isWorkflowJourney('ONBOARD')).toBe(true)
  })
  // ACTUALIZADA · E57 · idem · PRODUCE ya es de obrero; ACQUIRE y GROWTH no.
  it('canon · false for unmapped journey (legacy agent path)', () => {
    expect(isWorkflowJourney('ACQUIRE')).toBe(false)
    expect(isWorkflowJourney('GROWTH')).toBe(false)
  })
})
