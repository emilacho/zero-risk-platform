/**
 * Lo que termina EMPUJA · el manual entra al cerebro al terminar.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas afirmaciones tienen que FALLAR:
 *   1. «al escribirse el manual, se toca la puerta del cerebro con
 *      (client_id, client_brand_books, id de la fila)»
 *      → hoy: el escritor inserta la fila y devuelve el recibo. CERO referencias
 *        a embeber. Nunca falló porque nunca se llamó.
 *   2. «el recibo declara que se empujó»
 *      → hoy: `brain_push` no existe.
 *
 * ── LOS CONTROLES POSITIVOS ───────────────────────────────────────────────
 * Cuatro, y tienen que dar VERDE **hoy y después** · si alguno fallara hoy, el
 * instrumento estaría roto y los rojos no valdrían nada:
 *   · la fila del manual se escribe igual
 *   · se escribe igual aunque el cerebro esté caído
 *   · si el insert falla, no se empuja nada
 *   · si el manual ya existía (corte de idempotencia), no se empuja de nuevo
 * Si el manual dejara de guardarse, el arreglo sería peor que el defecto.
 *
 * ── EL CASO REAL ──────────────────────────────────────────────────────────
 * GoEuropeAdventure · fila del manual `5648b126` escrita 01-sep 20:29:11 ·
 * primeras fichas en el cerebro 02-sep 07:00:05 · **10 h 30 min** de demora,
 * puestas por el barrido diario. 3 secciones · $0,0000089.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  empujarManualAlCerebro,
  empujeHabilitado,
} from '../src/lib/brain/push-al-terminar'

const CLIENT = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const FILA = '5648b126-7b0c-4cb1-b5b4-90a3165c864f'

// ─── mock de Supabase ───
// La ruta hace DOS cosas contra `client_brand_books`:
//   1. corte de idempotencia · select().eq().order().limit().maybeSingle()
//   2. el insert          · insert().select().single()
// El mock cubre las dos · `existente` controla si ya había manual.
let existente: { id: string; gate_outcome: string } | null = null
const chain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: existente, error: null })),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => chain }) }))

// ─── mock de waitUntil · en prueba corremos la promesa a mano ───
const agendadas: Promise<unknown>[] = []
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => { agendadas.push(p) },
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  agendadas.length = 0
  existente = null
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  process.env.ZERO_RISK_API_URL = 'https://zero-risk-platform.vercel.app'
  delete process.env.BRAIN_PUSH_AL_TERMINAR
  global.fetch = fetchMock as unknown as typeof fetch
  chain.insert.mockReturnThis()
  chain.select.mockReturnThis()
  chain.eq.mockReturnThis()
  chain.order.mockReturnThis()
  chain.limit.mockReturnThis()
  chain.maybeSingle.mockImplementation(async () => ({ data: existente, error: null }))
  chain.single.mockResolvedValue({ data: { id: FILA, gate_outcome: 'paso_la_vara' }, error: null })
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true,"chunks_upserted":3}' } as unknown as Response)
})
afterEach(() => { vi.restoreAllMocks() })

async function loadRoute() {
  vi.resetModules()
  return await import('../src/app/api/brand-book/[clientId]/route')
}
function req(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/brand-book/' + CLIENT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-internal-key' },
    body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ clientId: CLIENT }) } as never
const cuerpo = { brand_book: { positioning: 'Único operador multi-actividad en Zermatt.' }, fidelity_passed: true }

describe('el empujador · aislado', () => {
  it('toca la puerta con la fila, la tabla y el cliente', async () => {
    const agendar = (p: Promise<unknown>) => { agendadas.push(p) }
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar })
    expect(r.estado).toBe('agendado')
    await Promise.all(agendadas)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://zero-risk-platform.vercel.app/api/brain/reembed-source-row')
    expect(opts.headers['x-api-key']).toBe('test-internal-key')
    expect(JSON.parse(opts.body)).toEqual({
      source_table: 'client_brand_books',
      source_id: FILA,
      client_id: CLIENT,
    })
  })

  it('sin id de fila no toca nada', () => {
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: null, fetchImpl: fetchMock as never, agendar: p => { agendadas.push(p) } })
    expect(r.estado).toBe('sin_fila')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('apagado por env · no toca nada y lo declara', () => {
    process.env.BRAIN_PUSH_AL_TERMINAR = 'false'
    expect(empujeHabilitado()).toBe(false)
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar: p => { agendadas.push(p) } })
    expect(r.estado).toBe('apagado')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un env ausente = ENCENDIDO · la regla es que empuje', () => {
    delete process.env.BRAIN_PUSH_AL_TERMINAR
    expect(empujeHabilitado()).toBe(true)
  })

  it('si la puerta se cae, NO lanza', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar: p => { agendadas.push(p) } })
    expect(r.estado).toBe('agendado')
    await expect(Promise.all(agendadas)).resolves.toBeDefined()
  })

  it('si la puerta contesta 500, NO lanza', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response)
    const r = empujarManualAlCerebro({ client_id: CLIENT, source_id: FILA, fetchImpl: fetchMock as never, agendar: p => { agendadas.push(p) } })
    await expect(Promise.all(agendadas)).resolves.toBeDefined()
    expect(r.estado).toBe('agendado')
  })
})

describe('POST /api/brand-book/[clientId] · el manual entra al cerebro al terminar', () => {
  it('🔴 ROJO 1 · al escribirse el manual se toca la puerta del cerebro', async () => {
    const { POST } = await loadRoute()
    await POST(req(cuerpo), ctx)
    await Promise.all(agendadas)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/brain/reembed-source-row')
    expect(JSON.parse(opts.body)).toEqual({
      source_table: 'client_brand_books',
      source_id: FILA,
      client_id: CLIENT,
    })
  })

  it('🔴 ROJO 2 · el recibo declara que se empujó', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(j.brain_push).toBeDefined()
    expect(j.brain_push.estado).toBe('agendado')
  })

  // 🟢 CONTROL POSITIVO · verde HOY y después. La fila se escribe igual.
  it('🟢 CONTROL POSITIVO · la fila del manual se escribe igual', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.persisted).toBe(true)
    expect(j.id).toBe(FILA)
    expect(j.client_id).toBe(CLIENT)
    expect(j.gate_outcome).toBe('paso_la_vara')
    expect(chain.insert).toHaveBeenCalledTimes(1)
  })

  it('🟢 el manual se guarda IGUAL aunque el cerebro no responda', async () => {
    fetchMock.mockRejectedValue(new Error('cerebro caído'))
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.persisted).toBe(true)
    expect(j.id).toBe(FILA)
    expect(chain.insert).toHaveBeenCalledTimes(1)
    await expect(Promise.all(agendadas)).resolves.toBeDefined()
  })

  it('🔴 ROJO 3 · el recibo NO espera al cerebro · vuelve antes de que el empuje termine', async () => {
    let resolver: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(r => { resolver = r }))  // nunca resuelve sola
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)   // si esperara, esto colgaría
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.brain_push.estado).toBe('agendado')
    resolver({ ok: true, status: 200, text: async () => '{}' })
  })

  it('🟢 si el insert FALLA, no se empuja nada', async () => {
    chain.single.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key' } })
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(res.status).toBe(500)
    expect(j.persisted).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('🟢 si el manual YA existía (corte de idempotencia), no se empuja de nuevo', async () => {
    existente = { id: FILA, gate_outcome: 'paso_la_vara' }
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.already_existed).toBe(true)
    expect(chain.insert).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('🔴 ROJO 4 · apagado por env · la fila se escribe y el recibo lo declara', async () => {
    process.env.BRAIN_PUSH_AL_TERMINAR = 'false'
    const { POST } = await loadRoute()
    const res = await POST(req(cuerpo), ctx)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.brain_push.estado).toBe('apagado')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
