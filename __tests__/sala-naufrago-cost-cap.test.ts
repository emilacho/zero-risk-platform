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
  resolveNaufragoCapUsd,
  NAUFRAGO_DAILY_ALERT_USD,
  NAUFRAGO_PHASE1_RUN_CAP_USD,
  NAUFRAGO_TENANT_ID_HINT,
  NAUFRAGO_TENANT_ID_UUID,
  NAUFRAGO_TENANT_IDS,
} from '@/lib/sala-journey-dispatch'

describe('Náufrago cap · SALA_NAUFRAGO_CAP_USD env override', () => {
  afterEach(() => {
    delete process.env.SALA_NAUFRAGO_CAP_USD
  })
  it('default · no env → falls back to constant ($5)', () => {
    delete process.env.SALA_NAUFRAGO_CAP_USD
    expect(resolveNaufragoCapUsd()).toBe(NAUFRAGO_PHASE1_RUN_CAP_USD)
  })
  it('env override · SALA_NAUFRAGO_CAP_USD=30 → cap is $30', () => {
    process.env.SALA_NAUFRAGO_CAP_USD = '30'
    expect(resolveNaufragoCapUsd()).toBe(30)
  })
  it('env override · invalid value → falls back to default', () => {
    process.env.SALA_NAUFRAGO_CAP_USD = 'not-a-number'
    expect(resolveNaufragoCapUsd()).toBe(NAUFRAGO_PHASE1_RUN_CAP_USD)
  })
  it('eval · $14.05 spend · cap raised to $30 → PASS (no longer blocks)', () => {
    process.env.SALA_NAUFRAGO_CAP_USD = '30'
    const r = evaluateNaufragoRunCap({
      tenant_id: NAUFRAGO_TENANT_ID_UUID,
      spent_usd: 14.05,
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
    expect(r.reason).toBe('under_cap')
  })
})

describe('Náufrago cost cap · canon constants', () => {
  it('canon · USD 5.00 per-run cap (Emilio §144 2026-06-05)', () => {
    expect(NAUFRAGO_PHASE1_RUN_CAP_USD).toBe(5.0)
  })
  it('canon · USD 10.00 daily alert threshold (G5 canon)', () => {
    expect(NAUFRAGO_DAILY_ALERT_USD).toBe(10.0)
  })
  it('canon · tenant_id hint matches Náufrago piloto label (legacy alias)', () => {
    expect(NAUFRAGO_TENANT_ID_HINT).toBe('naufrago')
  })
  it('canon · tenant_id UUID matches Náufrago client_id (Phase 1.1 gap #2 fix)', () => {
    // sala_event_log.tenant_id is UUID-typed · the cap MUST engage on UUID.
    expect(NAUFRAGO_TENANT_ID_UUID).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
  })
  it('canon · both UUID and legacy alias engage the cap (alias set)', () => {
    expect(NAUFRAGO_TENANT_IDS.has(NAUFRAGO_TENANT_ID_UUID)).toBe(true)
    expect(NAUFRAGO_TENANT_IDS.has(NAUFRAGO_TENANT_ID_HINT)).toBe(true)
  })
})

describe('Náufrago cap · Phase 1.1 gap #2 · UUID engagement (MANDATORY)', () => {
  it('canon · cap ENGAGES when tenant_id is the canonical UUID + over cap', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: NAUFRAGO_TENANT_ID_UUID,
      spent_usd: 5.0,
      enforce: true,
    })
    expect(r.verdict).toBe('block')
    if (r.verdict === 'block') {
      expect(r.reason).toBe('over_cap')
      expect(r.cap_usd).toBe(5.0)
    }
  })

  it('canon · cap PASSES (under_cap) when UUID + under cap', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: NAUFRAGO_TENANT_ID_UUID,
      spent_usd: 2.5,
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
    if (r.verdict === 'pass') expect(r.reason).toBe('under_cap')
  })

  it('canon · legacy string alias still engages (backwards-compat)', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: NAUFRAGO_TENANT_ID_HINT, // 'naufrago'
      spent_usd: 7.5,
      enforce: true,
    })
    expect(r.verdict).toBe('block')
  })

  it('canon · random UUID is NOT Náufrago tenant (cap does NOT engage)', () => {
    const r = evaluateNaufragoRunCap({
      tenant_id: '11111111-2222-3333-4444-555555555555',
      spent_usd: 100,
      enforce: true,
    })
    expect(r.verdict).toBe('pass')
    if (r.verdict === 'pass') expect(r.reason).toBe('other_tenant')
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

  it('canon · snapshot includes cap + alert + enforced state + canon source + UUID tenant fields', () => {
    delete process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE
    const snap = getNaufragoCapSnapshot()
    expect(snap.cap_usd).toBe(5.0)
    expect(snap.daily_alert_usd).toBe(10.0)
    expect(snap.tenant_id_hint).toBe('naufrago')
    expect(snap.tenant_id_uuid).toBe(NAUFRAGO_TENANT_ID_UUID)
    expect(snap.tenant_ids_accepted).toEqual(
      expect.arrayContaining([NAUFRAGO_TENANT_ID_UUID, NAUFRAGO_TENANT_ID_HINT]),
    )
    expect(snap.enforced).toBe(false)
    expect(snap.enforce_env_var).toBe('SALA_NAUFRAGO_RUN_CAP_ENFORCE')
    expect(snap.canon_source).toMatch(/SEAM-CLOSE-modelb-shadow-2026-06-05/)
  })
  it('canon · enforced reflects env flag', () => {
    process.env.SALA_NAUFRAGO_RUN_CAP_ENFORCE = 'true'
    expect(getNaufragoCapSnapshot().enforced).toBe(true)
  })
})
