/**
 * Sprint 9 cleanup NEW-A · /api/agents/log-invocation canonical tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth canon · x-api-key only
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: vi.fn((r: Request) => {
    const k = r.headers.get('x-api-key')
    return k === 'test-key' ? { ok: true } : { ok: false, reason: 'missing or invalid x-api-key' }
  }),
}))

// Mock supabase canon
const singleMock = vi.fn(async () => ({ data: { id: 'inv-canonical-uuid' }, error: null }))
const selectMock = vi.fn(() => ({ single: singleMock }))
const insertMock = vi.fn(() => ({ select: selectMock }))
const fromMock = vi.fn(() => ({ insert: insertMock }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: fromMock })),
}))

async function importRoute() {
  return import('../src/app/api/agents/log-invocation/route')
}

function makeReq(body: unknown, key = 'test-key'): Request {
  return new Request('https://example.com/api/agents/log-invocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  })
}

const HAPPY_BODY = {
  workflow_id: 'mc-daemon-health-canonical',
  workflow_execution_id: 'daemon-1779734398007',
  agent_name: 'health-check-daemon',
  agent_id: 'health-check-daemon',
  session_id: 'sess-canonical-uuid',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.0471,
  duration_ms: 15234,
  tokens_input: 4,
  tokens_output: 651,
  tokens_cache_read: 24196,
  tokens_cache_creation: 0,
  num_turns: 1,
  status: 'completed',
  response_text: 'Daemon health check OK · all services responsive.',
  metadata: {
    source: 'mission-control-daemon',
    caller_context: { daemon_health_check_id: 'hc-uuid' },
  },
}

describe('POST /api/agents/log-invocation · canon §149 enforcement', () => {
  beforeEach(() => {
    singleMock.mockClear()
    selectMock.mockClear()
    insertMock.mockClear()
    fromMock.mockClear()
  })

  it('rejects without x-api-key · 401', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(HAPPY_BODY, ''))
    expect(res.status).toBe(401)
    const j = await res.json()
    expect(j.code).toBe('E-AUTH-001')
  })

  it('rejects invalid JSON body · 400', async () => {
    const { POST } = await importRoute()
    const r = new Request('https://example.com/api/agents/log-invocation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: 'not-json',
    })
    const res = await POST(r)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-INPUT-PARSE')
  })

  it('rejects missing workflow_id · 403 canon §149 enforcement', async () => {
    const { POST } = await importRoute()
    const { workflow_id: _wf, ...rest } = HAPPY_BODY
    void _wf
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.code).toBe('E-WF-ID-REQUIRED')
    expect(j.detail).toContain('workflow_id')
  })

  it('rejects missing workflow_execution_id · 403 canon §149 enforcement', async () => {
    const { POST } = await importRoute()
    const { workflow_execution_id: _ex, ...rest } = HAPPY_BODY
    void _ex
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.code).toBe('E-WF-ID-REQUIRED')
    expect(j.detail).toContain('workflow_execution_id')
  })

  it('rejects missing agent_name · 400 E-LOG-INVOCATION-MISSING', async () => {
    const { POST } = await importRoute()
    const { agent_name: _an, ...rest } = HAPPY_BODY
    void _an
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-LOG-INVOCATION-MISSING')
  })

  it('rejects missing session_id · 400 E-LOG-INVOCATION-MISSING', async () => {
    const { POST } = await importRoute()
    const { session_id: _sid, ...rest } = HAPPY_BODY
    void _sid
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.code).toBe('E-LOG-INVOCATION-MISSING')
  })

  it('happy path · 200 with agent_invocation_id + canonical_pattern marker', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq(HAPPY_BODY))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.agent_invocation_id).toBe('inv-canonical-uuid')
    expect(j.canonical_pattern).toBe('log-invocation-local-session')
    expect(insertMock).toHaveBeenCalledOnce()
    const inserted = insertMock.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(inserted[0]!.workflow_id).toBe('mc-daemon-health-canonical')
    expect(inserted[0]!.agent_name).toBe('health-check-daemon')
    const meta = inserted[0]!.metadata as Record<string, unknown>
    expect(meta.canonical_pattern).toBe('log-invocation-local-session')
    expect(meta.logged_via).toBe('log-invocation-endpoint')
    expect(meta.source).toBe('mission-control-daemon')
  })

  it('truncates response_text > 2000 chars into output_summary', async () => {
    const { POST } = await importRoute()
    const longText = 'x'.repeat(2500)
    const res = await POST(makeReq({ ...HAPPY_BODY, response_text: longText }))
    expect(res.status).toBe(200)
    const inserted = insertMock.mock.calls[0]![0] as Array<Record<string, unknown>>
    const summary = inserted[0]!.output_summary as string
    expect(summary.length).toBe(2001)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('persist_failed · 500 E-PERSIST-FAILED on supabase error', async () => {
    singleMock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'unique violation canon' },
    }))
    const { POST } = await importRoute()
    const res = await POST(makeReq(HAPPY_BODY))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.code).toBe('E-PERSIST-FAILED')
  })
})
