/**
 * Tests · /api/agents/run-sdk · discovery_output response surface
 * (CC#3↔CC#4 convergence canon · SPEC lazo agentico 2026-06-06).
 *
 * Validates the canonical interface CC#4's worker depends on ·
 *
 *   response.body.discovery_output · DiscoveryOutput | absent
 *
 * Present canonical when · agent is onboarding-specialist + flag ON +
 * resolved.kind='ok' + persist completed without throwing. Absent
 * canonical when · agent isn't a discovery agent · flag OFF ·
 * resolved.kind='absent' or 'malformed'.
 *
 * Strategy · this is a CONTRACT/SHAPE test · the route logic is exercised
 * via the resolveDiscoverySource helper directly + a fixture matching the
 * route's branch. Validates · `value` from resolved equals the discovery
 * shape · the keys CC#4 reads in n8n template expressions exist + have
 * the expected canonical names.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveDiscoverySource,
  type DiscoveredIcpSegment,
  type DiscoveryOutput,
} from '@/lib/discovery-output'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const CANONICAL: DiscoveryOutput = {
  client_id: NAUFRAGO,
  own_handles: {
    instagram: '@naufrago_ec',
    facebook: 'naufragoec',
    tiktok: '@naufrago',
    linkedin: 'naufrago-ec',
    youtube: 'NaufragoEC',
  },
  competitors: [
    {
      name: 'La Pinta Quito',
      website: 'https://lapintaquito.com',
      handles: {
        instagram: '@lapintaquito',
        facebook: 'lapintaquito',
      },
      why: 'Direct local rival · stronger brand recognition · premium price tier',
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
    goals: ['Quick quality meal'],
    decision_criteria: ['Speed', 'Authenticity', 'Price-quality ratio'],
    preferred_channels: ['Instagram', 'TikTok'],
  },
  competitive_landscape_summary:
    'Quito ghost-kitchen F&B is fragmented · 3-5 strong direct competitors · differentiation via speed + authentic regional flavors',
}

describe('CC#3↔CC#4 contract · response.body.discovery_output shape', () => {
  it('canonical 5 top-level keys present + named exactly per spec', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      const value = r.value
      // Canonical keys CC#4 reads
      expect(Object.keys(value).sort()).toEqual(
        ['client_id', 'competitive_landscape_summary', 'competitors', 'icp', 'own_handles'].sort(),
      )
    }
  })

  it('own_handles · 5 canonical social platforms · YouTube canonical incl', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    if (r.kind === 'ok') {
      expect(r.value.own_handles.instagram).toBe('@naufrago_ec')
      expect(r.value.own_handles.facebook).toBe('naufragoec')
      expect(r.value.own_handles.tiktok).toBe('@naufrago')
      expect(r.value.own_handles.linkedin).toBe('naufrago-ec')
      expect(r.value.own_handles.youtube).toBe('NaufragoEC')
    }
  })

  it('competitors[] · each entry has canonical fields CC#4 reads for Apify', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    if (r.kind === 'ok') {
      const c = r.value.competitors[0]
      expect(c.name).toBe('La Pinta Quito')
      expect(c.website).toBe('https://lapintaquito.com')
      expect(c.handles?.instagram).toBe('@lapintaquito')
      expect(c.competitor_type).toBe('direct')
      expect(typeof c.why).toBe('string')
      expect(typeof c.positioning).toBe('string')
    }
  })

  it('icp · canonical fields surfaced (single segment)', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      const rawIcp = r.value.icp
      if (!rawIcp || Array.isArray(rawIcp)) {
        throw new Error('icp expected single object · got array or undefined')
      }
      const icp = rawIcp as DiscoveredIcpSegment
      expect(icp.audience_segment).toBe('Young professionals · F&B explorers')
      expect(icp.segment_priority).toBe(1)
      expect(icp.pain_points?.length).toBe(2)
      expect(icp.preferred_channels?.length).toBe(2)
    }
  })

  it('client_id round-trips verbatim · CC#4 verifies via _journey_id in metadata', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    if (r.kind === 'ok') expect(r.value.client_id).toBe(NAUFRAGO)
  })

  it('competitive_landscape_summary surface · single string · NOT split', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    if (r.kind === 'ok') {
      expect(typeof r.value.competitive_landscape_summary).toBe('string')
      expect(r.value.competitive_landscape_summary).toMatch(/Quito/)
    }
  })

  it('canonical · resolved value DEEP-equals tool_call input (no field drop)', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL as unknown as Record<string, unknown>, emission_count: 1 },
      expected_client_id: NAUFRAGO,
    })
    if (r.kind === 'ok') {
      expect(r.value).toEqual(CANONICAL)
    }
  })
})

describe('CC#3↔CC#4 contract · absent paths · worker must handle', () => {
  it('agent emits prose only · NO discovery_output in response (CC#4 branches accordingly)', () => {
    const r = resolveDiscoverySource({
      agent_response_text: 'Just prose. No JSON. No tool.',
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('absent')
    if (r.kind === 'absent') {
      expect(r.source).toBe('none')
      // No `value` property exists on absent · worker checks
      // `typeof response.body.discovery_output === 'undefined'`.
    }
  })

  it('malformed tool_call · still surfaces as malformed source=tool_call', () => {
    const r = resolveDiscoverySource({
      tool_call: {
        input: { client_id: 'not-uuid', own_handles: {}, competitors: [] },
        emission_count: 1,
      },
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') {
      expect(r.source).toBe('tool_call')
      // canon · malformed does NOT silently fall through · worker sees
      // discovery_output absent + discovery_persist.parse_kind='malformed'
    }
  })
})
