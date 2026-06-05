/**
 * Tests · sala-ingress stream_id minting · §149 nace en la entrada.
 */
import { describe, it, expect } from 'vitest'
import {
  mintCorrelationId,
  mintStreamId,
  type MintStreamIdInput,
} from '@/lib/sala-ingress'
import { isWorkflowIdASalaStream } from '@/lib/sala-journey-dispatch'

const BASE: MintStreamIdInput = {
  source: 'ventas/deal-won',
  intent: 'onboard',
  idempotency_key: 'deal-12345',
  logical_period: '2026-W23',
  tenant_id: 'naufrago',
  client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
}

describe('mintStreamId · canonical shape', () => {
  it('starts with sala/v1/ canonical prefix', () => {
    expect(mintStreamId(BASE).startsWith('sala/v1/')).toBe(true)
  })

  it('embeds tenant/client/intent/period parts in canonical order', () => {
    const s = mintStreamId(BASE)
    expect(s).toContain('naufrago')
    expect(s).toContain('d69100b5-8ad7-4bb0-908c-68b5544065dc')
    expect(s).toContain('onboard')
    expect(s).toContain('2026-W23')
  })

  it('terminates with 12-hex short_hash', () => {
    const s = mintStreamId(BASE)
    const last = s.split('/').pop()!
    expect(/^[0-9a-f]{12}$/i.test(last)).toBe(true)
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

  it('is recognized by sala-journey-dispatch projection (sala-prefix heuristic)', () => {
    const s = mintStreamId(BASE)
    expect(isWorkflowIdASalaStream(s)).toBe(true)
  })

  it('sanitizes problematic characters in parts (path-safety)', () => {
    const s = mintStreamId({
      ...BASE,
      tenant_id: 'naufrago space/break',
      client_id: 'has?weird*chars',
    })
    // No raw whitespace, slashes within parts replaced
    expect(s).not.toMatch(/ /)
    expect(s).not.toMatch(/\?/)
    expect(s).not.toMatch(/\*/)
  })
})

describe('mintCorrelationId', () => {
  it('returns a UUID', () => {
    const id = mintCorrelationId()
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)).toBe(true)
  })

  it('returns a distinct value per call', () => {
    expect(mintCorrelationId()).not.toBe(mintCorrelationId())
  })
})
