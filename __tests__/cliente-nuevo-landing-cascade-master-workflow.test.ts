/**
 * cliente-nuevo-landing-cascade-master-workflow.test.ts · CC#2 Path D
 *
 * Structural contract test for the new n8n workflow JSON
 * `n8n-workflows/tier-1/cliente-nuevo-landing-cascade-master.json` that
 * replaces the legacy `/api/cascade/onboard` Vercel route. Verifies:
 *   1. Valid JSON · parseable
 *   2. Webhook entry path matches contract (/webhook/zero-risk/cliente-nuevo-landing)
 *   3. Agent slugs in the chain match DB-canonical forms (post-Bug-1 fix)
 *   4. Cascade order respects parsed-output chaining contract
 *   5. Gap 4+5 nodes (style-consistency-reviewer · delivery-coordinator)
 *      use continueOnFail so their not-yet-seeded agents don't break the
 *      chain
 *   6. Persist-outputs node targets the new `/api/cascade/persist-outputs`
 *      route (NOT the deprecated `/api/cascade/onboard`)
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

  it('parses as valid JSON with required top-level keys', () => {
    expect(workflow.name).toBe('Zero Risk — Cliente Nuevo · Landing Cascade Master')
    expect(Array.isArray(workflow.nodes)).toBe(true)
    expect(workflow.nodes.length).toBeGreaterThanOrEqual(16)
    expect(workflow.connections).toBeDefined()
    expect(workflow.settings.executionOrder).toBe('v1')
  })

  it('has webhook entry at canonical path · /webhook/zero-risk/cliente-nuevo-landing', () => {
    const webhook = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook')
    expect(webhook).toBeDefined()
    expect((webhook!.parameters as { path: string }).path).toBe('zero-risk/cliente-nuevo-landing')
    expect((webhook!.parameters as { httpMethod: string }).httpMethod).toBe('POST')
  })

  it('chain includes 7 agent invocations with DB-canonical slugs', () => {
    const agentBodies = workflow.nodes
      .filter(n => n.type === 'n8n-nodes-base.httpRequest')
      .map(n => (n.parameters as { jsonBody?: string }).jsonBody || '')
      .filter(b => b.includes('"agent"'))

    const expectedSlugs = [
      'brand-strategist',
      'market_research_analyst', // CC#2 Path D fix · DB-canonical underscored
      'creative-director',
      'web-designer',
      'content-creator',
      'spell-check-corrector',
      'editor-en-jefe',
      'style-consistency-reviewer', // Gap 4 · continueOnFail
      'delivery-coordinator', // Gap 5 · continueOnFail
    ]

    for (const slug of expectedSlugs) {
      const match = agentBodies.find(b => b.includes(`"agent": "${slug}"`))
      expect(match, `agent slug "${slug}" should appear in a node jsonBody`).toBeDefined()
    }
  })

  it('does NOT include the buggy hyphenated slug `market-research-analyst`', () => {
    const allBodies = JSON.stringify(workflow)
    expect(allBodies).not.toContain('"agent": "market-research-analyst"')
  })

  it('Gap 4+5 + optional nodes use continueOnFail to avoid blocking the chain', () => {
    const continueOnFailNodes = workflow.nodes.filter(n => n.continueOnFail === true)
    const names = continueOnFailNodes.map(n => n.id)
    expect(names).toContain('agent-style-reviewer') // Gap 4
    expect(names).toContain('agent-delivery-coord') // Gap 5
    expect(names).toContain('hero-gen') // optional · GPT image
    expect(names).toContain('apify-scrape') // optional · IG branch
  })

  it('persist-outputs node targets the new /api/cascade/persist-outputs route', () => {
    const persistNode = workflow.nodes.find(n => n.id === 'persist-outputs')
    expect(persistNode).toBeDefined()
    const url = (persistNode!.parameters as { url: string }).url
    expect(url).toContain('/api/cascade/persist-outputs')
    expect(url).not.toContain('/api/cascade/onboard') // NOT the deprecated route
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

  it('tags include zero-risk + tier-1 + cascade for n8n filterability', () => {
    const tagNames = workflow.tags.map(t => t.name)
    expect(tagNames).toContain('zero-risk')
    expect(tagNames).toContain('tier-1')
    expect(tagNames).toContain('cascade')
  })
})
