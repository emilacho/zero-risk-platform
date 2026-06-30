/**
 * Tests · brand-section MCP registration + allowedTools (SPEC brand-book
 * colaborativo · CC#4 2026-06-30 · fix narración-vs-estructurado).
 *
 * Las 3 lentes emiten su sección vía emit_brand_section · gate idéntico a
 * discovery-output (slug en BRAND_SECTION_ALLOW + SALA_DISCOVERY_BRAIN_PUSH_ENABLED).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMcpServers } from '../agent-mcp-registry'
import { deriveAllowedTools } from '../agent-sdk-runner'

const FLAG = 'SALA_DISCOVERY_BRAIN_PUSH_ENABLED'

describe('brand-section MCP · activation gate', () => {
  let original: string | undefined
  beforeEach(() => { original = process.env[FLAG]; delete process.env[FLAG] })
  afterEach(() => { if (original === undefined) delete process.env[FLAG]; else process.env[FLAG] = original })

  it('NOT registered when flag unset (default-OFF)', () => {
    expect(buildMcpServers({ agentSlug: 'brand-strategist' })['brand-section']).toBeUndefined()
  })

  it('REGISTERED para cada lente con flag=true', () => {
    process.env[FLAG] = 'true'
    for (const slug of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      const s = buildMcpServers({ agentSlug: slug })['brand-section']
      expect(s, `falta para ${slug}`).toBeDefined()
      expect(s?.args[0]).toMatch(/brand-section-server\.js$/)
    }
  })

  it('NOT registered para agente fuera del allow-list', () => {
    process.env[FLAG] = 'true'
    expect(buildMcpServers({ agentSlug: 'onboarding-specialist' })['brand-section']).toBeUndefined()
  })

  it('deriveAllowedTools incluye emit_brand_section cuando el server está montado', () => {
    process.env[FLAG] = 'true'
    const servers = buildMcpServers({ agentSlug: 'brand-strategist' })
    const tools = deriveAllowedTools(servers as unknown as Record<string, unknown>)
    expect(tools).toContain('mcp__brand-section__emit_brand_section')
  })

  it('deriveAllowedTools NO incluye el tool cuando el server no está montado', () => {
    const tools = deriveAllowedTools({})
    expect(tools).not.toContain('mcp__brand-section__emit_brand_section')
  })
})
