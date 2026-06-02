/**
 * Tests · Capa 1 provenance tag · ADR-012 §4.1
 *
 * Spec · ADR-012 §4.1 spotlighting · structural isolation
 *
 * Canon canonical · NO redefine canon canonical · CONSUMED shape from ADR-009
 * esqueleto (this lib provides canon canonical-bridge canon canonical until
 * ADR-009 esqueleto landed).
 */
import { describe, it, expect } from 'vitest'
import { provenanceTagGate } from '../src/lib/ingress-filter/gates/provenance-tag'

describe('provenanceTagGate · Capa 1 canon canonical', () => {
  it('canon canonical · always returns pass verdict (structural · no block)', () => {
    const { decision } = provenanceTagGate('hello', {
      source: 'tally_form',
      ingress_route: '/api/forms/submit',
    })
    expect(decision.verdict).toBe('pass')
    expect(decision.severity).toBe('LOW')
    expect(decision.gate).toBe('provenance_tag')
  })

  it('canon canonical · tag shape includes all ADR-009 required fields', () => {
    const { tag } = provenanceTagGate('hello', {
      source: 'apify_scrape',
      ingress_route: 'n8n-workflow-42',
    })
    expect(tag).toHaveProperty('source', 'apify_scrape')
    expect(tag).toHaveProperty('ingress_id')
    expect(tag).toHaveProperty('session_id')
    expect(tag).toHaveProperty('trust_level', 'untrusted')
    expect(tag).toHaveProperty('received_at')
    expect(tag).toHaveProperty('ingress_route', 'n8n-workflow-42')
  })

  it('canon canonical · ingress_id is UUID v4', () => {
    const { tag } = provenanceTagGate('x', {
      source: 'tally_form',
      ingress_route: '/r',
    })
    expect(tag.ingress_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('canon canonical · session_id is 16-char hex', () => {
    const { tag } = provenanceTagGate('x', {
      source: 'tally_form',
      ingress_route: '/r',
    })
    expect(tag.session_id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('canon canonical · session_id unique per call (cryptographic randomness)', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const { tag } = provenanceTagGate('x', {
        source: 'apify_scrape',
        ingress_route: '/r',
      })
      ids.add(tag.session_id)
    }
    expect(ids.size).toBe(100)
  })

  it('canon canonical · received_at is valid ISO 8601', () => {
    const { tag } = provenanceTagGate('x', {
      source: 'tally_form',
      ingress_route: '/r',
    })
    expect(() => new Date(tag.received_at).toISOString()).not.toThrow()
    expect(new Date(tag.received_at).toISOString()).toBe(tag.received_at)
  })

  it('canon canonical · taggedPayload wraps content with structural markers', () => {
    const { taggedPayload, tag } = provenanceTagGate('SECRET-CONTENT', {
      source: 'whatsapp_inbound',
      ingress_route: '/api/wa',
    })
    expect(taggedPayload).toContain('<external-data')
    expect(taggedPayload).toContain('source="whatsapp_inbound"')
    expect(taggedPayload).toContain(`session="${tag.session_id}"`)
    expect(taggedPayload).toContain('trust="untrusted"')
    expect(taggedPayload).toContain('SECRET-CONTENT')
    expect(taggedPayload).toMatch(/<\/external-data>$/)
  })

  it('canon canonical · respects caller-supplied ingress_id + session_id', () => {
    const { tag, taggedPayload } = provenanceTagGate('hello', {
      source: 'tally_form',
      ingress_route: '/r',
      ingress_id: '11111111-1111-4111-8111-111111111111',
      session_id: 'cafe1234cafe5678',
    })
    expect(tag.ingress_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(tag.session_id).toBe('cafe1234cafe5678')
    expect(taggedPayload).toContain('session="cafe1234cafe5678"')
  })

  it('canon canonical · respects custom trust_level', () => {
    const { tag } = provenanceTagGate('hello', {
      source: 'tally_form',
      ingress_route: '/r',
      trust_level: 'tenant_trusted',
    })
    expect(tag.trust_level).toBe('tenant_trusted')
  })
})
