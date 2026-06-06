/**
 * Tests · deriveAllowedTools · SDK allowedTools per-MCP additions
 * (SPEC lazo agentico 2026-06-06 follow-up · Track L).
 *
 * Validates the canonical wiring · base SDK tools always present · per-MCP
 * tool additions when the server is registered. Closes smoke linchpin
 * ROJO round 2 root-cause (agent saw the MCP tool but `permissionMode=default`
 * blocked it because the tool was NOT in `allowedTools`).
 */
import { describe, it, expect, vi } from 'vitest'

// Stub the SDK module so the file load does not require the runtime package
// to resolve from the root vitest config (same pattern as the drainStream test).
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => ({}),
}))

const { deriveAllowedTools } = await import('../agent-sdk-runner')

const BASE_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']

describe('deriveAllowedTools · base SDK tools (canonical)', () => {
  it('always includes the 5 base SDK tools', () => {
    const tools = deriveAllowedTools({})
    expect(tools).toEqual(expect.arrayContaining(BASE_TOOLS))
    expect(tools.length).toBe(BASE_TOOLS.length)
  })

  it('returns base tools when no MCP servers registered (cero extras)', () => {
    expect(deriveAllowedTools({})).toEqual(BASE_TOOLS)
  })

  it('returns base tools when only non-extended MCP servers registered', () => {
    // client-brain · apify · meta-ads etc · NOT extended in the table
    // (they are gated by-design or invoked via push-enrichment · NOT
    // autonomously called by agents · canon Sprint 7.5 A7 deprecation).
    const tools = deriveAllowedTools({
      'client-brain': {},
      apify: {},
      'meta-ads': {},
      dataforseo: {},
    })
    expect(tools).toEqual(BASE_TOOLS)
  })
})

describe('deriveAllowedTools · discovery-output MCP addition (linchpin fix)', () => {
  it('adds mcp__discovery-output__emit_discovery_output when server is registered', () => {
    const tools = deriveAllowedTools({ 'discovery-output': { type: 'stdio' } })
    expect(tools).toContain('mcp__discovery-output__emit_discovery_output')
    expect(tools.length).toBe(BASE_TOOLS.length + 1)
  })

  it('preserves base tools in canonical order when MCP added', () => {
    const tools = deriveAllowedTools({ 'discovery-output': { type: 'stdio' } })
    for (const t of BASE_TOOLS) expect(tools).toContain(t)
    // base tools first · MCP additions last (deterministic ordering)
    expect(tools.slice(0, BASE_TOOLS.length)).toEqual(BASE_TOOLS)
  })

  it('does NOT add the tool when discovery-output server NOT registered', () => {
    // canon · the gate is the MCP registration (Track H gate · onboarding-specialist
    // + SALA_DISCOVERY_BRAIN_PUSH_ENABLED) · NOT a flag here · single source.
    const tools = deriveAllowedTools({ 'client-brain': {} })
    expect(tools).not.toContain('mcp__discovery-output__emit_discovery_output')
  })
})

describe('deriveAllowedTools · combined registrations', () => {
  it('discovery-output + other MCPs · still only adds discovery-output tool', () => {
    const tools = deriveAllowedTools({
      'client-brain': {},
      apify: {},
      'discovery-output': { type: 'stdio' },
    })
    expect(tools).toContain('mcp__discovery-output__emit_discovery_output')
    expect(tools.length).toBe(BASE_TOOLS.length + 1)
  })

  it('idempotent · same input yields same output (no hidden state)', () => {
    const input = { 'discovery-output': { type: 'stdio' } }
    expect(deriveAllowedTools(input)).toEqual(deriveAllowedTools(input))
  })
})
