/**
 * Tests · discovery-output MCP registration (SPEC lazo agentico 2026-06-05 follow-up).
 *
 * Validates the canonical gate · MCP registered ONLY when
 * (a) slug = onboarding-specialist (DISCOVERY_OUTPUT_ALLOW canonical)
 * (b) SALA_DISCOVERY_BRAIN_PUSH_ENABLED=true
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMcpServers } from '../agent-mcp-registry'

const FLAG = 'SALA_DISCOVERY_BRAIN_PUSH_ENABLED'

describe('discovery-output MCP · canonical activation gate', () => {
  let originalFlag: string | undefined
  beforeEach(() => {
    originalFlag = process.env[FLAG]
    delete process.env[FLAG]
  })
  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG]
    else process.env[FLAG] = originalFlag
  })

  it('NOT registered when flag unset (default-OFF)', () => {
    const servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']).toBeUndefined()
  })

  it('NOT registered when flag=true but slug NOT in allow-list', () => {
    process.env[FLAG] = 'true'
    const servers = buildMcpServers({ agentSlug: 'media-buyer' })
    expect(servers['discovery-output']).toBeUndefined()
  })

  it('NOT registered when slug in allow-list but flag=false', () => {
    process.env[FLAG] = 'false'
    const servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']).toBeUndefined()
  })

  it('REGISTERED when both gates pass · canonical happy path', () => {
    process.env[FLAG] = 'true'
    const servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']).toBeDefined()
    expect(servers['discovery-output']?.type).toBe('stdio')
    expect(servers['discovery-output']?.command).toBe('node')
    expect(servers['discovery-output']?.args[0]).toMatch(/discovery-output-server\.js$/)
  })

  it('forwards CLIENT_ID env when ctx.clientId present', () => {
    process.env[FLAG] = 'true'
    const servers = buildMcpServers({
      agentSlug: 'onboarding-specialist',
      clientId: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    })
    expect(servers['discovery-output']?.env.CLIENT_ID).toBe(
      'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    )
  })

  it('omits CLIENT_ID env when no clientId in ctx', () => {
    process.env[FLAG] = 'true'
    const servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']?.env.CLIENT_ID).toBeUndefined()
  })

  it('any non-"true" value treated as disabled', () => {
    process.env[FLAG] = '1'
    let servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']).toBeUndefined()
    process.env[FLAG] = 'TRUE'
    servers = buildMcpServers({ agentSlug: 'onboarding-specialist' })
    expect(servers['discovery-output']).toBeUndefined()
  })
})
