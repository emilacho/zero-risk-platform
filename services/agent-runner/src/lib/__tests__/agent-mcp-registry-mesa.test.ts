/**
 * Tests · LA MESA · conector de herramientas del tablero (mesa_pedir · mesa_devolver · pedir_material).
 * Lo que se comprueba: se monta SOLO en un turno de la mesa, solo para los agentes de la mesa y solo si la plataforma es alcanzable; los jueces de la jefatura nunca lo reciben;
 * y — la trampa de siempre — cada herramienta que el servidor ofrece está en `allowedTools` (una herramienta montada y no listada queda MUDA sin error).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMcpServers, MESA_ALLOW } from '../agent-mcp-registry'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => ({}) }))
const { deriveAllowedTools } = await import('../agent-sdk-runner')

const ENV = ['ZR_PLATFORM_URL', 'INTERNAL_API_KEY'] as const

describe('mesa MCP · montaje', () => {
  const guardado: Record<string, string | undefined> = {}
  beforeEach(() => { for (const k of ENV) guardado[k] = process.env[k]; process.env.ZR_PLATFORM_URL = 'https://plataforma.test'; process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { for (const k of ENV) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k] } })

  it('se monta en un turno de la mesa para cada agente de la mesa, con el encargo y el agente FIJADOS en el entorno', () => {
    for (const slug of MESA_ALLOW) {
      const s = buildMcpServers({ agentSlug: slug, mesa: { encargoId: 'enc-1' } }).mesa
      expect(s, `falta para ${slug}`).toBeDefined()
      expect(s?.args[0]).toMatch(/mesa-server\.js$/)
      expect(s?.env).toMatchObject({ ZR_ENCARGO_ID: 'enc-1', ZR_AGENTE: slug, ZR_PLATFORM_URL: 'https://plataforma.test' })
    }
  })

  // oficina de marketing (31-oct · E1): los tres de la ADENDA 2 entran a la mesa; una prueba por agente para que quitar uno se note
  it.each(['campaign-brief-agent', 'video-editor', 'marketing_video_optimization_specialist'])('%s está en la mesa y recibe el conector en su turno', (slug) => {
    expect(MESA_ALLOW.has(slug)).toBe(true)
    const s = buildMcpServers({ agentSlug: slug, mesa: { encargoId: 'enc-9' } }).mesa
    expect(s?.env).toMatchObject({ ZR_ENCARGO_ID: 'enc-9', ZR_AGENTE: slug })
    expect(buildMcpServers({ agentSlug: slug }).mesa).toBeUndefined()
  })

  it('NO se monta fuera de la mesa, sin plataforma alcanzable, ni para un juez de la jefatura', () => {
    expect(buildMcpServers({ agentSlug: 'content-creator' }).mesa).toBeUndefined()
    expect(buildMcpServers({ agentSlug: 'content-creator', mesa: null }).mesa).toBeUndefined()
    delete process.env.ZR_PLATFORM_URL
    expect(buildMcpServers({ agentSlug: 'content-creator', mesa: { encargoId: 'enc-1' } }).mesa).toBeUndefined()
    process.env.ZR_PLATFORM_URL = 'https://plataforma.test'
    delete process.env.INTERNAL_API_KEY
    expect(buildMcpServers({ agentSlug: 'content-creator', mesa: { encargoId: 'enc-1' } }).mesa).toBeUndefined()
    process.env.INTERNAL_API_KEY = 'llave-de-prueba'
    for (const juez of ['brand_strategist', 'brand-strategist', 'editor_en_jefe', 'editor-en-jefe', 'jefe_client_success', 'jefe-marketing']) {
      expect(buildMcpServers({ agentSlug: juez, mesa: { encargoId: 'enc-1' } }).mesa, juez).toBeUndefined()
    }
  })
})

describe('mesa MCP · allowedTools', () => {
  it('con el conector montado, las tres herramientas están en allowedTools; sin él, ninguna', () => {
    const con = deriveAllowedTools({ mesa: {} })
    expect(con).toEqual(expect.arrayContaining(['mcp__mesa__mesa_pedir', 'mcp__mesa__mesa_devolver', 'mcp__mesa__pedir_material']))
    expect(deriveAllowedTools({}).some((t) => t.startsWith('mcp__mesa__'))).toBe(false)
  })

  it('cada herramienta que el servidor ofrece está en allowedTools (ninguna queda muda)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'mesa-server.js'), 'utf8')
    const ofrecidas = [...fuente.matchAll(/servidor\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(ofrecidas.sort()).toEqual(['mesa_devolver', 'mesa_pedir', 'pedir_material'])
    const lista = deriveAllowedTools({ mesa: {} })
    for (const t of ofrecidas) expect(lista, t).toContain(`mcp__mesa__${t}`)
  })

  it('el servidor nunca informa éxito sin confirmación de la plataforma (todo camino sin ok:true es error)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'mesa-server.js'), 'utf8')
    expect(fuente).toMatch(/cuerpo\.ok !== true/)
    expect(fuente).toMatch(/la plataforma contestó vacío/)
    expect(fuente).toMatch(/isError: true/)
  })
})
