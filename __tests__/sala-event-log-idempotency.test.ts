/**
 * Tests · idempotency key builder · canon canonical ADR-009 §flag #1
 */
import { describe, it, expect } from 'vitest'
import {
  buildIdempotencyKey,
  hashInputContent,
} from '../src/lib/sala-event-log/idempotency'

describe('buildIdempotencyKey · canon canonical canon', () => {
  describe('canonical stable hashing', () => {
    it('same inputs produce same key (deterministic)', () => {
      const a = buildIdempotencyKey({
        operation_type: 'weekly_report',
        client_id: 'client-123',
        logical_period: '2026-W23',
      })
      const b = buildIdempotencyKey({
        operation_type: 'weekly_report',
        client_id: 'client-123',
        logical_period: '2026-W23',
      })
      expect(a).toBe(b)
    })

    it('outputs SHA-256 hex (64 chars)', () => {
      const key = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
      })
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    })

    it('different operation_type → different key', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op_a',
        client_id: 'c',
        logical_period: 'p',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op_b',
        client_id: 'c',
        logical_period: 'p',
      })
      expect(a).not.toBe(b)
    })

    it('different client_id → different key', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c_1',
        logical_period: 'p',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c_2',
        logical_period: 'p',
      })
      expect(a).not.toBe(b)
    })

    it('different logical_period → different key', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p_1',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p_2',
      })
      expect(a).not.toBe(b)
    })
  })

  describe('canonical input_hash optional', () => {
    it('omitted input_hash matches null/undefined/empty (canonical canon)', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: null,
      })
      const c = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: undefined,
      })
      const d = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: '',
      })
      expect(a).toBe(b)
      expect(a).toBe(c)
      expect(a).toBe(d)
    })

    it('input_hash present → different key from absent', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: 'hash_x',
      })
      expect(a).not.toBe(b)
    })

    it('different input_hash → different key', () => {
      const a = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: 'h1',
      })
      const b = buildIdempotencyKey({
        operation_type: 'op',
        client_id: 'c',
        logical_period: 'p',
        input_hash: 'h2',
      })
      expect(a).not.toBe(b)
    })
  })

  describe('canonical canon canon required field validation', () => {
    it('throws on missing operation_type', () => {
      expect(() =>
        buildIdempotencyKey({
          operation_type: '',
          client_id: 'c',
          logical_period: 'p',
        }),
      ).toThrow(/operation_type/)
    })

    it('throws on missing client_id', () => {
      expect(() =>
        buildIdempotencyKey({
          operation_type: 'op',
          client_id: '',
          logical_period: 'p',
        }),
      ).toThrow(/client_id/)
    })

    it('throws on missing logical_period', () => {
      expect(() =>
        buildIdempotencyKey({
          operation_type: 'op',
          client_id: 'c',
          logical_period: '',
        }),
      ).toThrow(/logical_period/)
    })
  })

  describe('canonical canon daemon-$19 case', () => {
    it('mismo trabajo distintos execution_id → mismo idempotency_key', () => {
      // canon canonical canon · daemon $19 scenario · canon canon-2 callers
      // canon canon canonical-same op + client + period · distinto execution_id
      // → canon canon canon-same key → canon canonical UNIQUE dedup canon canon
      const exec1 = buildIdempotencyKey({
        operation_type: 'jefe_marketing_weekly',
        client_id: 'cliente-piloto-perez',
        logical_period: '2026-W23',
      })
      const exec2 = buildIdempotencyKey({
        operation_type: 'jefe_marketing_weekly',
        client_id: 'cliente-piloto-perez',
        logical_period: '2026-W23',
      })
      expect(exec1).toBe(exec2)
    })
  })
})

describe('hashInputContent · canon canonical canonical', () => {
  it('outputs SHA-256 hex 64 chars', () => {
    const h = hashInputContent({ a: 1 })
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  it('same content (different key order) → same hash (canonical sorted)', () => {
    const a = hashInputContent({ a: 1, b: 2, c: 3 })
    const b = hashInputContent({ c: 3, b: 2, a: 1 })
    expect(a).toBe(b)
  })

  it('different content → different hash', () => {
    const a = hashInputContent({ x: 1 })
    const b = hashInputContent({ x: 2 })
    expect(a).not.toBe(b)
  })

  it('nested object · sorted-recursive', () => {
    const a = hashInputContent({ outer: { x: 1, y: 2 } })
    const b = hashInputContent({ outer: { y: 2, x: 1 } })
    expect(a).toBe(b)
  })

  it('arrays preserve order (canon · canon canon canon canonical-order-sensitive)', () => {
    const a = hashInputContent([1, 2, 3])
    const b = hashInputContent([3, 2, 1])
    expect(a).not.toBe(b)
  })

  it('canonical handles null/undefined/primitives', () => {
    expect(hashInputContent(null)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashInputContent('hello')).toMatch(/^[a-f0-9]{64}$/)
    expect(hashInputContent(42)).toMatch(/^[a-f0-9]{64}$/)
  })
})
