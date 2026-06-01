/**
 * Sprint 11 Ola 1 · §149 patches · regression guard for SEO Rank-to-#1 v2
 * GUARD: Cannibalization Check node · workflow_id template injection.
 *
 * Pre-patch state · this node was the ONLY remaining "neither" classification
 * in the live-DIFF (post-backport state · 49 both + 1 neither pre-patch).
 * Backport-first reconciliation (PR #132) skipped this workflow per spec
 * "NO backportear ciego" because both live and canonical lacked the template.
 *
 * Post-patch state · canonical now has `workflow_id` + `workflow_execution_id`
 * template injection in the GUARD node's jsonBody. Live n8n still needs the
 * same patch via REST PUT · separate §144 dispatch · not this PR's scope.
 *
 * Detection canon · regex matches the canonical pattern used by the live-DIFF
 * script at scripts/sweep/diff-workflow-id-live-vs-canonical.mjs:
 *   - `\bworkflow_id\b` keyword + `\$workflow\.id` n8n template ref
 *   - `\bworkflow_execution_id\b` keyword + `\$execution\.id` template ref
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_PATH = join(
  process.cwd(),
  'n8n-workflows',
  'proposed-sesion27b',
  '03-seo-geo',
  '3-flagship-seo-rank-to-one-v2.json',
)

interface N8nNode {
  id: string
  name: string
  type: string
  parameters?: Record<string, unknown>
}

interface N8nWorkflow {
  name: string
  nodes: N8nNode[]
}

describe('n8n workflow · SEO Rank-to-#1 v2 UPGRADED · §149 GUARD wf_id template', () => {
  const workflow = JSON.parse(readFileSync(WORKFLOW_PATH, 'utf8')) as N8nWorkflow

  it('GUARD: Cannibalization Check node exists with id guard-cannibalization', () => {
    const guard = workflow.nodes.find(n => n.id === 'guard-cannibalization')
    expect(guard).toBeDefined()
    expect(guard?.name).toBe('GUARD: Cannibalization Check')
    expect(guard?.type).toBe('n8n-nodes-base.httpRequest')
  })

  it('GUARD node jsonBody contains workflow_id template injection (§149 canonical)', () => {
    const guard = workflow.nodes.find(n => n.id === 'guard-cannibalization')
    const jsonBody = (guard?.parameters as { jsonBody?: string } | undefined)?.jsonBody ?? ''
    expect(jsonBody).toMatch(/\bworkflow_id\b/)
    expect(jsonBody).toMatch(/\$workflow\.id/)
  })

  it('GUARD node jsonBody contains workflow_execution_id template injection', () => {
    const guard = workflow.nodes.find(n => n.id === 'guard-cannibalization')
    const jsonBody = (guard?.parameters as { jsonBody?: string } | undefined)?.jsonBody ?? ''
    expect(jsonBody).toMatch(/\bworkflow_execution_id\b/)
    expect(jsonBody).toMatch(/\$execution\.id/)
  })

  it('GUARD node still targets /api/agents/run-sdk endpoint canonical', () => {
    const guard = workflow.nodes.find(n => n.id === 'guard-cannibalization')
    const url = (guard?.parameters as { url?: string } | undefined)?.url ?? ''
    expect(url).toContain('/api/agents/run-sdk')
  })

  it('GUARD node preserves pre-existing client_id + task templating', () => {
    const guard = workflow.nodes.find(n => n.id === 'guard-cannibalization')
    const jsonBody = (guard?.parameters as { jsonBody?: string } | undefined)?.jsonBody ?? ''
    expect(jsonBody).toContain('client_id')
    expect(jsonBody).toContain('$json.client_id')
    expect(jsonBody).toContain('$json.domain')
    expect(jsonBody).toContain('seo-specialist')
  })
})
