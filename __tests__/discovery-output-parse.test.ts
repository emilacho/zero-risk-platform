/**
 * Tests · Discovery output parser (SPEC lazo agentico 2026-06-05).
 *
 * Covers · fenced JSON extraction · brace-balanced trailing object ·
 * shape validation (client_id UUID + own_handles object + competitors[]) ·
 * ICP single + array · summary string · malformed rejection per field.
 */
import { describe, it, expect } from 'vitest'
import {
  extractJsonCandidates,
  parseDiscoveryOutput,
  validateDiscoveryShape,
} from '@/lib/discovery-output'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const CANONICAL_DISCOVERY = {
  client_id: NAUFRAGO,
  own_handles: {
    instagram: '@naufrago_ec',
    facebook: 'naufragoec',
    tiktok: '@naufrago',
  },
  competitors: [
    {
      name: 'La Pinta Quito',
      website: 'https://lapintaquito.com',
      handles: { instagram: '@lapintaquito' },
      why: 'Same target audience · higher tier prices',
      competitor_type: 'direct',
      positioning: 'Premium seafood ceviche destination',
    },
    {
      name: 'Mercado Carcelén',
      handles: { instagram: '@mercado_carcelen' },
      competitor_type: 'indirect',
    },
  ],
  icp: {
    audience_segment: 'Young professionals · F&B explorers',
    segment_priority: 1,
    pain_points: ['Limited late-night options', 'Slow delivery'],
    goals: ['Quick quality meal during lunch'],
    decision_criteria: ['Speed', 'Authenticity'],
  },
  competitive_landscape_summary:
    'Quito ghost-kitchen F&B is fragmented · 3-5 strong direct competitors plus indirect markets.',
}

describe('extractJsonCandidates', () => {
  it('extracts a ```json fenced block', () => {
    const text = 'Here is my discovery:\n```json\n{"a": 1}\n```\nDone.'
    expect(extractJsonCandidates(text)).toEqual(['{"a": 1}'])
  })

  it('extracts a ``` fenced block without json tag', () => {
    const text = '```\n{"x":2}\n```'
    expect(extractJsonCandidates(text)).toEqual(['{"x":2}'])
  })

  it('extracts trailing brace-balanced object when no fence', () => {
    const text = 'Some prose here.\nfinal · {"client_id": "abc", "nested": {"k": "v"}}'
    expect(extractJsonCandidates(text)[0]).toContain('"client_id": "abc"')
  })

  it('returns empty array for prose with no JSON', () => {
    expect(extractJsonCandidates('just plain text here')).toEqual([])
  })

  it('extracts the LAST balanced object when multiple exist', () => {
    const text = '{"first":1} ... and later: {"last":2}'
    expect(extractJsonCandidates(text)[0]).toBe('{"last":2}')
  })
})

describe('validateDiscoveryShape · happy path', () => {
  it('accepts the canonical Náufrago discovery output', () => {
    const r = validateDiscoveryShape(CANONICAL_DISCOVERY, NAUFRAGO)
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.value.client_id).toBe(NAUFRAGO)
      expect(r.value.competitors.length).toBe(2)
      expect(r.value.competitors[0].name).toBe('La Pinta Quito')
      expect(Array.isArray(r.value.icp) ? false : true).toBe(true)
    }
  })

  it('accepts empty competitors array (logged elsewhere · still valid)', () => {
    const r = validateDiscoveryShape({
      ...CANONICAL_DISCOVERY,
      competitors: [],
    })
    expect(r.kind).toBe('ok')
  })

  it('accepts ICP as array of segments', () => {
    const r = validateDiscoveryShape({
      ...CANONICAL_DISCOVERY,
      icp: [
        { audience_segment: 'Primary' },
        { audience_segment: 'Secondary' },
      ],
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok' && Array.isArray(r.value.icp)) {
      expect(r.value.icp.length).toBe(2)
    }
  })

  it('accepts discovery without ICP (optional)', () => {
    const { icp: _icp, ...withoutIcp } = CANONICAL_DISCOVERY
    expect(validateDiscoveryShape(withoutIcp).kind).toBe('ok')
  })
})

describe('validateDiscoveryShape · rejections', () => {
  it('rejects non-object root', () => {
    expect(validateDiscoveryShape(null).kind).toBe('malformed')
    expect(validateDiscoveryShape([]).kind).toBe('malformed')
    expect(validateDiscoveryShape('string').kind).toBe('malformed')
  })

  it('rejects missing client_id', () => {
    const { client_id: _id, ...noId } = CANONICAL_DISCOVERY
    const r = validateDiscoveryShape(noId)
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.reason).toMatch(/client_id/)
  })

  it('rejects non-UUID client_id', () => {
    const r = validateDiscoveryShape({ ...CANONICAL_DISCOVERY, client_id: 'naufrago' })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.reason).toMatch(/client_id_invalid_uuid/)
  })

  it('rejects client_id mismatch with expected', () => {
    const r = validateDiscoveryShape(CANONICAL_DISCOVERY, '11111111-1111-1111-1111-111111111111')
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.reason).toMatch(/client_id_mismatch/)
  })

  it('rejects non-array competitors', () => {
    const r = validateDiscoveryShape({ ...CANONICAL_DISCOVERY, competitors: 'not array' })
    expect(r.kind).toBe('malformed')
  })

  it('rejects competitor without name', () => {
    const r = validateDiscoveryShape({
      ...CANONICAL_DISCOVERY,
      competitors: [{ website: 'https://x.com' }],
    })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.reason).toMatch(/competitor_0_name_missing/)
  })

  it('rejects ICP without audience_segment', () => {
    const r = validateDiscoveryShape({
      ...CANONICAL_DISCOVERY,
      icp: { pain_points: ['x'] },
    })
    expect(r.kind).toBe('malformed')
  })

  it('rejects own_handles as array', () => {
    const r = validateDiscoveryShape({ ...CANONICAL_DISCOVERY, own_handles: [] })
    expect(r.kind).toBe('malformed')
  })

  it('rejects competitive_landscape_summary non-string', () => {
    const r = validateDiscoveryShape({
      ...CANONICAL_DISCOVERY,
      competitive_landscape_summary: { not: 'string' },
    })
    expect(r.kind).toBe('malformed')
  })
})

describe('parseDiscoveryOutput · end-to-end', () => {
  it('parses a fenced JSON block in prose', () => {
    const text =
      'Here is the discovery for the client:\n\n```json\n' +
      JSON.stringify(CANONICAL_DISCOVERY) +
      '\n```\n\nThanks!'
    const r = parseDiscoveryOutput(text, { expected_client_id: NAUFRAGO })
    expect(r.kind).toBe('ok')
  })

  it('parses a trailing brace-balanced JSON object', () => {
    const text =
      'Discovery report\n\nfinal output:\n' + JSON.stringify(CANONICAL_DISCOVERY)
    const r = parseDiscoveryOutput(text, { expected_client_id: NAUFRAGO })
    expect(r.kind).toBe('ok')
  })

  it('returns absent for empty response', () => {
    const r = parseDiscoveryOutput('')
    expect(r.kind).toBe('absent')
  })

  it('returns absent for prose-only response', () => {
    const r = parseDiscoveryOutput('Some thoughts about the client. No JSON here.')
    expect(r.kind).toBe('absent')
  })

  it('returns malformed when JSON parse fails inside fence', () => {
    const text = '```json\n{not valid json}\n```'
    const r = parseDiscoveryOutput(text)
    expect(r.kind).toBe('malformed')
  })

  it('returns malformed when JSON shape fails validation', () => {
    const text = '```json\n{"client_id": "not-uuid", "own_handles": {}, "competitors": []}\n```'
    const r = parseDiscoveryOutput(text)
    expect(r.kind).toBe('malformed')
  })
})
