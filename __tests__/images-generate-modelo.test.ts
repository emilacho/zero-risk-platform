/**
 * Relevo 22 · POST /api/images/generate: modelo por entorno, costo real,
 * respuesta con url, y nada cambia para quien no usa el modelo nuevo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insert = vi.fn()
const upload = vi.fn()
const supabaseMock: any = {
  storage: { from: vi.fn(), upload, getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://stub/pub' } })) },
  from: vi.fn(),
  insert: (row: unknown) => {
    insert(row)
    return supabaseMock
  },
  select: vi.fn(),
  single: vi.fn(),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]).toString('base64')
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'sk-test'
  process.env.INTERNAL_API_KEY = 'k'
  delete process.env.IMAGE_MODEL
  global.fetch = fetchMock as unknown as typeof fetch
  supabaseMock.storage.from.mockImplementation(() => supabaseMock.storage)
  supabaseMock.storage.getPublicUrl.mockImplementation(() => ({ data: { publicUrl: 'https://stub/pub' } }))
  supabaseMock.from.mockImplementation(() => supabaseMock)
  supabaseMock.select.mockImplementation(() => supabaseMock)
  supabaseMock.single.mockResolvedValue({ data: { id: 'gen', created_at: '2026-10-09T00:00:00Z' }, error: null })
  upload.mockResolvedValue({ data: {}, error: null })
})
afterEach(() => {
  delete process.env.OPENAI_API_KEY
  delete process.env.IMAGE_MODEL
})

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/images/generate/route')
  return POST(
    new Request('http://x/api/images/generate', {
      method: 'POST',
      headers: { 'x-api-key': 'k', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
const openaiOk = (extra: Record<string, unknown> = {}) =>
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }], ...extra }) })
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)
const filaCon = (status: string) => insert.mock.calls.map((c) => c[0]).find((x) => x.status === status)

describe('POST /api/images/generate · modelo', () => {
  it('sin env ni body: gpt-image-1 y costo de la tabla vieja (nada cambia)', async () => {
    openaiOk()
    const j = await (await post({ prompt: 'un ceviche' })).json()
    expect(sentBody().model).toBe('gpt-image-1')
    expect('quality' in sentBody()).toBe(false)
    expect(j.cost_usd).toBe(0.04)
  })

  it('IMAGE_MODEL cambia el modelo por defecto sin tocar código', async () => {
    process.env.IMAGE_MODEL = 'gpt-image-2.5-flare'
    openaiOk()
    const j = await (await post({ prompt: 'un ceviche' })).json()
    expect(sentBody().model).toBe('gpt-image-2.5-flare')
    expect(j.model).toBe('gpt-image-2.5-flare')
    expect(j.cost_usd).toBe(0.0138)
    expect(j.cost_basis).toBe('estimate')
  })

  it('body.model gana sobre IMAGE_MODEL', async () => {
    process.env.IMAGE_MODEL = 'gpt-image-2.5-flare'
    openaiOk()
    await post({ prompt: 'x', model: 'gpt-image-1' })
    expect(sentBody().model).toBe('gpt-image-1')
  })

  it('usa el usage de la respuesta para el costo real y lo guarda en la fila', async () => {
    openaiOk({ usage: { input_tokens: 135, output_tokens: 439, input_tokens_details: { text_tokens: 135, image_tokens: 0 } } })
    const j = await (await post({ prompt: 'x', model: 'gpt-image-2.5-flare', quality: 'medium' })).json()
    expect(sentBody().quality).toBe('medium')
    expect(j.cost_usd).toBe(0.013845)
    expect(j.cost_basis).toBe('usage')
    const fila = filaCon('completed')
    expect(fila.cost_usd).toBe(0.013845)
    expect(fila.raw_response.cost_basis).toBe('usage')
  })

  it('quality inválida no se manda', async () => {
    openaiOk()
    await post({ prompt: 'x', quality: 'ultra; drop' })
    expect('quality' in sentBody()).toBe(false)
  })

  it('acepta respuesta con url (sin b64) y sube con el formato real', async () => {
    const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1])
    fetchMock
      .mockResolvedValueOnce({ status: 200, json: async () => ({ data: [{ url: 'https://cdn.openai.example/i.jpg' }] }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array(JPG).buffer })
    const r = await post({ prompt: 'x' })
    expect(r.status).toBe(200)
    const [path, , opts] = upload.mock.calls[0]
    expect(path.endsWith('.jpg')).toBe(true)
    expect(opts.contentType).toBe('image/jpeg')
  })

  it('respuesta 200 sin imagen: falla registrada, no éxito', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ data: [{}] }) })
    const r = await post({ prompt: 'x' })
    expect(r.status).toBe(502)
    const fila = filaCon('failed')
    expect(fila.error_message).toBe('no_image_in_response')
    expect(fila.cost_usd).toBe(0)
  })

  it('GET informa el modelo por defecto vigente', async () => {
    process.env.IMAGE_MODEL = 'gpt-image-2.5-flare'
    const { GET } = await import('@/app/api/images/generate/route')
    expect((await (await GET()).json()).model).toBe('gpt-image-2.5-flare')
  })
})
