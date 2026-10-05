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
    const inserted = (insertMock.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    expect(inserted[0]!.workflow_id).toBe('mc-daemon-health-canonical')
    expect(inserted[0]!.agent_name).toBe('health-check-daemon')
    const meta = inserted[0]!.metadata as Record<string, unknown>
    expect(meta.canonical_pattern).toBe('log-invocation-local-session')
    expect(meta.logged_via).toBe('log-invocation-endpoint')
    expect(meta.source).toBe('mission-control-daemon')
  })

  // 🔴 E92 · CC#3 · 2026-09-17 · el tope pasó de 2.000 a 100.000 (decisión de Lenovo · opción A).
  // El rojo que lo motivó, medido en E91: 39 de 115 filas desde el 1-ago estaban recortadas
  // (el descubridor 18 de 18 · peor caso 22.888 → 2.001) y sobre ese almacén no se puede
  // recuperar una respuesta ya pagada. Esta prueba fija el canon nuevo.
  it('E92 · una respuesta de 2.500 caracteres se guarda ENTERA (antes se cortaba a 2.001)', async () => {
    const { POST } = await importRoute()
    const texto = 'x'.repeat(2500)
    const res = await POST(makeReq({ ...HAPPY_BODY, response_text: texto }))
    expect(res.status).toBe(200)
    const inserted = (insertMock.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    const summary = inserted[0]!.output_summary as string
    expect(summary).toBe(texto)
    const meta = inserted[0]!.metadata as Record<string, unknown>
    expect(meta.response_truncated).toBe(false)
    expect(meta.response_length_real).toBe(2500)
    expect(meta.response_stored_length).toBe(2500)
  })

  it('E92 · el peor caso medido (22.888) entra entero', async () => {
    const { POST } = await importRoute()
    const texto = 'y'.repeat(22_888)
    await POST(makeReq({ ...HAPPY_BODY, response_text: texto }))
    const inserted = (insertMock.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    expect((inserted[0]!.output_summary as string).length).toBe(22_888)
    expect((inserted[0]!.metadata as Record<string, unknown>).response_truncated).toBe(false)
  })

  it('E92 · pasado el tope nuevo SÍ se recorta, y la fila lo DECLARA (nunca se lee como entera)', async () => {
    const { POST } = await importRoute()
    const texto = 'z'.repeat(100_001)
    await POST(makeReq({ ...HAPPY_BODY, response_text: texto }))
    const inserted = (insertMock.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0]
    const summary = inserted[0]!.output_summary as string
    expect(summary.length).toBe(100_001) // 100.000 + «…»
    expect(summary.endsWith('…')).toBe(true)
    const meta = inserted[0]!.metadata as Record<string, unknown>
    expect(meta.response_truncated).toBe(true)
    expect(meta.response_length_real).toBe(100_001)
    expect(meta.response_stored_length).toBe(100_001)
    expect(meta.response_max_chars).toBe(100_000)
  })

  it('persist_failed · 500 E-PERSIST-FAILED on supabase error', async () => {
    singleMock.mockImplementationOnce((async () => ({
      data: null,
      error: { message: 'unique violation canon' },
    })) as unknown as typeof singleMock extends (...args: infer A) => infer R ? (...args: A) => R : never)
    const { POST } = await importRoute()
    const res = await POST(makeReq(HAPPY_BODY))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.code).toBe('E-PERSIST-FAILED')
  })
})

// ── arreglo · `duration_ms` es una columna GENERADA en la base real: la ruta no debe enviarla ──────────────
// La base simulada de arriba aceptaba cualquier cosa, por eso esto nunca se vio (0 de 269 filas por esta ruta desde julio).
// Esta imita las reglas reales de `agent_invocations`: columna generada, NOT NULL, enteros y CHECK de `status`.
const NOT_NULL = ['session_id', 'agent_id', 'agent_name', 'model', 'started_at', 'cost_usd', 'num_turns', 'status']
const ENTERAS = ['tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_creation', 'num_turns', 'exit_code']
function comoLaBase(fila: Record<string, unknown>): string | null {
  if ('duration_ms' in fila) return 'cannot insert a non-DEFAULT value into column "duration_ms"'
  for (const k of NOT_NULL) if (fila[k] === null || fila[k] === undefined) return `null value in column "${k}" violates not-null constraint`
  for (const k of ENTERAS) if (fila[k] !== null && fila[k] !== undefined && !Number.isInteger(fila[k])) return `invalid input syntax for type integer (${k})`
  if (!['running', 'completed', 'failed', 'timeout'].includes(String(fila.status))) return 'violates check constraint agent_invocations_status_check'
  return null
}
function basePorReglas() {
  insertMock.mockImplementationOnce(((rows: Array<Record<string, unknown>>) => ({
    select: () => ({ single: async () => { const e = comoLaBase(rows[0]!); return e ? { data: null, error: { message: e } } : { data: { id: 'inv-1' }, error: null } } }),
  })) as unknown as typeof insertMock)
}
const CUERPO_DEL_PORTERO = {
  workflow_id: 'tVWeaqTTpqPUQl7Z', workflow_execution_id: '165030', agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: '165030',
  model: 'claude-sonnet-5-5', cost_usd: 0.03, duration_ms: 7000, tokens_input: 10000, tokens_output: 700, num_turns: 1, status: 'completed',
  client_id: 'prueba-portero', command: 'portero.razonar.prueba', response_text: '{}', metadata: { prueba: true, pasada: 1 },
}
const ultimaFila = () => (insertMock.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0][0]!

describe('POST /api/agents/log-invocation · el cuerpo del portero entra (columna generada duration_ms)', () => {
  beforeEach(() => { insertMock.mockClear() })

  it('NO envía `duration_ms` en la fila (la base la calcula de ended_at − started_at)', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(CUERPO_DEL_PORTERO))
    expect(ultimaFila()).not.toHaveProperty('duration_ms')
  })
  it('la duración NO se pierde: sin started_at, `started_at` = `ended_at` − duration_ms', async () => {
    const { POST } = await importRoute()
    await POST(makeReq({ ...CUERPO_DEL_PORTERO, ended_at: '2026-10-05T10:00:07.000Z' }))
    expect(ultimaFila().started_at).toBe('2026-10-05T10:00:00.000Z')
    expect(ultimaFila().ended_at).toBe('2026-10-05T10:00:07.000Z')
  })
  it('con la base simulada por reglas reales, el cuerpo del portero (bueno, de prueba, fallido y con timeout) da 200', async () => {
    const { POST } = await importRoute()
    for (const cuerpo of [
      CUERPO_DEL_PORTERO,
      { ...CUERPO_DEL_PORTERO, client_id: undefined },
      { ...CUERPO_DEL_PORTERO, status: 'failed', cost_usd: 0, tokens_input: 0, tokens_output: 0, error_message: 'boom' },
      { ...CUERPO_DEL_PORTERO, status: 'timeout', cost_usd: 0 },
    ]) {
      basePorReglas()
      const res = await POST(makeReq(cuerpo))
      expect(res.status, JSON.stringify(cuerpo)).toBe(200)
      expect((await res.json()).ok).toBe(true)
    }
  })
  it('conserva todo lo demás de la fila (cliente, costo, tokens, comando, marca de prueba)', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(CUERPO_DEL_PORTERO))
    expect(ultimaFila()).toMatchObject({ client_id: 'prueba-portero', cost_usd: 0.03, tokens_input: 10000, tokens_output: 700, num_turns: 1, status: 'completed', command: 'portero.razonar.prueba', agent_name: 'portero-del-cerebro', model: 'claude-sonnet-5-5' })
    expect((ultimaFila().metadata as Record<string, unknown>).prueba).toBe(true)
  })
  it('el cambio es SOLO ese campo: las demás columnas de la fila son las de antes', async () => {
    const { POST } = await importRoute()
    await POST(makeReq(CUERPO_DEL_PORTERO))
    expect(Object.keys(ultimaFila()).sort()).toEqual(['agent_id', 'agent_name', 'client_id', 'command', 'cost_usd', 'ended_at', 'error_message', 'exit_code', 'journey_id', 'metadata', 'model', 'num_turns', 'output_summary', 'session_id', 'started_at', 'status', 'task_id', 'tokens_cache_creation', 'tokens_cache_read', 'tokens_input', 'tokens_output', 'workflow_execution_id', 'workflow_id'])
  })
})
