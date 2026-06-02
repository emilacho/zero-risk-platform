/**
 * Tests for src/lib/sala/idempotency-key.ts · Sprint 12 Fase 0 ·
 * IdempotencyKeyDeriver canonical pure implementation · Opus #7 Q5
 * frozen with LogicalPeriod typed union.
 *
 * Opus #7 closure flagged · golden tests must be RIGOROUS · the
 * idempotency key is the load-bearing line of defence against the
 * 24-may $19 class of bug. These tests cover ·
 *
 * - 64-char lowercase hex (SHA-256) format
 * - Determinism (same input → same output)
 * - Sensitivity per axis (operationType, clientId, logicalPeriod
 *   kind, logicalPeriod value)
 * - Each canonical LogicalPeriod kind produces a distinct key for
 *   the same value (so `iso_week "2026-W23"` ≠ `custom "2026-W23"`)
 * - Q2 bug protection · per-poll execution_id variation MUST NOT
 *   change the key when business identity (op + client + period) is
 *   constant · this is THE property that prevents the 24-may daemon
 *   burst from being repeatable
 * - `custom.note` is metadata · MUST NOT participate in the key
 *   (two custom periods with same value, different notes collapse
 *   to same key)
 * - Canonical pipe separator (no shift-and-collide bugs across
 *   operationType / clientId boundaries)
 * - Edge cases (empty value, all 6 canonical kinds exercised)
 * - Singleton conformance to the IdempotencyKeyDeriver interface
 */
import { describe, it, expect } from 'vitest'
import {
  canonicalIdempotencyKeyDeriver,
  deriveIdempotencyKey,
  serializeLogicalPeriod,
} from '../src/lib/sala/idempotency-key'
import type { LogicalPeriod } from '../src/lib/sala/executor-contract'

const ISO_WEEK_23: LogicalPeriod = { kind: 'iso_week', value: '2026-W23' }
const ISO_WEEK_24: LogicalPeriod = { kind: 'iso_week', value: '2026-W24' }
const ISO_MONTH_JUN: LogicalPeriod = { kind: 'iso_month', value: '2026-06' }
const ISO_DATE_JUN02: LogicalPeriod = { kind: 'iso_date', value: '2026-06-02' }
const CAMPAIGN_A: LogicalPeriod = { kind: 'campaign_id', value: 'camp-abc' }
const TRIGGER_ULID_A: LogicalPeriod = { kind: 'trigger_ulid', value: '01HQXABC123' }
const CUSTOM_NOTE_FOO: LogicalPeriod = {
  kind: 'custom',
  value: '2026-W23',
  note: 'reviewer note FOO · using iso_week semantics for a non-standard run',
}
const CUSTOM_NOTE_BAR: LogicalPeriod = {
  kind: 'custom',
  value: '2026-W23',
  note: 'reviewer note BAR · different rationale, same value',
}

// ─── Format ─────────────────────────────────────────────────────────

describe('deriveIdempotencyKey · format', () => {
  it('returns a 64-char lowercase hex string', () => {
    const key = deriveIdempotencyKey({
      operationType: 'campaign.create_brief',
      clientId: 'client-abc',
      logicalPeriod: ISO_WEEK_23,
    })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─── Determinism ────────────────────────────────────────────────────

describe('deriveIdempotencyKey · determinism', () => {
  it('same inputs → same key', () => {
    const parts = {
      operationType: 'campaign.create_brief',
      clientId: 'client-abc',
      logicalPeriod: ISO_WEEK_23,
    }
    const a = deriveIdempotencyKey(parts)
    const b = deriveIdempotencyKey(parts)
    const c = deriveIdempotencyKey(parts)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('logically-equal LogicalPeriod objects → same key (structural)', () => {
    const a = deriveIdempotencyKey({
      operationType: 'x',
      clientId: 'y',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    const b = deriveIdempotencyKey({
      operationType: 'x',
      clientId: 'y',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    expect(a).toBe(b)
  })
})

// ─── Sensitivity per axis ───────────────────────────────────────────

describe('deriveIdempotencyKey · sensitivity', () => {
  const base = {
    operationType: 'campaign.create_brief',
    clientId: 'client-abc',
    logicalPeriod: ISO_WEEK_23,
  }
  const baseKey = deriveIdempotencyKey(base)

  it('changes when operationType changes', () => {
    expect(
      deriveIdempotencyKey({ ...base, operationType: 'campaign.publish' }),
    ).not.toBe(baseKey)
  })

  it('changes when clientId changes', () => {
    expect(
      deriveIdempotencyKey({ ...base, clientId: 'client-xyz' }),
    ).not.toBe(baseKey)
  })

  it('changes when logicalPeriod.value changes (same kind)', () => {
    expect(
      deriveIdempotencyKey({ ...base, logicalPeriod: ISO_WEEK_24 }),
    ).not.toBe(baseKey)
  })

  it('changes when logicalPeriod.kind changes (same value)', () => {
    // iso_week "2026-W23" vs custom "2026-W23" · MUST differ to avoid
    // accidental collapse of semantically different periods.
    const customSameValue: LogicalPeriod = {
      kind: 'custom',
      value: '2026-W23',
      note: 'escape hatch',
    }
    expect(
      deriveIdempotencyKey({ ...base, logicalPeriod: customSameValue }),
    ).not.toBe(baseKey)
  })
})

// ─── Each canonical kind produces a distinct key for same value ─────

describe('deriveIdempotencyKey · kind-discrimination', () => {
  const sameValue = '2026-W23'
  const variants: LogicalPeriod[] = [
    { kind: 'iso_week', value: sameValue },
    { kind: 'iso_month', value: sameValue },
    { kind: 'iso_date', value: sameValue },
    { kind: 'campaign_id', value: sameValue },
    { kind: 'trigger_ulid', value: sameValue },
    { kind: 'custom', value: sameValue, note: 'n/a' },
  ]

  it('produces 6 distinct keys for 6 different kinds + same value', () => {
    const base = {
      operationType: 'op',
      clientId: 'client',
    }
    const keys = variants.map((logicalPeriod) =>
      deriveIdempotencyKey({ ...base, logicalPeriod }),
    )
    const uniq = new Set(keys)
    expect(uniq.size).toBe(variants.length)
  })
})

// ─── Q2 bug protection · daemon-burst class ─────────────────────────

describe('deriveIdempotencyKey · Q2 bug protection (load-bearing)', () => {
  it('per-poll execution_id variation does NOT change key (business identity collapses)', () => {
    // Simulate the 24-may daemon scenario · two polls of the same
    // logical work emit different technical execution_ids. The
    // deriver receives ONLY business identity · no execution_id is
    // in the input shape. So the derived key is identical regardless
    // of how many distinct technical ids the daemon would have
    // emitted.
    const businessIdentity = {
      operationType: 'cron.weekly_report',
      clientId: 'client-naufrago',
      logicalPeriod: ISO_WEEK_23,
    }
    const key1 = deriveIdempotencyKey(businessIdentity)
    const key2 = deriveIdempotencyKey(businessIdentity)
    const key3 = deriveIdempotencyKey(businessIdentity)
    expect(key1).toBe(key2)
    expect(key2).toBe(key3)
  })

  it('100 polls of the same logical operation produce 1 unique key', () => {
    const businessIdentity = {
      operationType: 'cron.weekly_report',
      clientId: 'client-naufrago',
      logicalPeriod: ISO_WEEK_23,
    }
    const keys = Array.from({ length: 100 }, () =>
      deriveIdempotencyKey(businessIdentity),
    )
    expect(new Set(keys).size).toBe(1)
  })

  it('100 polls across 100 different clients produce 100 unique keys (per-tenant isolation)', () => {
    const keys = Array.from({ length: 100 }, (_, i) =>
      deriveIdempotencyKey({
        operationType: 'cron.weekly_report',
        clientId: `client-${i}`,
        logicalPeriod: ISO_WEEK_23,
      }),
    )
    expect(new Set(keys).size).toBe(100)
  })
})

// ─── custom.note is metadata · NOT in the key ──────────────────────

describe('deriveIdempotencyKey · custom.note is metadata only', () => {
  it('two custom periods with same value but different notes → same key', () => {
    // The custom variant carries a `note` for reviewer audit, but the
    // note MUST NOT alter identity (otherwise reviewers editing notes
    // would silently break dedup).
    const a = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'client',
      logicalPeriod: CUSTOM_NOTE_FOO,
    })
    const b = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'client',
      logicalPeriod: CUSTOM_NOTE_BAR,
    })
    expect(a).toBe(b)
  })

  it('custom with same value as iso_week still differs (kind discriminates)', () => {
    const customKey = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'client',
      logicalPeriod: CUSTOM_NOTE_FOO,
    })
    const isoKey = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'client',
      logicalPeriod: ISO_WEEK_23, // same value '2026-W23' but kind iso_week
    })
    expect(customKey).not.toBe(isoKey)
  })
})

// ─── Canonical separator · no shift-and-collide ────────────────────

describe('deriveIdempotencyKey · canonical separator integrity', () => {
  it('shift between operationType and clientId does NOT collide', () => {
    // Two inputs that, if naively concatenated without delimiters,
    // would coincide:
    //   {operationType: "ab", clientId: "c"} → "abc"
    //   {operationType: "a",  clientId: "bc"} → "abc"
    // The pipe separator must distinguish them.
    const a = deriveIdempotencyKey({
      operationType: 'ab',
      clientId: 'c',
      logicalPeriod: ISO_WEEK_23,
    })
    const b = deriveIdempotencyKey({
      operationType: 'a',
      clientId: 'bc',
      logicalPeriod: ISO_WEEK_23,
    })
    expect(a).not.toBe(b)
  })

  it('shift between clientId and logicalPeriod.value does NOT collide', () => {
    // The kind:value serialization adds a colon delimiter inside the
    // period segment, which gives another guard. Verify with a
    // pathological boundary case.
    const a = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'x',
      logicalPeriod: { kind: 'iso_week', value: 'yz' },
    })
    const b = deriveIdempotencyKey({
      operationType: 'op',
      clientId: 'xy',
      logicalPeriod: { kind: 'iso_week', value: 'z' },
    })
    expect(a).not.toBe(b)
  })
})

// ─── Edge cases ─────────────────────────────────────────────────────

describe('deriveIdempotencyKey · edge cases', () => {
  it('empty value (caller responsibility) · still deterministic', () => {
    // Empty values are not forbidden at the contract level · the
    // orchestration layer is responsible for picking meaningful
    // business identity. The deriver just hashes whatever it gets.
    const a = deriveIdempotencyKey({
      operationType: 'x',
      clientId: 'y',
      logicalPeriod: { kind: 'iso_week', value: '' },
    })
    const b = deriveIdempotencyKey({
      operationType: 'x',
      clientId: 'y',
      logicalPeriod: { kind: 'iso_week', value: '' },
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('exercises all 6 canonical kinds (each returns a valid hash)', () => {
    const variants: LogicalPeriod[] = [
      ISO_WEEK_23,
      ISO_MONTH_JUN,
      ISO_DATE_JUN02,
      CAMPAIGN_A,
      TRIGGER_ULID_A,
      { kind: 'custom', value: 'one-off', note: 'reviewed by Lenovo 2026-06-02' },
    ]
    for (const period of variants) {
      const key = deriveIdempotencyKey({
        operationType: 'op',
        clientId: 'client',
        logicalPeriod: period,
      })
      expect(key).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

// ─── serializeLogicalPeriod (exported for tests) ───────────────────

describe('serializeLogicalPeriod', () => {
  it('formats each canonical kind as "kind:value"', () => {
    expect(serializeLogicalPeriod(ISO_WEEK_23)).toBe('iso_week:2026-W23')
    expect(serializeLogicalPeriod(ISO_MONTH_JUN)).toBe('iso_month:2026-06')
    expect(serializeLogicalPeriod(ISO_DATE_JUN02)).toBe('iso_date:2026-06-02')
    expect(serializeLogicalPeriod(CAMPAIGN_A)).toBe('campaign_id:camp-abc')
    expect(serializeLogicalPeriod(TRIGGER_ULID_A)).toBe('trigger_ulid:01HQXABC123')
  })

  it('drops custom.note from the canonical string', () => {
    expect(serializeLogicalPeriod(CUSTOM_NOTE_FOO)).toBe('custom:2026-W23')
    expect(serializeLogicalPeriod(CUSTOM_NOTE_BAR)).toBe('custom:2026-W23')
  })
})

// ─── Singleton conformance ──────────────────────────────────────────

describe('canonicalIdempotencyKeyDeriver', () => {
  it('satisfies the IdempotencyKeyDeriver interface', () => {
    expect(typeof canonicalIdempotencyKeyDeriver.derive).toBe('function')
  })

  it('produces identical output to the bare derive function', () => {
    const parts = {
      operationType: 'review.post_qbr',
      clientId: 'client-naufrago',
      logicalPeriod: ISO_MONTH_JUN,
    }
    expect(canonicalIdempotencyKeyDeriver.derive(parts)).toBe(
      deriveIdempotencyKey(parts),
    )
  })
})
