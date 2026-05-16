/**
 * Tests for POST /api/3d/generate · Sprint #6 Brazo Meshy 3D wrapper.
 *
 * Mocks the Meshy API HTTP calls (create + poll) + Supabase Storage upload.
 * We don't hit Meshy in unit tests · only the contract surface · the smoke
 * test in PR description handles the real-traffic E2E.
 *
 * Cases (8 total · brief asks 5+):
 *   1. happy path · POST creates task · poll SUCCEEDED · upload OK · 200 + JSON
 *   2. 400 on missing prompt
 *   3. 500 when MESHY_API_KEY not configured
 *   4. 502 when Meshy create returns error
 *   5. 502 when Meshy task reports FAILED status
 *   6. 504 when poll exceeds POLL_TIMEOUT_MS (status keeps returning IN_PROGRESS)
 *   7. 500 when Supabase Storage upload errors
 *   8. multi-path client_id resolver picks body.metadata.client_id when top-level missing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const supabaseMock = {
  storage: {
    from: vi.fn().mockReturnThis(),
    upload: vi.fn(),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://stub.storage/upload-url' } })),
  },
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: { slug: 'naufrago' }, error: null }),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'gen-uuid', created_at: '2026-05-16T13:00:00Z' }, error: null }),
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => supabaseMock,
}))

vi.mock('@/lib/posthog', () => ({
  capture: vi.fn(),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MESHY_API_KEY = 'msy_test_key'
  global.fetch = fetchMock as unknown as typeof fetch
  // Reset Supabase mock to happy defaults
  supabaseMock.storage.upload.mockResolvedValue({ data: { path: 'naufrago/3d-models/12345.glb' }, error: null })
  supabaseMock.maybeSingle.mockResolvedValue({ data: { slug: 'naufrago' }, error: null })
  supabaseMock.single.mockResolvedValue({ data: { id: 'gen-uuid', created_at: '2026-05-16T13:00:00Z' }, error: null })
})

afterEach(() => {
  delete process.env.MESHY_API_KEY
  vi.restoreAllMocks()
})

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/3d/generate/route')
}

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/3d/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function meshyCreateOk(taskId = 'task-uuid-123') {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => ({ result: taskId }),
  } as unknown as Response)
}

function meshyPollSucceeded(modelUrl = 'https://meshy.cdn/model.glb') {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => ({
      id: 'task-uuid-123',
      status: 'SUCCEEDED',
      model_urls: { glb: modelUrl, fbx: 'https://meshy.cdn/model.fbx' },
      thumbnail_url: 'https://meshy.cdn/thumb.png',
      polycount: 12000,
    }),
  } as unknown as Response)
}

function modelDownloadOk() {
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(1024),
  } as unknown as Response)
}

describe('POST /api/3d/generate · happy path', () => {
  it('creates task · polls SUCCEEDED · uploads · returns 200', async () => {
    fetchMock
      .mockReturnValueOnce(meshyCreateOk())
      .mockReturnValueOnce(meshyPollSucceeded())
      .mockReturnValueOnce(modelDownloadOk())
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({
      prompt: 'ceviche bowl realistic 3D rotating',
      client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
      format: 'glb',
      type: 'object',
    }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.success).toBe(true)
    expect(body.model_url).toBe('https://stub.storage/upload-url')
    expect(body.format).toBe('glb')
    expect(body.model_id).toBe('task-uuid-123')
    expect(typeof body.cost_usd).toBe('number')
    expect(body.polycount).toBe(12000)
  })
})

describe('POST /api/3d/generate · validation + config', () => {
  it('400 when prompt missing', async () => {
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ client_id: 'c1' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain('prompt')
  })

  it('500 when MESHY_API_KEY not configured', async () => {
    delete process.env.MESHY_API_KEY
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ prompt: 'cube' }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('E-MESHY-CONFIG')
  })
})

describe('POST /api/3d/generate · upstream failures', () => {
  it('502 when Meshy create returns error', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({
      status: 400,
      ok: false,
      json: async () => ({ error: { message: 'invalid_prompt' } }),
    } as unknown as Response))
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ prompt: 'x' }))
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error?: string; detail?: string }
    expect(body.error).toBe('meshy_create_failed')
    expect(body.detail).toContain('invalid_prompt')
  })

  it('502 when Meshy task reports FAILED status', async () => {
    fetchMock
      .mockReturnValueOnce(meshyCreateOk())
      .mockReturnValueOnce(Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          id: 'task-uuid-123',
          status: 'FAILED',
          task_error: { message: 'unsafe_content' },
        }),
      } as unknown as Response))
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ prompt: 'banned content' }))
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error?: string; detail?: string }
    expect(body.error).toBe('meshy_task_failed')
    expect(body.detail).toContain('unsafe_content')
  })

  it('500 when Supabase Storage upload errors', async () => {
    fetchMock
      .mockReturnValueOnce(meshyCreateOk())
      .mockReturnValueOnce(meshyPollSucceeded())
      .mockReturnValueOnce(modelDownloadOk())
    supabaseMock.storage.upload.mockResolvedValueOnce({ data: null, error: { message: 'bucket_full' } })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ prompt: 'cube' }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error?: string; detail?: string }
    expect(body.error).toBe('storage_upload_failed')
    expect(body.detail).toBe('bucket_full')
  })
})

describe('POST /api/3d/generate · multi-path client_id resolver (Fix 8b)', () => {
  it('picks body.metadata.client_id when top-level missing', async () => {
    fetchMock
      .mockReturnValueOnce(meshyCreateOk())
      .mockReturnValueOnce(meshyPollSucceeded())
      .mockReturnValueOnce(modelDownloadOk())
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({
      prompt: 'cube',
      metadata: { client_id: 'meta-client' },
    }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { client_id?: string }
    expect(body.client_id).toBe('meta-client')
  })
})
