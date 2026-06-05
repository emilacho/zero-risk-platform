/**
 * Tests · sala-ingress auth · 3 tiers (A internal_key · B hmac · C public_gate).
 */
import { describe, it, expect } from 'vitest'
import {
  checkSourceAuth,
  computeHmac,
  type IngressSource,
} from '@/lib/sala-ingress'

const TIER_A: IngressSource = {
  source: 'emilio-manual',
  tier: 'A',
  auth_method: 'internal_key',
  auth_secret_env_var: null,
  intents_allowed: ['onboard', 'campaign'],
  description: 'Internal trusted',
  active: true,
}

const TIER_B: IngressSource = {
  source: 'ventas/deal-won',
  tier: 'B',
  auth_method: 'hmac',
  auth_secret_env_var: 'SALA_INGRESS_VENTAS_HMAC_SECRET',
  intents_allowed: ['onboard'],
  description: 'Partner CRM',
  active: true,
}

const TIER_C: IngressSource = {
  source: 'public-form',
  tier: 'C',
  auth_method: 'public_gate',
  auth_secret_env_var: null,
  intents_allowed: ['onboard'],
  description: 'Public form · ADR-012',
  active: true,
}

describe('checkSourceAuth · tier A internal_key', () => {
  it('accepts matching x-api-key', () => {
    const r = checkSourceAuth({
      source: TIER_A,
      request: { source: TIER_A.source, internal_key: 'super-secret' },
      secret_value: 'super-secret',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tier).toBe('A')
  })

  it('rejects missing key', () => {
    const r = checkSourceAuth({
      source: TIER_A,
      request: { source: TIER_A.source },
      secret_value: 'super-secret',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects mismatched key', () => {
    const r = checkSourceAuth({
      source: TIER_A,
      request: { source: TIER_A.source, internal_key: 'wrong' },
      secret_value: 'super-secret',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects when server secret not configured', () => {
    const r = checkSourceAuth({
      source: TIER_A,
      request: { source: TIER_A.source, internal_key: 'anything' },
      secret_value: '',
    })
    expect(r.ok).toBe(false)
  })
})

describe('checkSourceAuth · tier B hmac', () => {
  const SECRET = 'partner-secret-x'
  const RAW_BODY = '{"source":"ventas/deal-won","intent":"onboard"}'
  const TS_SECONDS = '1780690000'
  const NOW_MS = 1780690000_000 // exactly TS · within window

  it('accepts valid signature within window', () => {
    const sig = computeHmac(SECRET, TS_SECONDS, RAW_BODY)
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: sig,
        timestamp: TS_SECONDS,
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tier).toBe('B')
  })

  it('rejects wrong signature', () => {
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: 'sha256=deadbeef',
        timestamp: TS_SECONDS,
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects timestamp outside window', () => {
    const sig = computeHmac(SECRET, TS_SECONDS, RAW_BODY)
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: sig,
        timestamp: TS_SECONDS,
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS + 10 * 60 * 1000,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects missing signature header', () => {
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        timestamp: TS_SECONDS,
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects missing timestamp header', () => {
    const sig = computeHmac(SECRET, TS_SECONDS, RAW_BODY)
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: sig,
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects non-integer timestamp', () => {
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: 'sha256=x',
        timestamp: 'not-a-number',
        raw_body: RAW_BODY,
      },
      secret_value: SECRET,
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects when server secret env not set', () => {
    const sig = computeHmac(SECRET, TS_SECONDS, RAW_BODY)
    const r = checkSourceAuth({
      source: TIER_B,
      request: {
        source: TIER_B.source,
        signature: sig,
        timestamp: TS_SECONDS,
        raw_body: RAW_BODY,
      },
      secret_value: '',
      now_ms: NOW_MS,
    })
    expect(r.ok).toBe(false)
  })
})

describe('checkSourceAuth · tier C public_gate', () => {
  it('refuses with tier_c_filter_not_implemented', () => {
    const r = checkSourceAuth({
      source: TIER_C,
      request: { source: TIER_C.source },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/tier_c_filter_not_implemented/)
  })
})

describe('checkSourceAuth · misconfig defenses', () => {
  it('refuses unsupported tier/method combo', () => {
    const broken: IngressSource = {
      ...TIER_B,
      auth_method: 'internal_key',
    }
    const r = checkSourceAuth({
      source: broken,
      request: { source: broken.source, internal_key: 'x' },
      secret_value: 'x',
    })
    // tier B + internal_key falls into TIER_A branch only if both match.
    // Here: tier='B' + auth_method='internal_key' → no branch hits true →
    // unsupported combo
    expect(r.ok).toBe(false)
  })
})

describe('computeHmac · canonical pattern', () => {
  it('matches Slack-style sha256=<hex>', () => {
    const sig = computeHmac('test', '1234567890', '{"a":1}')
    expect(sig.startsWith('sha256=')).toBe(true)
    expect(sig.length).toBe('sha256='.length + 64)
  })

  it('is deterministic for the same inputs', () => {
    const a = computeHmac('s', '1', 'b')
    const b = computeHmac('s', '1', 'b')
    expect(a).toBe(b)
  })

  it('differs when secret differs', () => {
    expect(computeHmac('a', '1', 'b')).not.toBe(computeHmac('z', '1', 'b'))
  })

  it('differs when timestamp differs', () => {
    expect(computeHmac('s', '1', 'b')).not.toBe(computeHmac('s', '2', 'b'))
  })

  it('differs when body differs', () => {
    expect(computeHmac('s', '1', 'a')).not.toBe(computeHmac('s', '1', 'b'))
  })
})
