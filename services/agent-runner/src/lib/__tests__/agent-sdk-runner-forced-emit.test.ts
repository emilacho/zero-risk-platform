/**
 * Tests · shouldForceDiscoveryEmit predicate (Discovery Fix · 2026-06-28 · CC#4).
 *
 * The forced-emit fallback re-prompts a Discovery agent's session when it closed
 * the stream without calling emit_discovery_output. This predicate gates that
 * fallback · it must fire ONLY when the tool was mounted, the agent did not emit,
 * and a session is resumable.
 */
import { describe, it, expect, vi } from 'vitest'

// Stub the SDK so importing agent-sdk-runner doesn't fail to resolve the runtime
// package (lives in the workspace pnpm tree · not visible to root vitest config).
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => ({}),
}))

const { shouldForceDiscoveryEmit, isDiscoveryCheckpointUsable } = await import('../agent-sdk-runner')

const MOUNTED = { 'discovery-output': { type: 'stdio' }, 'client-brain': { type: 'stdio' } }
const NOT_MOUNTED = { 'client-brain': { type: 'stdio' } }
const TOOL_CALL = { input: { client_id: 'c1' }, emission_count: 1 }

describe('shouldForceDiscoveryEmit', () => {
  it('TRUE · discovery tool mounted + no emission + session present', () => {
    expect(
      shouldForceDiscoveryEmit(MOUNTED, { discoveryToolCall: null, sessionId: 'sess-1' }),
    ).toBe(true)
  })

  it('FALSE · agent already emitted (discoveryToolCall present)', () => {
    expect(
      shouldForceDiscoveryEmit(MOUNTED, { discoveryToolCall: TOOL_CALL, sessionId: 'sess-1' }),
    ).toBe(false)
  })

  it('FALSE · discovery tool NOT mounted (non-discovery agent)', () => {
    expect(
      shouldForceDiscoveryEmit(NOT_MOUNTED, { discoveryToolCall: null, sessionId: 'sess-1' }),
    ).toBe(false)
  })

  it('FALSE · no resumable session', () => {
    expect(
      shouldForceDiscoveryEmit(MOUNTED, { discoveryToolCall: null, sessionId: null }),
    ).toBe(false)
  })

  it('FALSE · mcpServers undefined', () => {
    expect(
      shouldForceDiscoveryEmit(undefined, { discoveryToolCall: null, sessionId: 'sess-1' }),
    ).toBe(false)
  })
})

const WITH_EMIT = { response: 'x', discoveryToolCall: { input: {}, emission_count: 2 } }
const NO_EMIT = { response: 'x' }

describe('isDiscoveryCheckpointUsable', () => {
  it('TRUE · non-discovery agent · any checkpoint is reusable', () => {
    expect(isDiscoveryCheckpointUsable('competitive-intelligence-agent', NO_EMIT)).toBe(true)
    expect(isDiscoveryCheckpointUsable('brand-strategist', WITH_EMIT)).toBe(true)
  })

  it('TRUE · discovery agent · cache captured the emission', () => {
    expect(isDiscoveryCheckpointUsable('onboarding-specialist', WITH_EMIT)).toBe(true)
  })

  it('FALSE · discovery agent · cache has NO emission (run fresh · stale-cache root cause)', () => {
    expect(isDiscoveryCheckpointUsable('onboarding-specialist', NO_EMIT)).toBe(false)
  })

  it('FALSE · discovery agent · null/undefined output_ref', () => {
    expect(isDiscoveryCheckpointUsable('onboarding-specialist', null)).toBe(false)
    expect(isDiscoveryCheckpointUsable('onboarding-specialist', undefined)).toBe(false)
  })
})
