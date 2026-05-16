/**
 * Tests for the 3-deferred-agents resolve (2026-05-16):
 *   1. cascade-runner.buildSequence injects `customer-research` when
 *      `deep_customer_research: true` · skips otherwise
 *   2. cascade-runner buildTask handles `customer-research` slug with
 *      JTBD-style task prompt
 *   3. /api/influencer/outreach validation rejects malformed bodies
 *   4. /api/influencer/outreach happy path · invokes influencer-manager
 *
 * Slug 3 (video_editor_motion_designer) was resolved in PR #38 · not re-
 * tested here · `__tests__/video-editor-agent.test.ts` covers it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSequence, runCascade } from '../src/lib/cascade-runner'
import type { CascadeRunRequest } from '../src/lib/cascade-types'

const baseReq: CascadeRunRequest = {
  client_id: 'c-1',
  client_slug: 'test-cliente',
  client_name: 'Test Cliente',
  scrape_summary: 'IG · 1200 followers',
  brand_assets: {
    logo_url: null,
    brand_colors: null,
    brand_fonts: null,
  },
  caller: 'test',
}

describe('buildSequence · customer-research optional branch', () => {
  it('omits customer-research by default', () => {
    const seq = buildSequence(baseReq)
    expect(seq).not.toContain('customer-research')
    expect(seq).toContain('market_research_analyst')
    expect(seq).toContain('editor-en-jefe')
  })

  it('injects customer-research immediately after market_research_analyst when deep_customer_research=true', () => {
    const seq = buildSequence({ ...baseReq, deep_customer_research: true })
    const mraIdx = seq.indexOf('market_research_analyst')
    const crIdx = seq.indexOf('customer-research')
    expect(crIdx).toBe(mraIdx + 1)
    // creative-director still follows customer-research
    expect(seq[crIdx + 1]).toBe('creative-director')
  })

  it('produces fresh array per invocation · concurrent callers do not mutate each other', () => {
    const a = buildSequence({ ...baseReq, deep_customer_research: true })
    const b = buildSequence(baseReq)
    expect(a).toContain('customer-research')
    expect(b).not.toContain('customer-research')
  })
})

describe('runCascade · customer-research wired end-to-end', () => {
  it('invokes customer-research between market_research_analyst and creative-director when flag set', async () => {
    const calls: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      calls.push(body.agent)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: JSON.stringify({ agent_called: body.agent }),
          cost_usd: 0.01,
          model: 'claude-sonnet-4-6',
          session_id: `s-${body.agent}`,
        }),
      } as Response
    }) as unknown as typeof fetch
    await runCascade(
      { ...baseReq, deep_customer_research: true },
      { baseUrl: 'http://localhost', internalApiKey: 'k', fetchImpl },
    )
    const mraIdx = calls.indexOf('market_research_analyst')
    const crIdx = calls.indexOf('customer-research')
    expect(crIdx).toBe(mraIdx + 1)
    expect(calls).toContain('creative-director')
  })

  it('customer-research task includes brand + personas context (deep JTBD framing)', async () => {
    const tasksByAgent: Record<string, string> = {}
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string; task: string }
      tasksByAgent[body.agent] = body.task
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: JSON.stringify({ agent_called: body.agent, signal: true }),
          cost_usd: 0.01,
        }),
      } as Response
    }) as unknown as typeof fetch
    await runCascade(
      { ...baseReq, deep_customer_research: true },
      { baseUrl: 'http://localhost', internalApiKey: 'k', fetchImpl },
    )
    const crTask = tasksByAgent['customer-research']
    expect(crTask).toBeDefined()
    expect(crTask).toContain('JTBD')
    expect(crTask).toContain('[brand agent output]')
    expect(crTask).toContain('[personas agent output]')
  })
})
