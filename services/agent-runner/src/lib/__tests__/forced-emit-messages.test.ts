/**
 * Tests · forced-emit-messages (Fix C · Discovery · 2026-06-28 · CC#1).
 *
 * The deterministic Messages-API forced-emit: tool_choice:{type:'tool'} compels
 * the model to call emit_discovery_output. Verifies the request shape (forced
 * tool_choice + the tool), client_id pinning, ANTHROPIC_BASE_URL handling, and
 * the no-tool_use-block path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createMock = vi.fn()
const ctorSpy = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
    constructor(opts: unknown) {
      ctorSpy(opts)
    }
  },
}))

const {
  forceEmitViaMessagesApi,
  buildAnthropicClient,
  EMIT_DISCOVERY_OUTPUT_TOOL,
  EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
  forceFidelityEmitViaMessagesApi,
  EMIT_FIDELITY_SCORES_TOOL,
  EMIT_FIDELITY_SCORES_TOOL_NAME,
} = await import('../forced-emit-messages')

const CID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const BASE_ARGS = {
  model: 'claude-sonnet-4-6',
  systemPrompt: 'You are the onboarding specialist.',
  task: 'Auto-discover Client Brain for Náufrago (...)',
  researchText: 'Investigué Instagram + competidores...',
  clientId: CID,
}

beforeEach(() => {
  createMock.mockReset()
  ctorSpy.mockReset()
  delete process.env.ANTHROPIC_BASE_URL
})
afterEach(() => {
  delete process.env.ANTHROPIC_BASE_URL
})

describe('EMIT_DISCOVERY_OUTPUT_TOOL schema', () => {
  it('mirrors the zod contract · 5 top-level fields · 3 required · no sources', () => {
    const s = EMIT_DISCOVERY_OUTPUT_TOOL.input_schema
    expect(EMIT_DISCOVERY_OUTPUT_TOOL.name).toBe('emit_discovery_output')
    expect(Object.keys(s.properties).sort()).toEqual(
      ['client_id', 'competitive_landscape_summary', 'competitors', 'icp', 'own_handles'].sort(),
    )
    expect(s.required).toEqual(['client_id', 'own_handles', 'competitors'])
    expect(s.properties).not.toHaveProperty('sources')
    // nested objects are strict (.strict() in zod)
    expect(s.properties.own_handles.additionalProperties).toBe(false)
    expect(s.properties.competitors.items.additionalProperties).toBe(false)
  })
})

describe('buildAnthropicClient', () => {
  it('passes baseURL when ANTHROPIC_BASE_URL is set', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example/anthropic'
    buildAnthropicClient()
    expect(ctorSpy).toHaveBeenCalledWith({ baseURL: 'https://gateway.example/anthropic' })
  })

  it('passes empty options (direct) when ANTHROPIC_BASE_URL is absent', () => {
    buildAnthropicClient()
    expect(ctorSpy).toHaveBeenCalledWith({})
  })
})

describe('forceEmitViaMessagesApi', () => {
  it('forces tool_choice + parses the tool_use input + pins client_id', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'ignored prose' },
        {
          type: 'tool_use',
          name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
          input: { client_id: 'WRONG-ID', own_handles: { instagram: '@x' }, competitors: [{ name: 'C1' }] },
        },
      ],
      usage: { input_tokens: 1200, output_tokens: 300 },
    })

    const out = await forceEmitViaMessagesApi(BASE_ARGS)
    expect(out).not.toBeNull()
    expect(out!.input.client_id).toBe(CID) // pinned · NOT the model's WRONG-ID
    expect(out!.source).toBe('forced_messages_api')
    expect(out!.emission_count).toBe(1)
    expect(out!.inputTokens).toBe(1200)
    expect(out!.outputTokens).toBe(300)

    const call = createMock.mock.calls[0][0]
    expect(call.model).toBe('claude-sonnet-4-6')
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'emit_discovery_output' })
    expect(call.tools[0].name).toBe('emit_discovery_output')
    // research re-injected as a prior assistant turn · final turn is user (no prefill 400)
    expect(call.messages[1].role).toBe('assistant')
    expect(call.messages[call.messages.length - 1].role).toBe('user')
  })

  it('returns null when the response has no tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'only prose' }], usage: {} })
    const out = await forceEmitViaMessagesApi(BASE_ARGS)
    expect(out).toBeNull()
  })

  it('falls back to a placeholder assistant turn when researchText is empty', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'tool_use', name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME, input: { client_id: CID, own_handles: {}, competitors: [] } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    await forceEmitViaMessagesApi({ ...BASE_ARGS, researchText: '   ' })
    const call = createMock.mock.calls[0][0]
    expect(typeof call.messages[1].content).toBe('string')
    expect(call.messages[1].content.length).toBeGreaterThan(0)
  })

  it('uses an injected client when provided (no real SDK)', async () => {
    const injected = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME, input: { client_id: CID, own_handles: {}, competitors: [] } }], usage: {} }) } }
    const out = await forceEmitViaMessagesApi({ ...BASE_ARGS, createClient: () => injected as never })
    expect(out).not.toBeNull()
    expect(injected.messages.create).toHaveBeenCalledOnce()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('forceFidelityEmitViaMessagesApi (Bug 2 · judge)', () => {
  const FID_ARGS = {
    model: 'claude-sonnet-4-6',
    systemPrompt: 'Sos el editor en jefe · juez de fidelidad.',
    task: 'Puntuá la fidelidad de los campos del brand book.',
    researchText: 'Evalué cada campo contra la evidencia.',
  }

  it('schema · scores 0..1 por campo · scores required', () => {
    const s = EMIT_FIDELITY_SCORES_TOOL.input_schema
    expect(EMIT_FIDELITY_SCORES_TOOL.name).toBe('emit_fidelity_scores')
    expect(s.required).toEqual(['scores'])
    expect(Object.keys(s.properties.scores.properties).sort()).toEqual(
      ['customer_angle', 'icp_summary', 'positioning', 'retention_notes', 'voice_description'].sort(),
    )
    expect(s.properties.scores.properties.positioning).toEqual({ type: 'number', minimum: 0, maximum: 1 })
  })

  it('fuerza tool_choice emit_fidelity_scores + parsea los scores', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'prosa ignorada' },
        { type: 'tool_use', name: EMIT_FIDELITY_SCORES_TOOL_NAME, input: { scores: { positioning: 0.9, voice_description: 0.88 } } },
      ],
      usage: { input_tokens: 500, output_tokens: 80 },
    })
    const out = await forceFidelityEmitViaMessagesApi(FID_ARGS)
    expect(out).not.toBeNull()
    expect((out!.input as { scores: Record<string, number> }).scores.positioning).toBe(0.9)
    expect(out!.source).toBe('forced_messages_api')
    const call = createMock.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'emit_fidelity_scores' })
    expect(call.messages[call.messages.length - 1].role).toBe('user')
  })

  it('returns null cuando no hay tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'solo prosa' }], usage: {} })
    expect(await forceFidelityEmitViaMessagesApi(FID_ARGS)).toBeNull()
  })
})
