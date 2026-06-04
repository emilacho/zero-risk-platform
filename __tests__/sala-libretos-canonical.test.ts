/**
 * Tests for the 6 canonical libretos · Sprint 12 Fase 0 Ronda 2
 * Track E · structural validation + registry behavior.
 *
 * Every canonical libreto MUST ·
 * - Pass loadLibreto + validateLibreto with zero errors
 * - Have a reachable terminal step from entry
 * - Be retrievable via the registry under its declared journey_type
 *
 * GROWTH MUST additionally ·
 * - Be flagged `pending_144` in metadata
 * - Have a §144 gate as the entry step (so nothing dispatches before
 *   Emilio approves)
 */
import { describe, it, expect } from 'vitest'
import { loadLibreto, validateLibreto } from '../src/lib/sala/libretos/loader'
import {
  CANONICAL_LIBRETOS,
  getLibreto,
  listJourneys,
  listPending144Libretos,
} from '../src/lib/sala/libretos/registry'
import type { JourneyType, Libreto } from '../src/lib/sala/libretos/types'

const ALL_JOURNEYS: JourneyType[] = [
  'ACQUIRE',
  'ONBOARD',
  'PRODUCE',
  'REVIEW',
  'ALWAYS_ON',
  'GROWTH',
]

// ─── Canonical libretos · per-journey validation ───────────────────

describe.each(ALL_JOURNEYS)('canonical libreto · %s', (journey) => {
  const libreto = CANONICAL_LIBRETOS[journey]

  it('exists in the registry', () => {
    expect(libreto).toBeDefined()
    expect(libreto.journey_type).toBe(journey)
  })

  it('passes loadLibreto', () => {
    const result = loadLibreto(libreto)
    if (!result.ok) {
      // Surface the errors for fast diagnosis.
      throw new Error(
        `${journey} failed loader · ${JSON.stringify(result.errors, null, 2)}`,
      )
    }
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('passes validateLibreto (structural)', () => {
    const errors = validateLibreto(libreto)
    if (errors.length > 0) {
      throw new Error(
        `${journey} structural errors · ${JSON.stringify(errors, null, 2)}`,
      )
    }
    expect(errors).toHaveLength(0)
  })

  it('has at least one terminal step reachable from entry', () => {
    const reachable = computeReachable(libreto)
    const terminalIds = libreto.steps
      .filter(
        (s) =>
          s.step_type === 'terminal_success' || s.step_type === 'terminal_failure',
      )
      .map((s) => s.step_id)
    expect(terminalIds.length).toBeGreaterThan(0)
    const reachedTerminal = terminalIds.some((id) => reachable.has(id))
    expect(reachedTerminal).toBe(true)
  })

  it('all step_ids are unique', () => {
    const ids = libreto.steps.map((s) => s.step_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── GROWTH-specific guardrails (pending §144) ─────────────────────

describe('canonical libreto · GROWTH · §144 guardrails', () => {
  const growth = CANONICAL_LIBRETOS.GROWTH

  it('is flagged pending_144 (NOT ready for the router to enforce)', () => {
    expect(growth.metadata.status).toBe('pending_144')
  })

  it('first step is a §144 gate · nothing dispatches before Emilio approves', () => {
    const entry = growth.steps.find((s) => s.step_id === growth.entry_step_id)
    expect(entry).toBeDefined()
    expect(entry?.step_type).toBe('gate_144')
  })

  it('declares pending decisions for §144 review', () => {
    expect(growth.metadata.pending_decisions).toBeDefined()
    expect(growth.metadata.pending_decisions!.length).toBeGreaterThan(0)
  })
})

// ─── Registry helpers ─────────────────────────────────────────────

describe('libretos registry', () => {
  it('listJourneys returns all 6 canonical journey types', () => {
    const got = [...listJourneys()].sort()
    const want = [...ALL_JOURNEYS].sort()
    expect(got).toEqual(want)
  })

  it('getLibreto returns the libreto for a known journey', () => {
    const lib = getLibreto('PRODUCE')
    expect(lib).toBeDefined()
    expect(lib!.journey_type).toBe('PRODUCE')
  })

  it('listPending144Libretos surfaces GROWTH (the only pending one in the draft set)', () => {
    const pending = listPending144Libretos()
    expect(pending.length).toBeGreaterThanOrEqual(1)
    expect(pending.some((l) => l.journey_type === 'GROWTH')).toBe(true)
  })

  it('every canonical libreto has version >= 1', () => {
    for (const journey of ALL_JOURNEYS) {
      const lib = CANONICAL_LIBRETOS[journey]
      expect(lib.version).toBeGreaterThanOrEqual(1)
    }
  })

  it('every canonical libreto has a non-empty description', () => {
    for (const journey of ALL_JOURNEYS) {
      const lib = CANONICAL_LIBRETOS[journey]
      expect(lib.description.length).toBeGreaterThan(0)
    }
  })
})

// ─── Coverage · ensure each step_type appears in at least one libreto ──

describe('canonical libretos · step type coverage', () => {
  const allSteps = Object.values(CANONICAL_LIBRETOS).flatMap((l) => l.steps)
  const stepTypes = new Set(allSteps.map((s) => s.step_type))

  it('exercises action step_type', () => {
    expect(stepTypes.has('action')).toBe(true)
  })

  it('exercises gate_camino_iii step_type', () => {
    expect(stepTypes.has('gate_camino_iii')).toBe(true)
  })

  it('exercises gate_hitl step_type', () => {
    expect(stepTypes.has('gate_hitl')).toBe(true)
  })

  it('exercises gate_144 step_type (GROWTH at minimum)', () => {
    expect(stepTypes.has('gate_144')).toBe(true)
  })

  it('exercises fork step_type', () => {
    expect(stepTypes.has('fork')).toBe(true)
  })

  it('exercises join step_type', () => {
    expect(stepTypes.has('join')).toBe(true)
  })

  it('exercises terminal_success step_type', () => {
    expect(stepTypes.has('terminal_success')).toBe(true)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────

function computeReachable(libreto: Libreto): Set<string> {
  const byId = new Map(libreto.steps.map((s) => [s.step_id, s] as const))
  const reachable = new Set<string>()
  const stack: string[] = [libreto.entry_step_id]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const step = byId.get(id)
    if (!step) continue
    for (const next of successors(step)) {
      if (!reachable.has(next)) stack.push(next)
    }
  }
  return reachable
}

function successors(step: Libreto['steps'][number]): string[] {
  switch (step.step_type) {
    case 'action':
      return nextRefIds(step.next_step)
    case 'gate_camino_iii':
    case 'gate_hitl':
    case 'gate_144': {
      const out = nextRefIds(step.next_step)
      if (step.next_step_rejected) out.push(step.next_step_rejected)
      return out
    }
    case 'fork':
      return [...step.branches]
    case 'join':
      return nextRefIds(step.next_step)
    case 'terminal_success':
    case 'terminal_failure':
      return []
  }
}

function nextRefIds(
  ref: Extract<Libreto['steps'][number], { step_type: 'action' }>['next_step'],
): string[] {
  if (ref.kind === 'static') return [ref.step_id]
  return [...ref.conditions.map((c) => c.then), ref.default]
}
