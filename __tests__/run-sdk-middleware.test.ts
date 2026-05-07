/**
 * run-sdk-middleware.test.ts · Sprint #2 P0 follow-up to slug normalization
 *
 * Verifies /api/agents/run-sdk integrates dual-reviewer middleware for agents
 * in EDITOR_WHITELIST · skips for reviewers self-call · skips header opt-out ·
 * skips non-whitelisted · graceful middleware failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../src/app/api/agents/run-sdk/route'

vi.mock('@/lib/agent-sdk-runner', () => ({
  runAgentViaSDK: vi.fn().mockResolvedValue({
    success: true,
    response: 'mocked agent output',
    sessionId: 'sess_test',
    model: 'claude-sonnet-4-6',
    inputTokens: 100,
    outputTokens: 200,
    costUsd: 0.005,
    durationMs: 1500,
  }),
}))

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: () => ({ ok: true }),
}))

vi.mock('@/lib/posthog', () => ({
  capture: vi.fn(),
}))

const mockMiddleware = vi.fn()
vi.mock('@/lib/editor-middleware', () => ({
  runDualReviewMiddleware: (...args: unknown[]) => mockMiddleware(...args),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({}),
}))

const buildReq = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/agents/run-sdk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  mockMiddleware.mockReset()
  mockMiddleware.mockResolvedValue({
    editor_review: { verdict: 'approved', severity: 'low' },
  })
})

describe('run-sdk · dual-review middleware', () => {
  it('triggers middleware for whitelist agents (content-creator)', async () => {
    const r = await POST(buildReq({ agent: 'content-creator', task: 'write copy' }))
    const j = await r.json()
    expect(mockMiddleware).toHaveBeenCalledOnce()
    expect(j.editor_review.verdict).toBe('approved')
    expect(j.success).toBe(true)
    expect(j.agent).toBe('content-creator')
  })

  it('triggers middleware for normalized underscore variants (email_marketer → email-marketer)', async () => {
    const r = await POST(buildReq({ agent: 'email_marketer', task: 'write email' }))
    expect(r.status).toBe(200)
    expect(mockMiddleware).toHaveBeenCalledOnce()
    const callArgs = mockMiddleware.mock.calls[0][0]
    expect(callArgs.agentSlug).toBe('email-marketer')
  })

  it('skips middleware for non-whitelist agents (jefe-marketing)', async () => {
    const r = await POST(buildReq({ agent: 'jefe-marketing', task: 'plan' }))
    const j = await r.json()
    expect(mockMiddleware).not.toHaveBeenCalled()
    expect(j.editor_review).toBeUndefined()
    expect(j.success).toBe(true)
  })

  it('skips middleware for reviewers themselves (editor-en-jefe self-call)', async () => {
    const r = await POST(buildReq({ agent: 'editor-en-jefe', task: 'review' }))
    expect(mockMiddleware).not.toHaveBeenCalled()
    expect(r.status).toBe(200)
  })

  it('skips middleware when x-skip-editor-middleware header is set', async () => {
    const r = await POST(
      buildReq({ agent: 'content-creator', task: 'write' }, { 'x-skip-editor-middleware': '1' }),
    )
    expect(mockMiddleware).not.toHaveBeenCalled()
    expect(r.status).toBe(200)
  })

  it('returns base response with editor_review.middleware_error when middleware throws', async () => {
    mockMiddleware.mockRejectedValue(new Error('boom'))
    const r = await POST(buildReq({ agent: 'content-creator', task: 'write' }))
    const j = await r.json()
    expect(j.success).toBe(true)
    expect(j.editor_review.verdict).toBe('middleware_error')
    expect(j.response).toBe('mocked agent output')
  })

  it('returns 500 if runAgentViaSDK fails (no middleware called)', async () => {
    const { runAgentViaSDK } = await import('@/lib/agent-sdk-runner')
    ;(runAgentViaSDK as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'sdk failed',
    })
    const r = await POST(buildReq({ agent: 'content-creator', task: 'write' }))
    expect(r.status).toBe(500)
    expect(mockMiddleware).not.toHaveBeenCalled()
  })
})
