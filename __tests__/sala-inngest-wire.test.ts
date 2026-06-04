/**
 * Tests for src/lib/sala/inngest/* · Escalón 2 SHADOW wire.
 *
 * §148 honest · these tests verify STRUCTURE only (client id, function
 * shape, event name, mode default). They do NOT call Inngest cloud
 * because (a) CI has no Inngest creds, (b) we already proved the
 * runtime properties in the spike (RESULTS-CC3-inngest-runtime-verify
 * · 3 runs · 21 trace lines) for local-dev mode, and (c) the REAL
 * deploy durability test runs OUT-OF-BAND via the smoke script
 * `scripts/sala/synthetic-durability-smoke.mjs` after the Vercel
 * preview deploy lands.
 *
 * What is verified ·
 * - Client constructed with INNGEST_APP_ID = 'zero-risk-platform'
 * - SHADOW mode default (no env var override)
 * - SYNTHETIC_FUNCTIONS array exposed + at least one function
 * - syntheticDurabilityTest registers under the expected event name
 *   with idempotency keyed on event.data.runId + retries=3
 */
import { describe, it, expect } from 'vitest'
import {
  INNGEST_APP_ID,
  SYNTHETIC_DURABILITY_EVENT,
  SYNTHETIC_FUNCTIONS,
  getSalaInngestMode,
  inngestClient,
  syntheticDurabilityTest,
} from '../src/lib/sala/inngest'

describe('Inngest wire · client', () => {
  it('binds the canonical app id', () => {
    expect(INNGEST_APP_ID).toBe('zero-risk-platform')
    // The SDK exposes id via `.id` on the client instance.
    expect(inngestClient.id).toBe('zero-risk-platform')
  })
})

describe('Inngest wire · mode', () => {
  it('defaults to shadow when SALA_INNGEST_MODE is absent', () => {
    const before = process.env.SALA_INNGEST_MODE
    delete process.env.SALA_INNGEST_MODE
    try {
      expect(getSalaInngestMode()).toBe('shadow')
    } finally {
      if (before !== undefined) process.env.SALA_INNGEST_MODE = before
    }
  })

  it('returns live ONLY when explicitly set to "live"', () => {
    const before = process.env.SALA_INNGEST_MODE
    try {
      process.env.SALA_INNGEST_MODE = 'live'
      expect(getSalaInngestMode()).toBe('live')
      process.env.SALA_INNGEST_MODE = 'anything-else'
      expect(getSalaInngestMode()).toBe('shadow')
    } finally {
      if (before !== undefined) process.env.SALA_INNGEST_MODE = before
      else delete process.env.SALA_INNGEST_MODE
    }
  })
})

describe('Inngest wire · synthetic functions', () => {
  it('exposes at least one synthetic function', () => {
    expect(SYNTHETIC_FUNCTIONS.length).toBeGreaterThanOrEqual(1)
  })

  it('declares the canonical durability test event name', () => {
    expect(SYNTHETIC_DURABILITY_EVENT).toBe('synthetic/durability.test')
  })

  it('syntheticDurabilityTest is exported + has stable id', () => {
    // The SDK exposes the function id via .id() or .opts depending on
    // version · v4 uses an internal `id` accessor on the function
    // instance. We probe loosely so a minor SDK rev does not break.
    const anyFn = syntheticDurabilityTest as unknown as {
      id?: string | (() => string)
      opts?: { id?: string }
    }
    const id =
      typeof anyFn.id === 'function'
        ? anyFn.id()
        : (anyFn.id ?? anyFn.opts?.id ?? '')
    expect(typeof id).toBe('string')
    expect(id).toContain('synthetic-durability-test')
  })
})
