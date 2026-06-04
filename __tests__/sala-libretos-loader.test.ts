/**
 * Tests for src/lib/sala/libretos/loader.ts · Sprint 12 Fase 0
 * Ronda 2 Track E · loader + validator.
 *
 * Coverage ·
 * - loadLibreto accepts a valid libreto and returns ok=true
 * - loadLibreto rejects shape errors with explicit codes
 * - validateLibreto catches duplicate step_ids
 * - validateLibreto catches dangling next_step refs
 * - validateLibreto catches missing entry_step_id
 * - validateLibreto catches invalid retry_budget
 * - validateLibreto catches fork/join mismatches
 * - validateLibreto catches unreachable steps
 * - conditional next_step refs validated
 */
import { describe, it, expect } from 'vitest'
import { loadLibreto, validateLibreto } from '../src/lib/sala/libretos/loader'
import type { Libreto } from '../src/lib/sala/libretos/types'

// Minimal valid libreto fixture · action → terminal_success.
function minimalLibreto(): Libreto {
  return {
    journey_type: 'PRODUCE',
    version: 1,
    description: 'minimal · single action then terminal',
    entry_step_id: 'a',
    steps: [
      {
        step_id: 'a',
        step_type: 'action',
        agent_id: 'jefe-marketing',
        retry_budget: {
          max_attempts: 1,
          initial_backoff_ms: 100,
          max_backoff_ms: 100,
          on_exhausted: 'terminal_failure',
        },
        next_step: { kind: 'static', step_id: 'done' },
      },
      {
        step_id: 'done',
        step_type: 'terminal_success',
      },
    ],
    metadata: { status: 'draft' },
  }
}

// ─── Happy path ────────────────────────────────────────────────────

describe('loadLibreto · happy path', () => {
  it('accepts a minimal well-formed libreto', () => {
    const result = loadLibreto(minimalLibreto())
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.libreto?.journey_type).toBe('PRODUCE')
  })

  it('round-trips through JSON.parse without losing structure', () => {
    const raw = JSON.stringify(minimalLibreto())
    const parsed = JSON.parse(raw)
    const result = loadLibreto(parsed)
    expect(result.ok).toBe(true)
  })
})

// ─── Shape errors ──────────────────────────────────────────────────

describe('loadLibreto · shape errors', () => {
  it('rejects non-object input', () => {
    const result = loadLibreto('not-a-libreto')
    expect(result.ok).toBe(false)
    expect(result.errors[0]!.code).toBe('shape')
  })

  it('rejects invalid journey_type', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    bad.journey_type = 'UNKNOWN'
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path === '$.journey_type')).toBe(true)
  })

  it('rejects version <= 0', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    bad.version = 0
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path === '$.version')).toBe(true)
  })

  it('rejects empty description', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    bad.description = ''
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects empty steps array', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    bad.steps = []
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path === '$.steps')).toBe(true)
  })

  it('rejects unknown step_type', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    ;(bad.steps as Array<Record<string, unknown>>)[0]!.step_type = 'weird_kind'
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path === '$.steps[0].step_type')).toBe(
      true,
    )
  })

  it('rejects metadata.status not in enum', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    ;(bad.metadata as Record<string, unknown>).status = 'experimental'
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects action step without agent_id', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    delete (bad.steps as Array<Record<string, unknown>>)[0]!.agent_id
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path?.endsWith('.agent_id'))).toBe(true)
  })

  it('rejects retry_budget with max_attempts < 1', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    const step = (bad.steps as Array<Record<string, unknown>>)[0]!
    ;(step.retry_budget as Record<string, unknown>).max_attempts = 0
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.code === 'invalid_retry_budget'),
    ).toBe(true)
  })

  it('rejects retry_budget with max_backoff_ms < initial_backoff_ms', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    const step = (bad.steps as Array<Record<string, unknown>>)[0]!
    ;(step.retry_budget as Record<string, unknown>).initial_backoff_ms = 1000
    ;(step.retry_budget as Record<string, unknown>).max_backoff_ms = 100
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.code === 'invalid_retry_budget'),
    ).toBe(true)
  })

  it('rejects retry_budget with invalid on_exhausted', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    const step = (bad.steps as Array<Record<string, unknown>>)[0]!
    ;(step.retry_budget as Record<string, unknown>).on_exhausted = 'crash'
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
  })

  it('rejects next_step with invalid kind', () => {
    const bad = minimalLibreto() as unknown as Record<string, unknown>
    const step = (bad.steps as Array<Record<string, unknown>>)[0]!
    ;(step.next_step as Record<string, unknown>).kind = 'magic'
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.code === 'invalid_next_step'),
    ).toBe(true)
  })
})

// ─── Structural errors (validateLibreto) ───────────────────────────

describe('validateLibreto · structural errors', () => {
  it('catches duplicate step_ids', () => {
    const lib = minimalLibreto()
    const dup: Libreto = {
      ...lib,
      steps: [...lib.steps, { step_id: 'a', step_type: 'terminal_failure' }],
    }
    const errors = validateLibreto(dup)
    expect(errors.some((e) => e.code === 'duplicate_step_id')).toBe(true)
  })

  it('catches missing entry_step_id', () => {
    const bad: Libreto = { ...minimalLibreto(), entry_step_id: 'ghost' }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'invalid_entry')).toBe(true)
  })

  it('catches dangling next_step static ref', () => {
    const bad: Libreto = {
      ...minimalLibreto(),
      steps: [
        {
          step_id: 'a',
          step_type: 'action',
          agent_id: 'jefe-marketing',
          retry_budget: {
            max_attempts: 1,
            initial_backoff_ms: 0,
            max_backoff_ms: 0,
            on_exhausted: 'terminal_failure',
          },
          next_step: { kind: 'static', step_id: 'ghost' },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
    expect(errors.some((e) => e.code === 'unreachable_step')).toBe(true)
  })

  it('catches dangling conditional then ref', () => {
    const bad: Libreto = {
      ...minimalLibreto(),
      steps: [
        {
          step_id: 'a',
          step_type: 'action',
          agent_id: 'jefe-marketing',
          retry_budget: {
            max_attempts: 1,
            initial_backoff_ms: 0,
            max_backoff_ms: 0,
            on_exhausted: 'terminal_failure',
          },
          next_step: {
            kind: 'conditional',
            conditions: [{ when: 'x === 1', then: 'ghost' }],
            default: 'done',
          },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
  })

  it('catches dangling conditional default ref', () => {
    const bad: Libreto = {
      ...minimalLibreto(),
      steps: [
        {
          step_id: 'a',
          step_type: 'action',
          agent_id: 'jefe-marketing',
          retry_budget: {
            max_attempts: 1,
            initial_backoff_ms: 0,
            max_backoff_ms: 0,
            on_exhausted: 'terminal_failure',
          },
          next_step: {
            kind: 'conditional',
            conditions: [{ when: 'x === 1', then: 'done' }],
            default: 'ghost',
          },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
  })

  it('catches fork with dangling branch ref', () => {
    const bad: Libreto = {
      journey_type: 'PRODUCE',
      version: 1,
      description: 'fork bad',
      entry_step_id: 'fork',
      steps: [
        {
          step_id: 'fork',
          step_type: 'fork',
          branches: ['b1', 'ghost'],
          join_at: 'join',
        },
        { step_id: 'b1', step_type: 'terminal_success' },
        {
          step_id: 'join',
          step_type: 'join',
          waits_for: ['b1', 'ghost'],
          next_step: { kind: 'static', step_id: 'done' },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
  })

  it('catches fork with join_at pointing nowhere', () => {
    const bad: Libreto = {
      journey_type: 'PRODUCE',
      version: 1,
      description: 'fork bad join_at',
      entry_step_id: 'fork',
      steps: [
        {
          step_id: 'fork',
          step_type: 'fork',
          branches: ['b1', 'b2'],
          join_at: 'ghost',
        },
        { step_id: 'b1', step_type: 'terminal_success' },
        { step_id: 'b2', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
  })

  it('catches gate.next_step_rejected dangling', () => {
    const bad: Libreto = {
      journey_type: 'PRODUCE',
      version: 1,
      description: 'gate bad rejected',
      entry_step_id: 'gate',
      steps: [
        {
          step_id: 'gate',
          step_type: 'gate_hitl',
          gate_config: { timeout_ms: null, description: 'check' },
          next_step: { kind: 'static', step_id: 'done' },
          next_step_rejected: 'ghost',
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const errors = validateLibreto(bad)
    expect(errors.some((e) => e.code === 'unknown_step_ref')).toBe(true)
  })

  it('catches unreachable orphan steps', () => {
    const bad: Libreto = {
      ...minimalLibreto(),
      steps: [
        {
          step_id: 'a',
          step_type: 'action',
          agent_id: 'x',
          retry_budget: {
            max_attempts: 1,
            initial_backoff_ms: 0,
            max_backoff_ms: 0,
            on_exhausted: 'terminal_failure',
          },
          next_step: { kind: 'static', step_id: 'done' },
        },
        { step_id: 'done', step_type: 'terminal_success' },
        {
          step_id: 'orphan',
          step_type: 'terminal_failure',
        },
      ],
    }
    const errors = validateLibreto(bad)
    expect(
      errors.some(
        (e) =>
          e.code === 'unreachable_step' && e.message.includes('orphan'),
      ),
    ).toBe(true)
  })
})

// ─── Fork-with-2-branches minimum ──────────────────────────────────

describe('loadLibreto · fork minimums', () => {
  it('rejects fork with fewer than 2 branches', () => {
    const bad = {
      journey_type: 'PRODUCE',
      version: 1,
      description: 'bad fork',
      entry_step_id: 'fork',
      steps: [
        {
          step_id: 'fork',
          step_type: 'fork',
          branches: ['only_one'],
          join_at: 'join',
        },
        { step_id: 'only_one', step_type: 'terminal_success' },
        {
          step_id: 'join',
          step_type: 'join',
          waits_for: ['only_one'],
          next_step: { kind: 'static', step_id: 'done' },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'invalid_fork')).toBe(true)
  })

  it('rejects join with fewer than 2 waits_for', () => {
    const bad = {
      journey_type: 'PRODUCE',
      version: 1,
      description: 'bad join',
      entry_step_id: 'fork',
      steps: [
        {
          step_id: 'fork',
          step_type: 'fork',
          branches: ['a', 'b'],
          join_at: 'join',
        },
        { step_id: 'a', step_type: 'terminal_success' },
        { step_id: 'b', step_type: 'terminal_success' },
        {
          step_id: 'join',
          step_type: 'join',
          waits_for: ['a'],
          next_step: { kind: 'static', step_id: 'done' },
        },
        { step_id: 'done', step_type: 'terminal_success' },
      ],
      metadata: { status: 'draft' },
    }
    const result = loadLibreto(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'invalid_join')).toBe(true)
  })
})
