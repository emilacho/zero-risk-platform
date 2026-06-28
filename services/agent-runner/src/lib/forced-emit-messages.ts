/**
 * forced-emit-messages · Fix C (Discovery · 2026-06-28 · CC#1).
 *
 * Deterministic last-resort recovery for the "agent narrates instead of calling
 * emit_discovery_output" bug. PR #220 re-prompts the Claude Agent SDK session
 * with a prose directive, but the Agent SDK exposes NO tool_choice forcing, so
 * the model can ignore it and narrate again. This module escalates to a direct
 * Messages API call with `tool_choice: {type:'tool', name:'emit_discovery_output'}`
 * — the model is COMPELLED to return the tool call; it cannot reply with prose.
 *
 * The agent's research narration (`researchText`) is re-injected as a prior
 * assistant turn so the forced emission is grounded in the work already done.
 *
 * Auth: `new Anthropic()` reads ANTHROPIC_API_KEY from the env (same key the
 * Agent SDK uses). If ANTHROPIC_BASE_URL is set (Vercel AI Gateway), it is used
 * as baseURL; otherwise the client hits Anthropic directly.
 */
import Anthropic from '@anthropic-ai/sdk'

/** Bare tool name (NOT the `mcp__discovery-output__` SDK namespace). */
export const EMIT_DISCOVERY_OUTPUT_TOOL_NAME = 'emit_discovery_output'

const SOCIAL_HANDLES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    instagram: { type: 'string' },
    facebook: { type: 'string' },
    tiktok: { type: 'string' },
    linkedin: { type: 'string' },
    youtube: { type: 'string' },
  },
} as const

const ICP_SEGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['audience_segment'],
  properties: {
    audience_segment: { type: 'string', minLength: 1 },
    segment_priority: { type: 'integer', minimum: 1 },
    job_titles: { type: 'array', items: { type: 'string' } },
    company_size: { type: 'string' },
    industries: { type: 'array', items: { type: 'string' } },
    geography: { type: 'string' },
    goals: { type: 'array', items: { type: 'string' } },
    pain_points: { type: 'array', items: { type: 'string' } },
    jobs_to_be_done: { type: 'array', items: { type: 'string' } },
    objections: { type: 'array', items: { type: 'string' } },
    buying_process: { type: 'string' },
    decision_criteria: { type: 'array', items: { type: 'string' } },
    budget_range: { type: 'string' },
    preferred_channels: { type: 'array', items: { type: 'string' } },
    content_preferences: { type: 'string' },
  },
} as const

/**
 * JSON Schema mirroring the live zod `DISCOVERY_INPUT_SCHEMA`
 * (services/agent-runner/src/lib/mcp/discovery-output-server.js). 5 top-level
 * fields · required: client_id, own_handles, competitors. Nested objects are
 * `.strict()` in zod → additionalProperties:false here. NO `sources` and NO
 * competitor provenance fields (zod strict rejects them).
 */
export const EMIT_DISCOVERY_OUTPUT_TOOL = {
  name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
  description:
    'Emit the structured Client Brain discovery output. Call this with the findings ' +
    'from your research: the client own social handles, the real competitors, the ICP, ' +
    'and a competitive landscape summary.',
  input_schema: {
    type: 'object',
    required: ['client_id', 'own_handles', 'competitors'],
    properties: {
      client_id: { type: 'string', format: 'uuid', description: 'MUST match the client_id passed by the orchestrator.' },
      own_handles: SOCIAL_HANDLES_SCHEMA,
      competitors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            website: { type: 'string', format: 'uri' },
            handles: SOCIAL_HANDLES_SCHEMA,
            why: { type: 'string' },
            competitor_type: { type: 'string', enum: ['direct', 'indirect', 'aspirational', 'alternative'] },
            positioning: { type: 'string' },
          },
        },
      },
      icp: {
        oneOf: [ICP_SEGMENT_SCHEMA, { type: 'array', minItems: 1, items: ICP_SEGMENT_SCHEMA }],
      },
      competitive_landscape_summary: { type: 'string' },
    },
  },
} as const

export interface ForceEmitArgs {
  model: string
  systemPrompt: string
  task: string
  researchText: string
  clientId: string | null
  /** Injectable for tests · defaults to a real Anthropic client. */
  createClient?: () => Pick<Anthropic, 'messages'>
}

export interface ForceEmitOutcome {
  input: Record<string, unknown>
  emission_count: number
  source: 'forced_messages_api'
  inputTokens: number
  outputTokens: number
}

/** Build an Anthropic client · honours ANTHROPIC_BASE_URL (gateway) when set. */
export function buildAnthropicClient(): Anthropic {
  const baseURL = process.env.ANTHROPIC_BASE_URL
  return new Anthropic(baseURL ? { baseURL } : {})
}

/**
 * Force the discovery emission via the Messages API. Returns the parsed tool
 * input (with client_id pinned to the canonical value · the model is not
 * trusted to echo it), or null if no tool_use block came back. Never throws is
 * NOT guaranteed here · the caller wraps this in try/catch (the run must not
 * fail because the repair failed).
 */
export async function forceEmitViaMessagesApi(args: ForceEmitArgs): Promise<ForceEmitOutcome | null> {
  const client = args.createClient ? args.createClient() : buildAnthropicClient()
  const research = args.researchText?.trim() || '(research completed but not captured as text)'

  const resp = await client.messages.create({
    model: args.model,
    max_tokens: 8000,
    system: args.systemPrompt,
    messages: [
      { role: 'user', content: args.task },
      { role: 'assistant', content: research },
      {
        role: 'user',
        content:
          'Emit your structured discovery findings NOW by calling the emit_discovery_output tool. ' +
          (args.clientId ? `client_id MUST be exactly "${args.clientId}". ` : '') +
          'Use the competitors, own_handles, ICP, and competitive landscape from the research above.',
      },
    ],
    // `as const` makes the schema deeply-readonly (good for the exported literal
    // + test access) · the SDK's Tool type is mutable, so cast at the boundary.
    tools: [EMIT_DISCOVERY_OUTPUT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME },
  })

  const block = (resp.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
  )
  if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
    return null
  }

  const input: Record<string, unknown> = { ...(block.input as Record<string, unknown>) }
  // Pin the canonical client_id · the downstream brain persist keys every row on
  // it · a model-hallucinated id would orphan the chunks.
  if (args.clientId) input.client_id = args.clientId

  return {
    input,
    emission_count: 1,
    source: 'forced_messages_api',
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
  }
}
