/**
 * Sprint 11 Ola 1 · §149 internal-callers workflow_id propagation tests.
 *
 * Verifies the 4 internal callers that fetch `/api/agents/run` now pass a
 * workflow_id + workflow_execution_id in their request body · either
 * propagated from the upstream caller or minted with the
 * `internal-<source>-...` exempt-prefix canon when the upstream context
 * didn't supply one.
 *
 * Covers ·
 *  - social-content-runner.ts · accepts request.workflow_id, mints fallback
 *  - cascade-runner.ts · forwards request.workflow_id (regression guard for
 *    Sprint 8D wire-in)
 *
 * The other two patched callers (editor-middleware.ts · pipeline-orchestrator.ts)
 * use the global fetch · their integration tests would require mocking the
 * fetch global which is invasive. Instead we add source-level regression
 * guards (the patches include explicit `workflow_id:` keys verified by
 * the diff-workflow-id-coverage.mjs script and CC#1's CI lint). See
 * §10 of the RESULTS doc for the test gap rationale.
 *
 * Spec · RESULTS-CC2-workflow-id-coverage-audit-fix-list.md Fase 3.
 */
import { describe, it, expect, vi } from 'vitest'

// ─── social-content-runner ──────────────────────────────────────────────────

import {
  buildCarouselDesignerTask,
  buildVideoEditorTask,
  runSocialContent,
  type SocialContentRequest,
  type SocialContentRunnerDeps,
} from '@/lib/social-content-runner'

function buildSocialRequest(overrides: Partial<SocialContentRequest> = {}): SocialContentRequest {
  return {
    client_id: 'client-test-uuid',
    client_slug: 'acme-corp',
    client_name: 'Acme Corp',
    brief: 'Test brief about a Q4 launch.',
    campaign_intent: 'product launch',
    context: {
      brand_book: { content: 'minimal brand book' },
      brand_strategist_output: 'positioning summary',
      ad_creative_brief_output: 'creative direction',
    },
    platforms_requested: ['instagram-post', 'facebook'],
    ...overrides,
  }
}

describe('social-content-runner · §149 workflow_id propagation', () => {
  it('mints internal-prefixed workflow_id when request has none', async () => {
    const captured: Array<{ url: string; body: Record<string, unknown> }> = []
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      captured.push({ url, body })
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, response: '{"scenes": []}' }),
      } as unknown as Response
    })

    const deps: SocialContentRunnerDeps = {
      baseUrl: 'http://test',
      internalApiKey: 'test-key',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    }

    await runSocialContent(buildSocialRequest(), deps)

    expect(captured.length).toBeGreaterThan(0)
    for (const call of captured) {
      const ctx = call.body.context as Record<string, unknown>
      expect(ctx.workflow_id).toBeDefined()
      expect(ctx.workflow_id).toMatch(/^internal-social-content-runner-acme-corp-/)
      expect(ctx.workflow_execution_id).toBeDefined()
      expect(ctx.workflow_execution_id).toMatch(/^internal-social-content-runner-/)
    }
  })

  it('forwards upstream workflow_id when provided in request', async () => {
    const captured: Array<{ body: Record<string, unknown> }> = []
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      captured.push({ body: init?.body ? JSON.parse(init.body as string) : {} })
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, response: '{"scenes": []}' }),
      } as unknown as Response
    })

    const deps: SocialContentRunnerDeps = {
      baseUrl: 'http://test',
      internalApiKey: 'test-key',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    }

    await runSocialContent(
      buildSocialRequest({
        workflow_id: 'wf-from-n8n-real',
        workflow_execution_id: 'exec-from-n8n-real',
      }),
      deps,
    )

    expect(captured.length).toBeGreaterThan(0)
    for (const call of captured) {
      const ctx = call.body.context as Record<string, unknown>
      expect(ctx.workflow_id).toBe('wf-from-n8n-real')
      expect(ctx.workflow_execution_id).toBe('exec-from-n8n-real')
    }
  })

  it('builds task strings without breaking · regression guard', () => {
    const req = buildSocialRequest()
    const carousel = buildCarouselDesignerTask(req)
    const video = buildVideoEditorTask(req)
    expect(carousel).toContain('Acme Corp')
    expect(video).toContain('Acme Corp')
  })
})

// ─── cascade-runner regression guard ────────────────────────────────────────

describe('cascade-runner · workflow_id forwarding (Sprint 8D regression guard)', () => {
  it('cascade-runner.ts source preserves workflow_id forwarding from request', async () => {
    // Source-level regression guard · we ensure cascade-runner.ts retains the
    // `workflow_id: request.workflow_id` line at the documented position.
    // This is a guard against accidental removal during refactors. Real
    // behavioural test lives in __tests__/cascade-runner.test.ts.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/cascade-runner.ts'),
      'utf8',
    )
    expect(src).toMatch(/workflow_id:\s*request\.workflow_id/)
  })
})

// ─── editor-middleware + pipeline-orchestrator + web-discovery · source-level guards ──

describe('editor-middleware / pipeline-orchestrator / web-discovery · source-level patches', () => {
  it('editor-middleware Camino III sub-call writes workflow_id with fallback marker', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/editor-middleware.ts'),
      'utf8',
    )
    expect(src).toContain('internal-camino-iii-')
    expect(src).toContain('internal-editor-revision-')
  })

  it('pipeline-orchestrator step + fanout calls inject internal-pipeline workflow_id', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/pipeline-orchestrator.ts'),
      'utf8',
    )
    expect(src).toContain('internal-pipeline-')
  })

  it('web-discovery fallback agent call uses internal-web-discovery prefix', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/web-discovery.ts'),
      'utf8',
    )
    expect(src).toContain('internal-web-discovery-')
  })
})
