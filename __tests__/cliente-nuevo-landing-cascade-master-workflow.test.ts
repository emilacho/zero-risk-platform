/**
 * cliente-nuevo-landing-cascade-master-workflow.test.ts · CC#2 Path D
 *
 * Structural contract test for the n8n workflow JSON
 * `n8n-workflows/tier-1/cliente-nuevo-landing-cascade-master.json` that
 * replaces the legacy `/api/cascade/onboard` Vercel route.
 *
 * Updated by CC#2 fix-only dispatch (post-Náufrago v2 smoke):
 *   - Workflow now has 19 nodes (Hero gen sequential post-delivery +
 *     Hero copy-to-v2 routed through new /api/cascade/copy-hero-to-v2
 *     endpoint)
 *   - Gap 4+5 agents (style-consistency-reviewer · delivery-coordinator)
 *     are now seeded (PR #29 merged + REST applied) · no longer use
 *     continueOnFail (real agents · real outputs)
 *   - Sequential chain throughout · no parallel-fanout (n8n's HTTP node
 *     multi-target in main[0] doesn't actually parallelize)
 *   - All agent jsonBody fields use JS object expression mode
 *     `={{ ({ agent, task, client_id, caller }) }}` for proper JSON escape
 *   - Agent node timeouts bumped to 300_000ms (long Opus + Camino III)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKFLOW_PATH = resolve(
  __dirname,
  '..',
  'n8n-workflows',
  'tier-1',
  'cliente-nuevo-landing-cascade-master.json',
)

interface N8nNode {
  id: string
  name: string
  type: string
  parameters?: Record<string, unknown>
  continueOnFail?: boolean
}

interface N8nWorkflow {
  name: string
  nodes: N8nNode[]
  connections: Record<string, unknown>
  settings: Record<string, unknown>
  tags: Array<{ name: string; id: string }>
}

describe('n8n workflow · Cliente Nuevo Landing Cascade Master', () => {
  const workflow = JSON.parse(readFileSync(WORKFLOW_PATH, 'utf8')) as N8nWorkflow

  it('parses as valid JSON with 19 nodes (sequential chain post-Path-D-fix)', () => {
    expect(workflow.name).toBe('Zero Risk — Cliente Nuevo · Landing Cascade Master')
    expect(Array.isArray(workflow.nodes)).toBe(true)
    expect(workflow.nodes.length).toBe(19)
    expect(workflow.connections).toBeDefined()
    expect(workflow.settings.executionOrder).toBe('v1')
  })

  it('has webhook entry at canonical path · /webhook/zero-risk/cliente-nuevo-landing', () => {
    const webhook = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook')
    expect(webhook).toBeDefined()
    expect((webhook!.parameters as { path: string }).path).toBe('zero-risk/cliente-nuevo-landing')
    expect((webhook!.parameters as { httpMethod: string }).httpMethod).toBe('POST')
  })

  it('chain includes 9 agent invocations with DB-canonical slugs', () => {
    const agentBodies = workflow.nodes
      .filter(n => n.type === 'n8n-nodes-base.httpRequest')
      .map(n => (n.parameters as { jsonBody?: string }).jsonBody || '')
      .filter(b => b.includes("agent: '"))

    const expectedSlugs = [
      'brand-strategist',
      'market_research_analyst', // CC#2 Path D fix · DB-canonical underscored
      'creative-director',
      'web-designer',
      'content-creator',
      'spell-check-corrector',
      'editor-en-jefe',
      'style-consistency-reviewer', // Gap 4 · seeded post-PR #29 merge
      'delivery-coordinator', // Gap 5 · seeded post-PR #29 merge
    ]

    for (const slug of expectedSlugs) {
      const match = agentBodies.find(b => b.includes(`agent: '${slug}'`))
      expect(match, `agent slug "${slug}" should appear in a node jsonBody`).toBeDefined()
    }
  })

  it('does NOT include the buggy hyphenated slug `market-research-analyst`', () => {
    const allBodies = JSON.stringify(workflow)
    expect(allBodies).not.toContain("agent: 'market-research-analyst'")
  })

  it('Gap 4+5 nodes no longer use continueOnFail (agents are seeded post-PR #29 merge)', () => {
    const styleNode = workflow.nodes.find(n => n.id === 'agent-style-reviewer')
    const deliveryNode = workflow.nodes.find(n => n.id === 'agent-delivery-coord')
    expect(styleNode).toBeDefined()
    expect(deliveryNode).toBeDefined()
    expect(styleNode!.continueOnFail).not.toBe(true)
    expect(deliveryNode!.continueOnFail).not.toBe(true)
  })

  it('Hero gen + Hero copy-to-v2 nodes present and use continueOnFail (optional · cascade tolerates failure)', () => {
    const heroGen = workflow.nodes.find(n => n.id === 'hero-gen')
    const heroCopy = workflow.nodes.find(n => n.id === 'hero-copy-v2')
    expect(heroGen).toBeDefined()
    expect(heroCopy).toBeDefined()
    expect(heroGen!.continueOnFail).toBe(true)
    expect(heroCopy!.continueOnFail).toBe(true)
    expect((heroCopy!.parameters as { url: string }).url).toContain('/api/cascade/copy-hero-to-v2')
  })

  it('Hero gen is positioned SEQUENTIALLY after delivery-coordinator (not parallel from creative)', () => {
    const conn = workflow.connections as Record<string, { main?: Array<Array<{ node: string }>> }>
    const creativeNext = conn['Agent · creative-director']?.main?.[0]?.map(t => t.node) ?? []
    expect(creativeNext).toEqual(['Agent · web-designer'])
    const deliveryNext = conn['Agent · delivery-coordinator (Gap 5)']?.main?.[0]?.map(t => t.node) ?? []
    expect(deliveryNext).toContain('Hero · GPT Image (post-delivery)')
  })

  it('apify-scrape uses continueOnFail (optional · IG handle may be missing)', () => {
    const apify = workflow.nodes.find(n => n.id === 'apify-scrape')
    expect(apify).toBeDefined()
    expect(apify!.continueOnFail).toBe(true)
  })

  it('persist-outputs node targets the dedicated /api/cascade/persist-outputs route', () => {
    const persistNode = workflow.nodes.find(n => n.id === 'persist-outputs')
    expect(persistNode).toBeDefined()
    const url = (persistNode!.parameters as { url: string }).url
    expect(url).toContain('/api/cascade/persist-outputs')
    expect(url).not.toContain('/api/cascade/onboard')
  })

  it('persist-outputs includes hero in the outputs map (post-fix)', () => {
    const persistNode = workflow.nodes.find(n => n.id === 'persist-outputs')
    const body = (persistNode!.parameters as { jsonBody: string }).jsonBody
    expect(body).toContain('hero: $node[')
    expect(body).toContain("'Hero · GPT Image (post-delivery)'")
  })

  it('all agent nodes use 300s timeout (300_000 ms · web-designer + Opus calls fit)', () => {
    const agentIds = [
      'agent-brand-strategist', 'agent-market-research', 'agent-creative-director',
      'agent-web-designer', 'agent-content-creator', 'agent-spell-check',
      'agent-editor-jefe', 'agent-style-reviewer', 'agent-delivery-coord',
    ]
    for (const id of agentIds) {
      const node = workflow.nodes.find(n => n.id === id)
      expect(node, `agent node ${id} must exist`).toBeDefined()
      const opts = (node!.parameters as { options?: { timeout?: number } }).options
      expect(opts?.timeout, `agent ${id} should have 300s timeout`).toBe(300000)
    }
  })

  it('all agent bodies use JS object expression mode (={{ ({...}) }} pattern)', () => {
    const agentIds = [
      'agent-brand-strategist', 'agent-market-research', 'agent-creative-director',
      'agent-web-designer', 'agent-content-creator', 'agent-spell-check',
      'agent-editor-jefe', 'agent-style-reviewer', 'agent-delivery-coord',
    ]
    for (const id of agentIds) {
      const node = workflow.nodes.find(n => n.id === id)
      const body = (node!.parameters as { jsonBody: string }).jsonBody
      expect(body.startsWith('={{ ('), `agent ${id} body should start with JS object expression`).toBe(true)
    }
  })

  it('connections form a valid DAG · all node names referenced exist', () => {
    const nodeNames = new Set(workflow.nodes.map(n => n.name))
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      expect(nodeNames.has(source), `source node "${source}" should exist`).toBe(true)
      const mainArr = (outputs as { main?: Array<Array<{ node: string }>> }).main ?? []
      for (const branch of mainArr) {
        for (const target of branch) {
          expect(
            nodeNames.has(target.node),
            `target node "${target.node}" should exist`,
          ).toBe(true)
        }
      }
    }
  })

  it('Respond response body includes hero_v2_path field', () => {
    const respond = workflow.nodes.find(n => n.id === 'respond')
    expect(respond).toBeDefined()
    const body = (respond!.parameters as { responseBody: string }).responseBody
    expect(body).toContain('hero_v2_path')
    expect(body).toContain('hero_generated')
  })

  it('tags include zero-risk + tier-1 + cascade for n8n filterability', () => {
    const tagNames = workflow.tags.map(t => t.name)
    expect(tagNames).toContain('zero-risk')
    expect(tagNames).toContain('tier-1')
    expect(tagNames).toContain('cascade')
  })
})
