/**
 * SPRINT 1 · MEJORA 3 (GO-LENOVO 16-nov) · POST /api/images/generate con `reference_image_url`: edita SOBRE la foto real del cliente
 * (`/v1/images/edits`, multipart) para conservar el producto; si la foto no se puede usar, genera igual y lo dice. Sin red: fetch simulado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bajarFoto, promptDeEdicion, referenciaPermitida, tipoDeFoto } from '@/lib/imagen-sobre-foto'

const insert = vi.fn()
const upload = vi.fn()
const supabaseMock: any = {
  storage: { from: vi.fn(), upload, getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://stub/pub' } })) },
  from: vi.fn(),
  insert: (row: unknown) => { insert(row); return supabaseMock },
  select: vi.fn(),
  single: vi.fn(),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))

const SUPA = 'https://proyecto.supabase.co'
const FOTO_URL = `${SUPA}/storage/v1/object/public/client-social-images/cliente/foto.jpg`
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]).toString('base64')
const fetchMock = vi.fn()

const respuesta = (status: number, j: unknown) => ({ status, ok: status < 400, json: async () => j }) as unknown as Response
const fotoOk = (bytes = JPG) => ({ status: 200, ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }) as unknown as Response
const imagenOk = () => respuesta(200, { data: [{ b64_json: PNG_B64 }], usage: { input_tokens: 1500, output_tokens: 439, input_tokens_details: { text_tokens: 38, image_tokens: 1462 } } })

/** responde según la dirección: la foto, la edición o la generación */
function red(o: { foto?: () => Response; edits?: () => Response; generations?: () => Response } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === FOTO_URL || url.startsWith('https://otro')) return (o.foto ?? (() => fotoOk()))()
    if (url.endsWith('/v1/images/edits')) return (o.edits ?? imagenOk)()
    if (url.endsWith('/v1/images/generations')) return (o.generations ?? imagenOk)()
    throw new Error(`dirección inesperada ${url}`)
  })
}
const llamadasA = (fin: string) => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith(fin))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'sk-test'
  process.env.INTERNAL_API_KEY = 'k'
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA
  global.fetch = fetchMock as unknown as typeof fetch
  supabaseMock.storage.from.mockImplementation(() => supabaseMock.storage)
  supabaseMock.storage.getPublicUrl.mockImplementation(() => ({ data: { publicUrl: 'https://stub/pub' } }))
  supabaseMock.from.mockImplementation(() => supabaseMock)
  supabaseMock.select.mockImplementation(() => supabaseMock)
  supabaseMock.single.mockResolvedValue({ data: { id: 'gen', created_at: '2026-11-16T00:00:00Z' }, error: null })
  upload.mockResolvedValue({ data: {}, error: null })
})
afterEach(() => { delete process.env.OPENAI_API_KEY; delete process.env.NEXT_PUBLIC_SUPABASE_URL })

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/images/generate/route')
  const r = await POST(new Request('http://x/api/images/generate', { method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: r.status, j: (await r.json()) as Record<string, any> }
}
const filaGuardada = () => insert.mock.calls.map((c) => c[0]).find((x) => x.status === 'completed')

describe('con foto del cliente: se EDITA sobre la foto', () => {
  it('🔴 llama a /v1/images/edits con la foto como `image` y el pedido de conservar el producto; dice `referencia.usada`', async () => {
    red()
    const { status, j } = await post({ prompt: 'mesa de madera junto al mar, luz de tarde', reference_image_url: FOTO_URL, model: 'gpt-image-2.5-flare', quality: 'medium' })
    expect(status).toBe(200)
    expect(j.referencia).toEqual({ usada: true })
    expect(llamadasA('/v1/images/generations')).toHaveLength(0)
    const [[, init]] = llamadasA('/v1/images/edits')
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-flare')
    expect(form.get('quality')).toBe('medium')
    expect(String(form.get('prompt'))).toBe(promptDeEdicion('mesa de madera junto al mar, luz de tarde'))
    const img = form.get('image') as File
    expect(img.type).toBe('image/jpeg')
    expect(Buffer.from(await img.arrayBuffer())).toEqual(JPG)
    expect(init.headers['Content-Type']).toBeUndefined() // multipart: el límite lo pone fetch
    // el costo real incluye los tokens de la foto de entrada, y la fila guarda que se editó sobre ella
    expect(j.cost_basis).toBe('usage')
    expect(filaGuardada().raw_response.referencia).toEqual({ usada: true, url: FOTO_URL })
  })
  it('🔴 sin `reference_image_url` nada cambia: genera y la respuesta no trae `referencia`', async () => {
    red()
    const { j } = await post({ prompt: 'p' })
    expect(llamadasA('/v1/images/edits')).toHaveLength(0)
    expect(llamadasA('/v1/images/generations')).toHaveLength(1)
    expect(j).not.toHaveProperty('referencia')
    expect(filaGuardada().raw_response).not.toHaveProperty('referencia')
  })
})

describe('sin rejas: si la foto no sirve, se genera igual y se dice por qué', () => {
  it('🔴 una dirección fuera del almacén del proyecto NO se baja (la ruta no sale a buscar archivos a donde le digan)', async () => {
    red()
    const { status, j } = await post({ prompt: 'p', reference_image_url: 'https://otro.ejemplo/foto.jpg' })
    expect(status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('https://otro'))).toBe(false)
    expect(llamadasA('/v1/images/generations')).toHaveLength(1)
    expect(j.referencia).toMatchObject({ usada: false })
    expect(j.referencia.motivo).toMatch(/almacén del proyecto/)
  })
  it('🔴 la foto no baja (404) o no es imagen → genera sin ella', async () => {
    for (const foto of [() => respuesta(404, {}), () => fotoOk(Buffer.from('<html>no</html>'))]) {
      vi.clearAllMocks(); red({ foto })
      const { status, j } = await post({ prompt: 'p', reference_image_url: FOTO_URL })
      expect(status).toBe(200)
      expect(llamadasA('/v1/images/edits')).toHaveLength(0)
      expect(llamadasA('/v1/images/generations')).toHaveLength(1)
      expect(j.referencia.usada).toBe(false)
    }
  })
  it('🔴 OpenAI rechaza la edición (400) → genera sin la foto, una sola vez, y el motivo lleva el estado y el mensaje', async () => {
    red({ edits: () => respuesta(400, { error: { message: 'Invalid image' } }) })
    const { status, j } = await post({ prompt: 'p', reference_image_url: FOTO_URL })
    expect(status).toBe(200)
    expect(llamadasA('/v1/images/edits')).toHaveLength(1)
    expect(llamadasA('/v1/images/generations')).toHaveLength(1)
    expect(j.referencia.usada).toBe(false)
    expect(j.referencia.motivo).toMatch(/400 · Invalid image/)
  })
  it('si la generación de respaldo también falla, el error es el de siempre (sin imagen inventada)', async () => {
    red({ edits: () => respuesta(400, {}), generations: () => respuesta(500, { error: { message: 'caído' } }) })
    const { status, j } = await post({ prompt: 'p', reference_image_url: FOTO_URL })
    expect(status).toBe(502)
    expect(j.error).toBe('openai_image_failed')
  })
})

describe('piezas puras', () => {
  it('🔴 solo el almacén público del proyecto, por https y sin «..»', () => {
    expect(referenciaPermitida(FOTO_URL, SUPA)).toBe(true)
    expect(referenciaPermitida(FOTO_URL.replace('https', 'http'), SUPA)).toBe(false)
    expect(referenciaPermitida(`${SUPA}/rest/v1/clients`, SUPA)).toBe(false)
    expect(referenciaPermitida('https://otro.supabase.co/storage/v1/object/public/x.jpg', SUPA)).toBe(false)
    expect(referenciaPermitida(FOTO_URL, undefined)).toBe(false)
    expect(referenciaPermitida('no es url', SUPA)).toBe(false)
  })
  it('🔴 el tipo sale de los bytes, no de la cabecera', () => {
    expect(tipoDeFoto(JPG)).toBe('image/jpeg')
    expect(tipoDeFoto(Buffer.from(PNG_B64, 'base64'))).toBe('image/png')
    expect(tipoDeFoto(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('image/webp')
    expect(tipoDeFoto(Buffer.from('GIF89a'))).toBeNull()
  })
  it('🔴 una foto demasiado pesada o vacía no se usa', async () => {
    const grande = { status: 200, ok: true, arrayBuffer: async () => new ArrayBuffer(20 * 1024 * 1024 + 1) } as unknown as Response
    const g = await bajarFoto(async () => grande, FOTO_URL)
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.motivo).toMatch(/pesa 20971521 bytes/)
    // justo en el tope sí baja (si es imagen)
    const justo = Buffer.concat([JPG, Buffer.alloc(20 * 1024 * 1024 - JPG.length)])
    expect((await bajarFoto(async () => fotoOk(justo), FOTO_URL)).ok).toBe(true)
    const v = await bajarFoto(async () => fotoOk(Buffer.alloc(0)), FOTO_URL)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toBe('la foto vino vacía')
  })
  it('🔴 el pedido de edición conserva el producto, cambia solo la escena y prohíbe copiar textos de la foto', () => {
    const t = promptDeEdicion('escena X')
    expect(t).toMatch(/Keep the product exactly as it appears/)
    expect(t).toMatch(/Change only the scene/)
    expect(t).toMatch(/Do not reproduce any text, label, logo/)
    expect(t.endsWith('escena X')).toBe(true)
  })
})
