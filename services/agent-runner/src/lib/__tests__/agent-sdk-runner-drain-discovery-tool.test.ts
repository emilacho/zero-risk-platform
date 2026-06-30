/**
 * Tests · drainStream tool_use capture for emit_discovery_output
 * (SPEC lazo agentico 2026-06-05 follow-up).
 *
 * Validates · drainStream observes tool_use blocks in assistant messages ·
 * captures emit_discovery_output input · ignores OTHER tool_use names ·
 * keeps the LAST emission when agent iterates · null when tool never called.
 */
import { describe, it, expect, vi } from 'vitest'

// The SDK module is loaded as a side effect of importing agent-sdk-runner ·
// stub it out so vitest doesn't fail to resolve the runtime package (which
// lives in the workspace's pnpm tree · not visible to the root vitest config).
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => ({}),
}))

const { drainStream } = await import('../agent-sdk-runner')

const NAUFRAGO = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const SAMPLE_INPUT = {
  client_id: NAUFRAGO,
  own_handles: { instagram: '@naufrago_ec' },
  competitors: [{ name: 'La Pinta Quito' }],
}

async function* streamOf(...messages: unknown[]): AsyncIterable<unknown> {
  for (const m of messages) yield m
}

function asAssistant(content: Array<Record<string, unknown>>) {
  return { type: 'assistant', message: { content } }
}

function asResult(usage: Record<string, unknown> = {}) {
  return { type: 'result', session_id: 'sess-1', usage }
}

describe('drainStream · emit_discovery_output capture', () => {
  it('captures tool input via canonical SDK MCP namespace (mcp__discovery-output__emit_discovery_output)', async () => {
    // Canon · Track M (2026-06-06 · post-smoke ROJO root-cause) · the SDK
    // emits tool_use blocks with the FULLY QUALIFIED MCP namespace name ·
    // drainStream MUST match against the namespace · matching the bare name
    // silently misses every tool_use block.
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'text', text: 'Calling MCP tool now.' },
        {
          type: 'tool_use',
          name: 'mcp__discovery-output__emit_discovery_output',
          input: SAMPLE_INPUT,
        },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall).not.toBeNull()
    expect(drain.discoveryToolCall?.input).toEqual(SAMPLE_INPUT)
    expect(drain.discoveryToolCall?.emission_count).toBe(1)
  })

  it('also captures via the bare tool name (defensive · backwards-compat)', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'text', text: 'Calling tool now.' },
        { type: 'tool_use', name: 'emit_discovery_output', input: SAMPLE_INPUT },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall).not.toBeNull()
    expect(drain.discoveryToolCall?.input).toEqual(SAMPLE_INPUT)
    expect(drain.discoveryToolCall?.emission_count).toBe(1)
  })

  it('returns null when agent never invokes the tool', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([{ type: 'text', text: 'Just prose · no tool call.' }]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall).toBeNull()
    expect(drain.responseText).toContain('Just prose')
  })

  it('keeps LAST emission when agent iterates (mixed namespace + bare)', async () => {
    const firstInput = { ...SAMPLE_INPUT, own_handles: { instagram: '@first' } }
    const secondInput = { ...SAMPLE_INPUT, own_handles: { instagram: '@final' } }
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        // first iteration · bare name
        { type: 'tool_use', name: 'emit_discovery_output', input: firstInput },
      ]),
      asAssistant([
        // last iteration · canonical SDK namespace (the form prod actually emits)
        {
          type: 'tool_use',
          name: 'mcp__discovery-output__emit_discovery_output',
          input: secondInput,
        },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall?.input).toEqual(secondInput)
    expect(drain.discoveryToolCall?.emission_count).toBe(2)
  })

  it('ignores tool_use of OTHER tool names', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'tool_use', name: 'query_client_brain', input: { query: 'x' } },
        { type: 'tool_use', name: 'WebFetch', input: { url: 'https://x.com' } },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall).toBeNull()
  })

  it('ignores tool_use blocks with non-object input (defense)', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'tool_use', name: 'emit_discovery_output', input: null },
        { type: 'tool_use', name: 'emit_discovery_output', input: 'string' },
        { type: 'tool_use', name: 'emit_discovery_output', input: [1, 2, 3] },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.discoveryToolCall).toBeNull()
  })

  it('Brand Book · captura emit_brand_section en brandSectionToolCall (no cruza con discovery)', async () => {
    const SECTION = { lens: 'brand-strategist', positioning: 'P', icp_summary: 'I' }
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'tool_use', name: 'mcp__brand-section__emit_brand_section', input: SECTION },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.brandSectionToolCall).not.toBeNull()
    expect(drain.brandSectionToolCall?.input).toEqual(SECTION)
    expect(drain.discoveryToolCall).toBeNull()
  })

  it('Brand Book · brandSectionToolCall null cuando la lente narra sin emitir', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([{ type: 'text', text: 'Voy a investigar... (narración)' }]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.brandSectionToolCall).toBeNull()
  })

  it('Brand Book · captura emit_fidelity_scores en fidelityScoresToolCall (el judge)', async () => {
    const SCORES = { scores: { positioning: 0.9, voice_description: 0.88 } }
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'tool_use', name: 'mcp__brand-section__emit_fidelity_scores', input: SCORES },
      ]),
      asResult(),
    )
    const drain = await drainStream(stream as never)
    expect(drain.fidelityScoresToolCall).not.toBeNull()
    expect(drain.fidelityScoresToolCall?.input).toEqual(SCORES)
    expect(drain.brandSectionToolCall).toBeNull()
  })

  it('preserves responseText accumulation when tool_use also present', async () => {
    const stream = streamOf(
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      asAssistant([
        { type: 'text', text: 'Investigation complete. ' },
        { type: 'tool_use', name: 'emit_discovery_output', input: SAMPLE_INPUT },
        { type: 'text', text: 'See tool call for structured output.' },
      ]),
      asResult({ input_tokens: 100, output_tokens: 50 }),
    )
    const drain = await drainStream(stream as never)
    expect(drain.responseText).toBe(
      'Investigation complete. See tool call for structured output.',
    )
    expect(drain.discoveryToolCall?.input).toEqual(SAMPLE_INPUT)
    expect(drain.inputTokens).toBe(100)
    expect(drain.outputTokens).toBe(50)
  })
})
