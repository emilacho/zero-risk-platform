/**
 * Tests · sala-ingress stream_id minting · §149 nace en la entrada.
 *
 * Phase 1.1 (2026-06-05 first-fire gap #3 fix) · mintStreamId now returns
 * a deterministic UUID v5 derived from the envelope (was sala/v1/...
 * text path). The sala_event_log.stream_id column is UUID-typed · the
 * old text format was rejected at INSERT. Determinism + heuristic
 * recognition properties preserved via UUID v5.
 */
import { describe, it, expect } from 'vitest'
import {
  SALA_INGRESS_NAMESPACE_UUID,
  mintCorrelationId,
  mintStreamId,
  uuidV5,
  type MintStreamIdInput,
} from '@/lib/sala-ingress'
import { isWorkflowIdASalaStream } from '@/lib/sala-journey-dispatch'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const BASE: MintStreamIdInput = {
  source: 'ventas/deal-won',
  intent: 'onboard',
  idempotency_key: 'deal-12345',
  logical_period: '2026-W23',
  tenant_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
  client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
}

describe('mintStreamId · canonical UUID v5 shape', () => {
  it('returns a canonical UUID', () => {
    expect(UUID_RE.test(mintStreamId(BASE))).toBe(true)
  })

  it('returns a UUID v5 (version + variant bits set)', () => {
    expect(UUID_V5_RE.test(mintStreamId(BASE))).toBe(true)
  })

  it('is deterministic for the same inputs', () => {
    expect(mintStreamId(BASE)).toBe(mintStreamId(BASE))
  })

  it('differs when idempotency_key differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, idempotency_key: 'other' }),
    )
  })

  it('differs when source differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, source: 'marketing/brief' }),
    )
  })

  it('differs when intent differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, intent: 'campaign' }),
    )
  })

  it('differs when tenant_id differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, tenant_id: '11111111-1111-1111-1111-111111111111' }),
    )
  })

  it('differs when client_id differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, client_id: '11111111-1111-1111-1111-111111111111' }),
    )
  })

  it('differs when logical_period differs', () => {
    expect(mintStreamId(BASE)).not.toBe(
      mintStreamId({ ...BASE, logical_period: '2026-W24' }),
    )
  })

  it('is recognized by sala-journey-dispatch projection (UUID heuristic)', () => {
    const s = mintStreamId(BASE)
    expect(isWorkflowIdASalaStream(s)).toBe(true)
  })
})

describe('uuidV5 · primitive', () => {
  it('produces canonical UUIDs from arbitrary names', () => {
    const id = uuidV5(SALA_INGRESS_NAMESPACE_UUID, 'any.string.value')
    expect(UUID_V5_RE.test(id)).toBe(true)
  })

  it('matches the RFC 4122 well-known v5 vector for DNS namespace + python.org', () => {
    // RFC 4122 Appendix B canonical vector ·
    //   uuid5(DNS, 'python.org') = 886313e1-3b8a-5372-9b90-0c9aee199e5d
    expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'python.org')).toBe(
      '886313e1-3b8a-5372-9b90-0c9aee199e5d',
    )
  })

  it('rejects an invalid namespace UUID', () => {
    expect(() => uuidV5('not-a-uuid', 'name')).toThrowError(/invalid UUID/i)
  })
})

describe('mintCorrelationId', () => {
  it('returns a UUID', () => {
    const id = mintCorrelationId()
    expect(UUID_RE.test(id)).toBe(true)
  })

  it('returns a distinct value per call', () => {
    expect(mintCorrelationId()).not.toBe(mintCorrelationId())
  })
})
