/**
 * Relevo 41 · EL COSTO DE LAS IMÁGENES ENTRA AL LIBRO DE INVOCACIONES (una sola vez por imagen) y el freno §150 lo ve.
 * Antes: solo `agent_image_generations`; el freno suma `agent_invocations.cost_usd` por cliente en 24 h y no veía las imágenes. US$ 0, sin red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FLUJO_DE_IMAGENES, filaDeInvocacionDeImagen, registrarImagenEnElLibro, type DatosDeImagen } from '../src/lib/image-ledger'
import { checkRunSdkSpendCap } from '../src/lib/run-sdk-spend-gate'

// ───────── una base falsa con tablas de verdad: lo que se inserta se puede volver a leer
type Fila = Record<string, any>
const tablas: Record<string, Fila[]> = {}
let falla: Record<string, string> = {}
let ultimoId = 'gen-1'
function cadena(t: string): any {
  let filtros: Array<(f: Fila) => boolean> = []
  const q: any = {}
  q.select = () => q
  q.eq = (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q }
  q.in = (c: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[c])); return q }
  q.is = (c: string, v: unknown) => { filtros.push((f) => (f[c] ?? null) === v); return q }
  q.gte = (c: string, v: string) => { filtros.push((f) => String(f[c]) >= v); return q }
  q.or = () => q
  q.maybeSingle = async () => ({ data: null, error: null })
  q.single = async () => ({ data: { id: ultimoId, created_at: '2026-10-10T10:00:00Z' }, error: null })
  q.insert = (row: Fila) => {
    if (falla[t]) return Object.assign(Promise.resolve({ error: { message: falla[t] } }), { select: () => q })
    if (row.id) ultimoId = String(row.id)
    ;(tablas[t] ??= []).push({ ...row })
    return Object.assign(Promise.resolve({ error: null }), { select: () => q })
  }
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: (tablas[t] ?? []).filter((f) => filtros.every((p) => p(f))), error: null }).then(r)
  return q
}
const bd: any = { from: (t: string) => cadena(t), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://stub/pub' } }) }) } }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => bd }))
vi.mock('@/lib/posthog', () => ({ capture: vi.fn() }))

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]).toString('base64')
const fetchMock = vi.fn()
beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k]
  falla = {}
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.INTERNAL_API_KEY = 'k'; delete process.env.IMAGE_MODEL
  delete process.env.RUN_SPEND_CAP_ENFORCE; delete process.env.RUN_SPEND_CAP_USD
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }] }) })
})
afterEach(() => { delete process.env.OPENAI_API_KEY })

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/images/generate/route')
  return POST(new Request('http://x/api/images/generate', { method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}
const datos = (o: Partial<DatosDeImagen> = {}): DatosDeImagen => ({ generationId: 'g1', clientId: 'c1', agentSlug: 'design-image-prompt-engineer', model: 'gpt-image-1', size: '1024x1024', quality: 'medium', caller: 'oficina', costUsd: 0.0138, costBasis: 'usage', startedAtMs: 1_000, endedAtMs: 4_000, ...o })

describe('la fila del libro', () => {
  it('una imagen que costó deja una fila con su costo, su cliente y su generation_id (una sola vez: session_id propio)', () => {
    const f = filaDeInvocacionDeImagen(datos())!
    expect(f).toMatchObject({ session_id: 'img-g1', agent_name: 'design-image-prompt-engineer', client_id: 'c1', cost_usd: 0.0138, status: 'completed', model: 'gpt-image-1', workflow_execution_id: 'g1' })
    expect(f.metadata).toMatchObject({ kind: 'image_generation', generation_id: 'g1', cost_basis: 'usage', quality: 'medium', caller: 'oficina' })
  })
  it('workflow_id nunca queda NULL (el §149 lo exige): si el llamador no manda uno, el marcador de la ruta; si manda, el suyo', () => {
    expect(filaDeInvocacionDeImagen(datos())!.workflow_id).toBe(FLUJO_DE_IMAGENES)
    const f = filaDeInvocacionDeImagen(datos({ workflowId: 'wf-1', workflowExecutionId: 'ex-9' }))!
    expect(f).toMatchObject({ workflow_id: 'wf-1', workflow_execution_id: 'ex-9' })
  })
  it('sin agente, la fila se llama image-generation; sin cliente, client_id es NULL (cubo system)', () => {
    expect(filaDeInvocacionDeImagen(datos({ agentSlug: null, clientId: null }))).toMatchObject({ agent_name: 'image-generation', client_id: null })
  })
  it('una imagen que no costó nada (o con un costo raro) NO deja fila', () => {
    for (const c of [0, -1, NaN, Infinity * 0]) expect(filaDeInvocacionDeImagen(datos({ costUsd: c }))).toBeNull()
  })
})

describe('registrar: nunca frena la imagen', () => {
  it('escribe una fila; si la base falla, no lanza y lo dice', async () => {
    const ok = await registrarImagenEnElLibro(bd, datos())
    expect(ok).toEqual({ ok: true }); expect(tablas['agent_invocations']).toHaveLength(1)
    falla['agent_invocations'] = 'permiso denegado'
    const mal = await registrarImagenEnElLibro(bd, datos({ generationId: 'g2' }))
    expect(mal).toMatchObject({ ok: false, error: 'permiso denegado' })
  })
  it('costo 0 ⇒ omitida, sin escribir', async () => {
    expect(await registrarImagenEnElLibro(bd, datos({ costUsd: 0 }))).toEqual({ ok: true, omitida: true })
    expect(tablas['agent_invocations'] ?? []).toHaveLength(0)
  })
})

describe('la ruta POST /api/images/generate', () => {
  it('🔴 una imagen generada ⇒ UNA fila en agent_images y UNA en agent_invocations, con el mismo costo', async () => {
    const r = await (await post({ prompt: 'un plato', client_id: 'c1', agent_slug: 'design-image-prompt-engineer', size: '1024x1024', quality: 'medium', caller: 'oficina' })).json()
    expect(r.success).toBe(true)
    expect(tablas['agent_image_generations']).toHaveLength(1)
    expect(tablas['agent_invocations']).toHaveLength(1)
    expect(tablas['agent_invocations'][0].cost_usd).toBe(tablas['agent_image_generations'][0].cost_usd)
    expect(tablas['agent_invocations'][0]).toMatchObject({ client_id: expect.any(String), session_id: expect.stringMatching(/^img-/), agent_name: 'design-image-prompt-engineer' })
    expect(tablas['agent_invocations'][0].cost_usd).toBeGreaterThan(0)
  })
  it('dos imágenes ⇒ dos filas distintas (una por imagen), cada una atada a su generation_id', async () => {
    await post({ prompt: 'a', client_id: 'c1' }); await post({ prompt: 'b', client_id: 'c1' })
    const filas = tablas['agent_invocations']
    expect(filas).toHaveLength(2)
    expect(new Set(filas.map((f) => f.session_id)).size).toBe(2)
    expect(filas.every((f) => f.session_id === `img-${f.metadata.generation_id}`)).toBe(true)
  })
  it('un workflow_id y workflow_execution_id en el cuerpo pasan a la fila', async () => {
    await post({ prompt: 'a', client_id: 'c1', workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' })
    expect(tablas['agent_invocations'][0]).toMatchObject({ workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' })
  })
  it('una imagen que FALLÓ (OpenAI devuelve error) no deja fila de costo', async () => {
    fetchMock.mockResolvedValue({ status: 500, json: async () => ({ error: { message: 'caído' } }) })
    const res = await post({ prompt: 'a', client_id: 'c1' })
    expect(res.status).toBe(502)
    expect(tablas['agent_invocations'] ?? []).toHaveLength(0)
  })
  it('si la base del libro falla, la imagen se entrega igual (el trabajo pagado no se pierde)', async () => {
    falla['agent_invocations'] = 'sin permiso'
    const r = await (await post({ prompt: 'a', client_id: 'c1' })).json()
    expect(r.success).toBe(true); expect(r.image_url).toBeTruthy()
  })
})

describe('🔴 el freno §150 VE el gasto en imágenes', () => {
  it('imágenes que suman más que el techo de 24 h bloquean la siguiente corrida del cliente (antes: pasaba como si hubieran costado 0)', async () => {
    process.env.RUN_SPEND_CAP_USD = '0.05'
    const ahora = Date.now()
    // la fila llega por la ruta real; el freno lee el mismo libro
    for (let i = 0; i < 4; i++) await post({ prompt: `p${i}`, client_id: 'c1', size: '1024x1024' })
    const hoy: Fila[] = (tablas['agent_invocations'] ?? []).map((f) => ({ ...f, started_at: new Date(ahora).toISOString() }))
    tablas['agent_invocations'] = hoy
    const gasto = hoy.reduce((a, f) => a + Number(f.cost_usd), 0)
    expect(gasto).toBeGreaterThan(0.05)
    const r = await checkRunSdkSpendCap(bd, 'c1', { nowMs: ahora, runId: 'otra-corrida' })
    expect(r.blocked).toBe(true); expect(r.reason).toBe('over_cap'); expect(r.spent_usd).toBeCloseTo(gasto, 6)
  })
  it('y sin esas filas el mismo cliente pasa (la diferencia la hace el libro)', async () => {
    process.env.RUN_SPEND_CAP_USD = '0.05'
    const r = await checkRunSdkSpendCap(bd, 'c1', { nowMs: Date.now(), runId: 'otra-corrida' })
    expect(r.blocked).toBe(false)
  })
})
