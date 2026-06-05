/**
 * Tests · Náufrago Phase 1 cost cap · §144 Emilio 2026-06-05 · USD 5.00.
 *
 * Covers · default-OFF enforce flag · per-tenant scoping · cap value
 * + snapshot · evaluation verdicts (pass · block) · adjustability.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  evaluateNaufragoRunCap,
  getNaufragoCapSnapshot,
  isNaufragoCapEnforced,
  NAUFRAGO_DAILY_ALERT_USD,
  NAUFRAGO_PHASE1_RUN_CAP_USD,
  NAUFRAGO_TENANT_ID_HINT,
} from '@/lib/sala-journey-dispatch'

describe('Náufrago cost cap · canon constants', () => {
  it('canon · USD 5.00 per-run cap (Emilio §144 2026-06-05)', () => {
    expect(NAUFRAGO_PHASE1_RUN_CAP_USD).toBe(5.0)
  })
  it('canon · USD 10.00 daily alert threshold (G5 canon)', () => {
    expect(NAUFRAGO_DAILY_ALERT_USD).toBe(10.0)
  })
  it('canon · tenant_id hint matches Náufrago piloto label', () => {
    expect(NAUFRAGO_TENANT_ID_HINT).toBe('naufrago')
  })
})

describe('Náufrago cost cap · enforce flag (default-OFF)', () => {
  const orig = process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
    else process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = orig
  })

  it('canon · default-OFF when env not set', () => {
    delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
    expect(isNaufragoCapEnforced()).toBe(false)
  })
  it('canon · enabled when env === "true"', () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    expect(isNaufragoCapEnforced()).toBe(true)
  })
  it('canon · non-"true" values treated as disabled', () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = '1'
    expect(isNaufragoCapEnforced()).toBe(false)
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'TRUE'
    expect(isNaufragoCapEnforced()).toBe(false)
  })
  it('canon · explicit input.enforce overrides env', () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    expect(isNaufragoCapEnforced({ enforce: false })).toBe(false)
  })
})

describe('evaluateNaufragoRunCap · verdict logic', () => {
  it('canon · enforce=false → pass · reason flag_off', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'naufrago',
      spent_usd: 100,
      enforce: false,
    })
    expect(r.verdict).toBe('pass')
    if (r.verdict === 'pass') expect(r.reason).toBe('flag_off')
  })

  it('canon · tenant != naufrago → pass · reason other_tenant (even if enforced)', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'other-client',
      spent_usd: 100,
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
    if (r.verdict === 'pass') expect(r.reason).toBe('other_tenant')
  })

  it('canon · under cap → pass · reason under_cap', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'naufrago',
      spent_usd: 4.99,
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
    if (r.verdict === 'pass') expect(r.reason).toBe('under_cap')
  })

  it('canon · at cap (= 5.00) → block', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'naufrago',
      spent_usd: 5.0,
      enforce: true,
    })
    expect(r.verdict).toBe('block')
    if (r.verdict === 'block') {
      expect(r.reason).toBe('over_cap')
      expect(r.cap_usd).toBe(5.0)
      expect(r.spent_usd).toBe(5.0)
    }
  })

  it('canon · over cap → block · carries cap + spent for forensics', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'naufrago',
      spent_usd: 7.5,
      enforce: true,
    })
    expect(r.verdict).toBe('block')
    if (r.verdict === 'block') {
      expect(r.cap_usd).toBe(5.0)
      expect(r.spent_usd).toBe(7.5)
    }
  })

  it('canon · explicit cap_usd override (adjustable post-measurement)', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: 'naufrago',
      spent_usd: 6.0,
      cap_usd: 10.0, // adjusted up
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
  })
})

describe('getNaufragoCapSnapshot · introspection', () => {
  const orig = process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
    else process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = orig
  })

  it('canon · snapshot includes cap + alert + enforced state + canon source', () => {
    delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
    const snap = getNaufragoCapSnapshot()
    expect(snap.cap_usd).toBe(5.0)
    expect(snap.daily_alert_usd).toBe(10.0)
    expect(snap.tenant_id_hint).toBe('naufrago')
    expect(snap.enforced).toBe(false)
    expect(snap.enforce_env_var).toBe('SALA_NAUFRAGO_RUN_CAP_ENFORCE')
    expect(snap.canon_source).toMatch(/SEAM-CLOSE-modelb-shadow-2026-06-05/)
  })
  it('canon · enforced reflects env flag', () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    expect(getNaufragoCapSnapshot().enforced).toBe(true)
  })
})
