/**
 * Canon canonical · Discovery output source resolver (SPEC lazo agentico
 * 2026-06-05 follow-up).
 *
 * The platform receives Discovery in TWO independent channels ·
 *   1. `discoveryToolCall.input` · the agent invoked the canonical MCP tool
 *      `emit_discovery_output` · args pre-validated against zod schema ·
 *      CANONICAL · highest confidence
 *   2. `agent_response_text` · free-form prose · the parser extracts the
 *      JSON block · DEFENSE IN DEPTH fallback for cases where the agent
 *      did not invoke the tool (legacy · debug · prompt-level emission)
 *
 * This resolver picks the canonical source · tool call WINS when present ·
 * parser only runs when tool call is absent. The resolver returns a tagged
 * result so callers know WHICH source produced the Discovery (audit ·
 * dashboards · cap on prose-only regressions).
 *
 * §148 honest · NEVER throws · returns tagged result · cero implicit accept.
 */
import { parseDiscoveryOutput } from './parse'
import { validateDiscoveryShape } from './parse'
import type { DiscoveryOutput } from './types'

export type DiscoveryResolveResult =
  | {
      readonly kind: 'ok'
      readonly source: 'tool_call' | 'text_parser'
      readonly value: DiscoveryOutput
      /** Canon canonical · when source=tool_call · emission_count from the
       *  drainStream capture · null for parser path. */
      readonly emission_count: number | null
    }
  | {
      readonly kind: 'absent'
      readonly source: 'none'
      readonly reason: string
    }
  | {
      readonly kind: 'malformed'
      readonly source: 'tool_call' | 'text_parser'
      readonly reason: string
    }

export interface ResolveDiscoverySourceInput {
  /** Canon canonical · the structured tool_use input captured by the Railway
   *  runner from the SDK stream · undefined when the agent did NOT invoke
   *  `emit_discovery_output`. */
  readonly tool_call?: {
    readonly input: Record<string, unknown>
    readonly emission_count: number
  }
  /** Canon canonical · the agent's free-form text response · parsed only as
   *  fallback when tool_call absent. */
  readonly agent_response_text?: string
  /** Optional · enforces canonical client_id match on both paths. */
  readonly expected_client_id?: string
}

/**
 * Canon canonical · resolve the Discovery source · TOOL CALL WINS · parser
 * is defense-in-depth fallback only.
 */
export function resolveDiscoverySource(
  input: ResolveDiscoverySourceInput,
): DiscoveryResolveResult {
  // ─── 1 · prefer the tool_call · zod-validated upstream ───
  if (input.tool_call && input.tool_call.input) {
    const shape = validateDiscoveryShape(
      input.tool_call.input,
      input.expected_client_id,
    )
    if (shape.kind === 'ok') {
      return {
        kind: 'ok',
        source: 'tool_call',
        value: shape.value,
        emission_count: input.tool_call.emission_count,
      }
    }
    // §148 honest · even though the MCP zod schema should reject invalid
    // shape upstream · double-check at the proxy boundary (defensive · the
    // runner is a separate deployment). If it DOES fail here · log + return
    // malformed (do NOT silently fall through to parser · the agent thought
    // it was emitting structured · prose fallback would mask a regression).
    return { kind: 'malformed', source: 'tool_call', reason: shape.reason }
  }

  // ─── 2 · fallback · parse the text response ───
  if (input.agent_response_text === undefined || input.agent_response_text === null) {
    return { kind: 'absent', source: 'none', reason: 'no_tool_call_and_no_text' }
  }
  const parsed = parseDiscoveryOutput(input.agent_response_text, {
    ...(input.expected_client_id ? { expected_client_id: input.expected_client_id } : {}),
  })
  if (parsed.kind === 'ok') {
    return { kind: 'ok', source: 'text_parser', value: parsed.value, emission_count: null }
  }
  if (parsed.kind === 'absent') {
    return { kind: 'absent', source: 'none', reason: parsed.reason }
  }
  return { kind: 'malformed', source: 'text_parser', reason: parsed.reason }
}
