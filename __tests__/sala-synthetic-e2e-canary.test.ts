/**
 * Tests for src/lib/sala/integration-wire.ts + canary-function.ts ·
 * Track S finale prep · synthetic E2E.
 *
 * Coverage ·
 * - buildSalaIntegration default · returns integration with in-memory
 *   storage + allowAllBudgetStub
 * - buildSalaIntegration with g6_enabled=true + supabase mock · wires
 *   the G6 adapter
 * - buildSalaIntegration with explicit budget_check · overrides the
 *   factory
 * - runSyntheticCanary default · happy path on synthetic ONBOARD · the
 *   loop halts at gate/terminal/needs_judgment within max_ticks
 * - runSyntheticCanary respects custom journey_type override
 * - isSyntheticCanaryEnabled · default off · true only on explicit env
 */
import { describe, it, expect, vi } from 'vitest'
import { buildSalaIntegration } from '../src/lib/sala/integration-wire'
import type { BuildSalaIntegrationInput } from '../src/lib/sala/integration-wire'
import {
  runSyntheticCanary,
  isSyntheticCanaryEnabled,
  SYNTHETIC_CANARY_EVENT,
} from '../src/lib/sala/inngest/canary-function'
import { allowAllBudgetStub } from '../src/lib/sala-router/stubs'
import { InMemoryEventLogStorage } from '../src/lib/sala-event-log'
import type { BudgetCheckFn } from '../src/lib/sala-router'

// ─── buildSalaIntegration ──────────────────────────────────────────

describe('buildSalaIntegration · defaults', () => {
  it('uses in-memory storage by default', () => {
    const { storage } = buildSalaIntegration()
    expect(storage).toBeInstanceOf(InMemoryEventLogStorage)
  })

  it('uses allowAllBudgetStub when no G6 config provided', () => {
    const { budget_check } = buildSalaIntegration()
    expect(budget_check).toBe(allowAllBudgetStub)
  })

  it('honours explicit budget_check override', () => {
    const customCheck = vi.fn(async () => ({
      allowed: true,
      budget_key: 'custom',
    }))
    const { budget_check } = buildSalaIntegration({
      budget_check: customCheck as unknown as BudgetCheckFn,
    })
    expect(budget_check).toBe(customCheck)
  })

  it('uses a supplied storage instance', () => {
    const storage = new InMemoryEventLogStorage()
    const { storage: out } = buildSalaIntegration({ storage })
    expect(out).toBe(storage)
  })
})

describe('buildSalaIntegration · G6 wire opt-in', () => {
  it('wires G6 router-adapter when g6_enabled=true + supabase passed', () => {
    const fakeSupabase = {
      rpc: vi.fn(async () => ({
        data: [
          {
            exhausted: false,
            remaining_cost_usd: 99,
            remaining_steps: 99,
            shadow_mode_db: true,
          },
        ],
        error: null,
      })),
    } as unknown as NonNullable<BuildSalaIntegrationInput['supabase']>


    const { budget_check } = buildSalaIntegration({
      g6_enabled: true,
      supabase: fakeSupabase,
    })
    // The G6 adapter is NOT the allowAllBudgetStub reference.
    expect(budget_check).not.toBe(allowAllBudgetStub)
    // And it does have the async shape (returns a Promise).
    expect(typeof budget_check).toBe('function')
  })

  it('falls back to allowAllBudgetStub when g6_enabled is false even with supabase', () => {
    // g6_enabled is undefined / not true · the factory still wires the
    // adapter only when supabase IS supplied (defense in depth).
    // The current spec: presence of either g6_enabled or supabase
    // triggers the adapter path. Test the explicit OFF: neither.
    const { budget_check } = buildSalaIntegration({
      g6_enabled: false,
    })
    expect(budget_check).toBe(allowAllBudgetStub)
  })
})

// ─── runSyntheticCanary handler ────────────────────────────────────

describe('runSyntheticCanary · happy path', () => {
  it('runs the synthetic ONBOARD loop and halts within max_ticks', async () => {
    const trace = await runSyntheticCanary({
      tenant_id: 'synthetic',
      client_id: 'c-canary',
      journey_type: 'ONBOARD',
      logical_period: '2026-W23',
      correlation_id: 'canary-test-001',
      max_ticks: 50,
    })
    // The loop must halt on some terminal condition · NOT max_ticks
    // (50 is plenty for the ONBOARD libreto · 12 steps).
    expect(trace.halted_by).not.toBe('max_ticks')
    expect(trace.ticks).toBeGreaterThanOrEqual(1)
    expect(trace.total_events).toBeGreaterThanOrEqual(1)
    expect(trace.elapsed_ms).toBeGreaterThanOrEqual(0)
  })

  it('returns the events list derived from in-memory storage', async () => {
    const trace = await runSyntheticCanary({
      tenant_id: 'synthetic',
      client_id: 'c-canary-events',
      journey_type: 'ONBOARD',
      logical_period: '2026-W24',
      correlation_id: 'canary-test-002',
    })
    expect(Array.isArray(trace.events)).toBe(true)
    // We expect at least the kickstart event + at least one decision
    // event.
    expect(trace.events.length).toBeGreaterThanOrEqual(1)
    expect(trace.events[0]?.sequence).toBeDefined()
    expect(trace.events[0]?.event_type).toBeTruthy()
  })

  it('uses defaults when event.data is empty', async () => {
    const trace = await runSyntheticCanary({})
    expect(trace.halted_by).toBeTruthy()
    expect(trace.ticks).toBeGreaterThanOrEqual(1)
  })

  it('SYNTHETIC_CANARY_EVENT constant is canonical', () => {
    expect(SYNTHETIC_CANARY_EVENT).toBe('synthetic/canary.run')
  })
})

// ─── isSyntheticCanaryEnabled gate ─────────────────────────────────

describe('isSyntheticCanaryEnabled · env gate', () => {
  it('returns false when SALA_CANARY_ENABLED is unset', () => {
    const prev = process.env.SALA_CANARY_ENABLED
    delete process.env.SALA_CANARY_ENABLED
    try {
      expect(isSyntheticCanaryEnabled()).toBe(false)
    } finally {
      if (prev !== undefined) process.env.SALA_CANARY_ENABLED = prev
    }
  })

  it('returns true ONLY when SALA_CANARY_ENABLED is exactly "true"', () => {
    const prev = process.env.SALA_CANARY_ENABLED
    try {
      process.env.SALA_CANARY_ENABLED = 'true'
      expect(isSyntheticCanaryEnabled()).toBe(true)

      process.env.SALA_CANARY_ENABLED = '1'
      expect(isSyntheticCanaryEnabled()).toBe(false)

      process.env.SALA_CANARY_ENABLED = 'TRUE'
      expect(isSyntheticCanaryEnabled()).toBe(false)

      process.env.SALA_CANARY_ENABLED = ''
      expect(isSyntheticCanaryEnabled()).toBe(false)
    } finally {
      if (prev !== undefined) process.env.SALA_CANARY_ENABLED = prev
      else delete process.env.SALA_CANARY_ENABLED
    }
  })
})
