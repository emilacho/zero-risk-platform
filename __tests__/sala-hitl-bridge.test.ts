/**
 * Tests · sala-hitl-bridge · pure helpers · Sprint 12 Fase 0 escalón 5 prep.
 *
 * Covers the parse + flag helpers in isolation. Endpoint composition
 * tests live in `sala-hitl-resolve-route.test.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  isHitlResolveEnabled,
  parseHitlResolveBody,
} from '@/lib/sala-hitl-bridge'

const T = '11111111-1111-1111-1111-111111111111'
const G = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('sala-hitl-bridge · isHitlResolveEnabled', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · default-OFF when env not set', () => {
    delete process.env.SALA_HITL_RESOLVE_ENABLED
    expect(isHitlResolveEnabled()).toBe(false)
  })

  it('canon · enabled when env === "true"', () => {
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
    expect(isHitlResolveEnabled()).toBe(true)
  })

  it('canon · ANY non-"true" value is treated as disabled', () => {
    process.env.SALA_HITL_RESOLVE_ENABLED = 'yes'
    expect(isHitlResolveEnabled()).toBe(false)
    process.env.SALA_HITL_RESOLVE_ENABLED = '1'
    expect(isHitlResolveEnabled()).toBe(false)
    process.env.SALA_HITL_RESOLVE_ENABLED = 'TRUE'
    expect(isHitlResolveEnabled()).toBe(false)
  })

  it('canon · explicit input.enabled overrides env', () => {
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
    expect(isHitlResolveEnabled({ enabled: false })).toBe(false)
    delete process.env.SALA_HITL_RESOLVE_ENABLED
    expect(isHitlResolveEnabled({ enabled: true })).toBe(true)
  })
})

describe('sala-hitl-bridge · parseHitlResolveBody · validation', () => {
  it('canon · rejects non-object body', () => {
    expect(parseHitlResolveBody(null).ok).toBe(false)
    expect(parseHitlResolveBody('string').ok).toBe(false)
    expect(parseHitlResolveBody(42).ok).toBe(false)
    expect(parseHitlResolveBody(undefined).ok).toBe(false)
  })

  it('canon · rejects unknown source', () => {
    const r = parseHitlResolveBody({ source: 'wat' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/source/)
  })

  it('canon · rejects missing tenant_id', () => {
    const r = parseHitlResolveBody({ source: 'sala', stream_id: 's', gate_event_id: G, outcome: 'approved' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/tenant_id/)
  })

  it('canon · rejects non-UUID tenant_id', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: 'not-a-uuid',
      stream_id: 's',
      gate_event_id: G,
      outcome: 'approved',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/tenant_id/)
  })

  it('canon · rejects non-UUID gate_event_id', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: 's',
      gate_event_id: 'bad',
      outcome: 'approved',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gate_event_id/)
  })

  it('canon · rejects empty stream_id', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: '',
      gate_event_id: G,
      outcome: 'approved',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/stream_id/)
  })
})

describe('sala-hitl-bridge · parseHitlResolveBody · sala source', () => {
  it('canon · accepts minimal sala body · approved', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      outcome: 'approved',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.outcome).toBe('approved')
      expect(r.value.resolved_by).toBe('sala:unknown')
      expect(r.value.payload).toEqual({})
    }
  })

  it('canon · accepts minimal sala body · rejected', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      outcome: 'rejected',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.outcome).toBe('rejected')
  })

  it('canon · rejects invalid outcome', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      outcome: 'maybe',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/outcome/)
  })

  it('canon · carries resolved_by + payload through', () => {
    const r = parseHitlResolveBody({
      source: 'sala',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      outcome: 'approved',
      resolved_by: 'emilio@hotmail.com',
      payload: { vote_count: 3, reason: 'looks good' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.resolved_by).toBe('emilio@hotmail.com')
      expect(r.value.payload).toEqual({ vote_count: 3, reason: 'looks good' })
    }
  })
})

describe('sala-hitl-bridge · parseHitlResolveBody · n8n-mc-inbox source', () => {
  it('canon · maps decision "approved" → outcome approved', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'approved',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.outcome).toBe('approved')
  })

  it('canon · maps decision "rejected" → outcome rejected', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'rejected',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.outcome).toBe('rejected')
  })

  it('canon · maps decision "edited" → outcome approved + carries edit in payload', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'edited',
      edited_content: 'revised brand book paragraph',
      reviewer: 'emilio@hotmail.com',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.outcome).toBe('approved')
      expect(r.value.payload.decision).toBe('edited')
      expect(r.value.payload.edited_content).toBe('revised brand book paragraph')
      expect(r.value.resolved_by).toBe('emilio@hotmail.com')
    }
  })

  it('canon · rejects invalid decision', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'wat',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/decision/)
  })

  it('canon · default reviewer is "mc-inbox:unknown" when missing', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'approved',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.resolved_by).toBe('mc-inbox:unknown')
  })

  it('canon · feedback carried through to payload', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'rejected',
      feedback: 'tone is off',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.payload.feedback).toBe('tone is off')
  })

  it('canon · payload always includes source tag for audit', () => {
    const r = parseHitlResolveBody({
      source: 'n8n-mc-inbox',
      tenant_id: T,
      stream_id: 'stream-1',
      gate_event_id: G,
      decision: 'approved',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.payload.source).toBe('n8n-mc-inbox')
  })
})
