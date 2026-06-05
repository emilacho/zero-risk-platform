/**
 * Tests · Discovery source resolver (SPEC lazo agentico 2026-06-05 follow-up).
 *
 * Validates the canonical preference order · tool_call WINS over parser ·
 * parser is defense-in-depth fallback · prose-only path (LINCHPIN risk
 * Emilio flagged · NOW EXPLICITLY COVERED) maps to absent + zero persist.
 */
import { describe, it, expect } from 'vitest'
import { resolveDiscoverySource } from '@/lib/discovery-output'

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const CANONICAL_DISCOVERY = {
  client_id: NAUFRAGO,
  own_handles: { instagram: '@naufrago_ec' },
  competitors: [
    { name: 'La Pinta Quito', competitor_type: 'direct' as const },
    { name: 'Mercado Carcelén' },
  ],
  icp: { audience_segment: 'Young professionals' },
  competitive_landscape_summary: 'Fragmented Quito ghost-kitchen F&B market.',
}

const TEXT_WITH_FENCE =
  'Discovery report:\n\n```json\n' + JSON.stringify(CANONICAL_DISCOVERY) + '\n```\n\nThanks!'

describe('resolveDiscoverySource · tool_call WINS · canonical', () => {
  it('uses tool_call when present (parser ignored even if text also has JSON)', () => {
    const r = resolveDiscoverySource({
      tool_call: {
        input: { ...CANONICAL_DISCOVERY, own_handles: { instagram: '@from_tool' } },
        emission_count: 1,
      },
      agent_response_text: TEXT_WITH_FENCE,
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.source).toBe('tool_call')
      expect(r.value.own_handles.instagram).toBe('@from_tool') // tool wins
      expect(r.emission_count).toBe(1)
    }
  })

  it('surfaces emission_count from tool_call capture', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL_DISCOVERY, emission_count: 3 },
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.emission_count).toBe(3)
  })

  it('rejects malformed tool_call · does NOT silently fall through to parser', () => {
    // canon · masking a tool-call shape regression behind the prose parser is
    // dangerous · spec says malformed tool_call must surface.
    const r = resolveDiscoverySource({
      tool_call: {
        input: { client_id: 'not-uuid', own_handles: {}, competitors: [] },
        emission_count: 1,
      },
      agent_response_text: TEXT_WITH_FENCE, // valid here · still rejected
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.source).toBe('tool_call')
  })
})

describe('resolveDiscoverySource · text parser FALLBACK', () => {
  it('parses text when no tool_call present', () => {
    const r = resolveDiscoverySource({
      agent_response_text: TEXT_WITH_FENCE,
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.source).toBe('text_parser')
      expect(r.emission_count).toBeNull()
    }
  })

  it('returns absent when neither tool_call nor parseable text', () => {
    const r = resolveDiscoverySource({
      agent_response_text: 'Just prose. No JSON. No fenced blocks.',
    })
    expect(r.kind).toBe('absent')
    if (r.kind === 'absent') {
      expect(r.source).toBe('none')
      expect(r.reason).toMatch(/no_(json|valid)/i)
    }
  })

  it('returns absent when no tool_call and no text at all', () => {
    const r = resolveDiscoverySource({})
    expect(r.kind).toBe('absent')
    if (r.kind === 'absent') expect(r.source).toBe('none')
  })

  it('returns malformed when text has JSON but shape invalid', () => {
    const r = resolveDiscoverySource({
      agent_response_text: '```json\n{"client_id": "not-uuid"}\n```',
    })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') expect(r.source).toBe('text_parser')
  })
})

describe('resolveDiscoverySource · LINCHPIN case · agente emite prosa sin JSON', () => {
  // Emilio's linchpin question · LLMs are stochastic · the prose-only case
  // is the failure mode the parser-only path would silently mask. With the
  // tool call in place this case is recoverable: agent forgot/skipped the
  // tool → parser tries → text has no JSON → 'absent' → zero persist
  // (brain stays empty BUT the source field shows 'none' so dashboards
  // catch it · cap on prose-only regressions). The flow is honest · the
  // failure visible · no silent success.
  it('agent emits only prose · NO tool_call · maps to absent + source=none', () => {
    const prose =
      'Náufrago is a Quito ghost kitchen serving authentic ceviche. ' +
      'I researched the brand and identified key competitors but I will ' +
      'summarize them in plain language without using any JSON format. ' +
      'The main competitors are La Pinta and Mercado Carcelén.'
    const r = resolveDiscoverySource({
      agent_response_text: prose,
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('absent')
    if (r.kind === 'absent') {
      expect(r.source).toBe('none')
      // Forensics surface · explicit reason caller can dashboard
      expect(r.reason.length).toBeGreaterThan(0)
    }
  })

  it('agent emits structured tool_call · linchpin path · OK + source=tool_call', () => {
    // canonical happy path · same prose response but the agent ALSO called
    // emit_discovery_output · the tool_call WINS · brain gets populated.
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL_DISCOVERY, emission_count: 1 },
      agent_response_text:
        'Náufrago research summary in prose · also emitted via emit_discovery_output tool.',
      expected_client_id: NAUFRAGO,
    })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.source).toBe('tool_call')
      expect(r.value.competitors.length).toBe(2)
    }
  })

  it('expected_client_id mismatch rejected at tool_call (defense)', () => {
    const r = resolveDiscoverySource({
      tool_call: { input: CANONICAL_DISCOVERY, emission_count: 1 },
      expected_client_id: '11111111-1111-1111-1111-111111111111',
    })
    expect(r.kind).toBe('malformed')
    if (r.kind === 'malformed') {
      expect(r.source).toBe('tool_call')
      expect(r.reason).toMatch(/client_id_mismatch/)
    }
  })
})
