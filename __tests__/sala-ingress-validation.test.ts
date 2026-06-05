/**
 * Tests · sala-ingress validation · envelope shape · pure function coverage.
 */
import { describe, it, expect } from 'vitest'
import { parseIngressEnvelope } from '@/lib/sala-ingress'

function valid(overrides: Record<string, unknown> = {}) {
  return {
    source: 'ventas/deal-won',
    intent: 'onboard',
    payload: { client_name: 'Naufrago' },
    idempotency_key: 'deal-12345',
    logical_period: '2026-W23',
    tenant_id: 'naufrago',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    ...overrides,
  }
}

describe('parseIngressEnvelope · happy path', () => {
  it('accepts minimal valid envelope', () => {
    const r = parseIngressEnvelope(valid())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.source).toBe('ventas/deal-won')
      expect(r.value.intent).toBe('onboard')
      expect(r.value.payload).toEqual({ client_name: 'Naufrago' })
    }
  })

  it('accepts optional correlation_id when present', () => {
    const r = parseIngressEnvelope(valid({ correlation_id: 'corr-1' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.correlation_id).toBe('corr-1')
  })

  it('accepts optional stream_id when present', () => {
    const r = parseIngressEnvelope(valid({ stream_id: 'sala/v1/x' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.stream_id).toBe('sala/v1/x')
  })

  it('omits optional fields when absent', () => {
    const r = parseIngressEnvelope(valid())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.correlation_id).toBeUndefined()
      expect(r.value.stream_id).toBeUndefined()
    }
  })
})

describe('parseIngressEnvelope · rejects malformed top-level', () => {
  it('rejects non-object body', () => {
    expect(parseIngressEnvelope(null).ok).toBe(false)
    expect(parseIngressEnvelope('foo').ok).toBe(false)
    expect(parseIngressEnvelope(42).ok).toBe(false)
    expect(parseIngressEnvelope([]).ok).toBe(false)
    expect(parseIngressEnvelope(undefined).ok).toBe(false)
  })
})

describe('parseIngressEnvelope · field-level checks', () => {
  it('rejects missing source', () => {
    const v = valid()
    delete (v as Record<string, unknown>).source
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects source with invalid characters', () => {
    expect(parseIngressEnvelope(valid({ source: 'Ventas Deal Won' })).ok).toBe(false)
    expect(parseIngressEnvelope(valid({ source: '/leading-slash' })).ok).toBe(false)
    expect(parseIngressEnvelope(valid({ source: 'trailing-slash/' })).ok).toBe(false)
  })

  it('accepts hierarchical source with single slash', () => {
    expect(parseIngressEnvelope(valid({ source: 'marketing/campaign-brief' })).ok).toBe(true)
  })

  it('accepts deep hierarchical source with multiple slashes', () => {
    expect(parseIngressEnvelope(valid({ source: 'depto/sub/leaf' })).ok).toBe(true)
  })

  it('rejects empty source', () => {
    expect(parseIngressEnvelope(valid({ source: '' })).ok).toBe(false)
  })

  it('rejects missing intent', () => {
    const v = valid()
    delete (v as Record<string, unknown>).intent
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects intent with slash (intent is FLAT)', () => {
    expect(parseIngressEnvelope(valid({ intent: 'on/board' })).ok).toBe(false)
  })

  it('rejects intent with whitespace', () => {
    expect(parseIngressEnvelope(valid({ intent: 'on board' })).ok).toBe(false)
  })

  it('rejects array payload', () => {
    expect(parseIngressEnvelope(valid({ payload: [1, 2, 3] })).ok).toBe(false)
  })

  it('rejects scalar payload', () => {
    expect(parseIngressEnvelope(valid({ payload: 'string' })).ok).toBe(false)
    expect(parseIngressEnvelope(valid({ payload: 42 })).ok).toBe(false)
  })

  it('accepts empty payload object', () => {
    expect(parseIngressEnvelope(valid({ payload: {} })).ok).toBe(true)
  })

  it('rejects missing idempotency_key', () => {
    const v = valid()
    delete (v as Record<string, unknown>).idempotency_key
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects empty idempotency_key', () => {
    expect(parseIngressEnvelope(valid({ idempotency_key: '' })).ok).toBe(false)
  })

  it('rejects missing tenant_id', () => {
    const v = valid()
    delete (v as Record<string, unknown>).tenant_id
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects missing client_id', () => {
    const v = valid()
    delete (v as Record<string, unknown>).client_id
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects missing logical_period', () => {
    const v = valid()
    delete (v as Record<string, unknown>).logical_period
    expect(parseIngressEnvelope(v).ok).toBe(false)
  })

  it('rejects non-string correlation_id when present', () => {
    expect(parseIngressEnvelope(valid({ correlation_id: 42 })).ok).toBe(false)
    expect(parseIngressEnvelope(valid({ correlation_id: '' })).ok).toBe(false)
  })

  it('rejects non-string stream_id when present', () => {
    expect(parseIngressEnvelope(valid({ stream_id: 42 })).ok).toBe(false)
    expect(parseIngressEnvelope(valid({ stream_id: '' })).ok).toBe(false)
  })
})
