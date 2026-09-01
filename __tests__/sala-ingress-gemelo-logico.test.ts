/**
 * El cierre del alta se escribió DOS VECES · guardia de gemelo lógico.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas dos afirmaciones tienen que FALLAR:
 *   1. «si otro escritor ya registró el mismo hecho lógico, la puerta de
 *      ingreso NO agrega una segunda fila»
 *      → hoy: agrega. Las dos filas tienen `operation_type` distinto, la llave
 *        de idempotencia mezcla ese campo, y la restricción UNIQUE no se entera.
 *   2. «la respuesta devuelve el `event_id` que YA existía, marcado como
 *      duplicado suprimido»
 *      → hoy: devuelve un `event_id` nuevo, el de la fila de más.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * «sin gemelo, la fila se escribe igual que siempre» tiene que dar VERDE hoy y
 * después. Si diera rojo hoy, el instrumento está roto y el rojo no vale nada.
 *
 * ── EL CASO REAL QUE LO ORIGINA ───────────────────────────────────────────
 * Corrida real GoEuropeAdventure · 2026-09-01 · `step_id = journey_completed`:
 *   de6fd02b  20:29:20.151  sala-callback.run_completed
 *   07423885  20:29:21.218  sala-ingress.journey_completed.completed
 * tenant, client, stream, correlación, event_type y step_id · IDÉNTICOS.
 * El caso 3 usa esos valores exactos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findLogicalTwin } from '../src/lib/sala-event-log-twin-guard'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

// ─── filas que "ya están" en sala_event_log, para el guardia ───
let existingRows: Array<Record<string, string>> = []
let twinQueryShouldFail = false

function eventLogQuery() {
  const filters: Record<string, string> = {}
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: string) => {
      filters[col] = val
      return chain
    }),
    limit: vi.fn(async () => {
      if (twinQueryShouldFail) return { data: null, error: { message: 'boom' } }
      const hit = existingRows.filter((r) =>
        Object.entries(filters).every(([k, v]) => r[k] === v),
      )
      return { data: hit.slice(0, 1), error: null }
    }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: () => eventLogQuery() })),
}))

let sharedStorage: InMemoryEventLogStorage

vi.mock('@/lib/sala-event-log', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/sala-event-log')>('@/lib/sala-event-log')
  return {
    ...actual,
    SupabaseEventLogStorage: class FakeStorage implements EventLogStorage {
      insert(input: Parameters<EventLogStorage['insert']>[0]) {
        return sharedStorage.insert(input)
      }
      select(filters: Parameters<EventLogStorage['select']>[0]) {
        return sharedStorage.select(filters)
      }
      findByIdempotencyKey(tenant_id: string, idempotency_key: string) {
        return sharedStorage.findByIdempotencyKey(tenant_id, idempotency_key)
      }
    },
  }
})

vi.mock('@/lib/sala-journey-dispatch/reconciliation', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/sala-journey-dispatch/reconciliation')
  >('@/lib/sala-journey-dispatch/reconciliation')
  return { ...actual, postReconciliationAlert: vi.fn(async () => {}) }
})

// Valores EXACTOS de la corrida real del 01-sep.
const TENANT = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const CLIENT = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const STREAM = '81f322e7-d7ae-4e50-9604-f1d70b8f45ed'
const CORREL = '50b9d170-cbc6-4e17-a95f-438eddb427fc'
const EVENT_ID_CALLBACK = 'de6fd02b-a642-4922-980c-20d7418b2f3c'

function makeReq(body: unknown): Request {
  return new Request('https://example.com/api/sala/ingress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-internal-key' },
    body: JSON.stringify(body),
  })
}

function phaseBoundary(phase_name: string) {
  return {
    event_type: 'phase_boundary',
    _sala_correlation_id: CORREL,
    _journey_id: STREAM,
    phase_name,
    phase_state: 'completed',
    worker_id: 'LyVoKcrypS5uLyuu',
    tenant_id: TENANT,
    client_id: CLIENT,
    ts: '2026-09-01T20:29:21.218Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  existingRows = []
  twinQueryShouldFail = false
  sharedStorage = new InMemoryEventLogStorage()
  process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  delete process.env.SALA_INGRESS_API_KEY
})

async function importRoute() {
  return import('../src/app/api/sala/ingress/route')
}

describe('guardia de gemelo lógico · función aislada', () => {
  it('encuentra el gemelo mirando el HECHO, no al escritor', async () => {
    existingRows = [
      {
        event_id: EVENT_ID_CALLBACK,
        operation_type: 'sala-callback.run_completed',
        tenant_id: TENANT,
        stream_id: STREAM,
        correlation_id: CORREL,
        step_id: 'journey_completed',
        event_type: 'step_completed',
      },
    ]
    const supabase = { from: () => eventLogQuery() } as never
    const r = await findLogicalTwin(supabase, {
      tenant_id: TENANT,
      stream_id: STREAM,
      correlation_id: CORREL,
      step_id: 'journey_completed',
      event_type: 'step_completed',
    })
    expect(r.found).toBe(true)
    expect(r.event_id).toBe(EVENT_ID_CALLBACK)
    expect(r.operation_type).toBe('sala-callback.run_completed')
    expect(r.degraded).toBe(false)
  })

  it('otra corrida (correlación distinta) NO es gemelo', async () => {
    existingRows = [
      {
        event_id: EVENT_ID_CALLBACK,
        operation_type: 'sala-callback.run_completed',
        tenant_id: TENANT,
        stream_id: STREAM,
        correlation_id: 'otra-correlacion',
        step_id: 'journey_completed',
        event_type: 'step_completed',
      },
    ]
    const supabase = { from: () => eventLogQuery() } as never
    const r = await findLogicalTwin(supabase, {
      tenant_id: TENANT,
      stream_id: STREAM,
      correlation_id: CORREL,
      step_id: 'journey_completed',
      event_type: 'step_completed',
    })
    expect(r.found).toBe(false)
    expect(r.degraded).toBe(false)
  })

  it('un fallo de consulta NO lanza · found:false + degraded:true', async () => {
    twinQueryShouldFail = true
    const supabase = { from: () => eventLogQuery() } as never
    const r = await findLogicalTwin(supabase, {
      tenant_id: TENANT,
      stream_id: STREAM,
      correlation_id: CORREL,
      step_id: 'journey_completed',
      event_type: 'step_completed',
    })
    expect(r.found).toBe(false)
    expect(r.degraded).toBe(true)
  })
})

describe('POST /api/sala/ingress · el cierre no se escribe dos veces', () => {
  it('🔴 ROJO 1 · con un gemelo ya escrito, NO se agrega una segunda fila', async () => {
    existingRows = [
      {
        event_id: EVENT_ID_CALLBACK,
        operation_type: 'sala-callback.run_completed',
        tenant_id: TENANT,
        stream_id: STREAM,
        correlation_id: CORREL,
        step_id: 'journey_completed',
        event_type: 'step_completed',
      },
    ]
    const { POST } = await importRoute()
    const res = await POST(makeReq(phaseBoundary('journey_completed')))
    expect(res.status).toBe(200)
    const rows = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(rows.length).toBe(0)
  })

  it('🔴 ROJO 2 · la respuesta devuelve el event_id que YA existía', async () => {
    existingRows = [
      {
        event_id: EVENT_ID_CALLBACK,
        operation_type: 'sala-callback.run_completed',
        tenant_id: TENANT,
        stream_id: STREAM,
        correlation_id: CORREL,
        step_id: 'journey_completed',
        event_type: 'step_completed',
      },
    ]
    const { POST } = await importRoute()
    const res = await POST(makeReq(phaseBoundary('journey_completed')))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.duplicate_suppressed).toBe(true)
    expect(json.event_id).toBe(EVENT_ID_CALLBACK)
    expect(json.suppressed_by).toBe('sala-callback.run_completed')
  })

  // 🟢 CONTROL POSITIVO · verde HOY y después. Es el camino normal: sin gemelo,
  // la fila se escribe y se responde con su event_id. Si esto fuera rojo hoy,
  // los dos rojos de arriba no probarían nada.
  it('🟢 CONTROL POSITIVO · sin gemelo se escribe la fila igual que siempre', async () => {
    existingRows = []
    const { POST } = await importRoute()
    const res = await POST(makeReq(phaseBoundary('DISCOVERY')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.event_id).toBeTruthy()
    expect(json.duplicate_suppressed).toBeUndefined()
    const rows = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(rows.length).toBe(1)
    expect(rows[0].step_id).toBe('DISCOVERY')
  })

  it('🟢 CONTROL POSITIVO 2 · una fase canónica distinta en la MISMA corrida no se suprime', async () => {
    // El gemelo es por (stream, correlación, step_id, event_type). Otra FASE del
    // mismo alta tiene otro step_id ⇒ tiene que escribirse normal.
    existingRows = [
      {
        event_id: EVENT_ID_CALLBACK,
        operation_type: 'sala-ingress.INTAKE.completed',
        tenant_id: TENANT,
        stream_id: STREAM,
        correlation_id: CORREL,
        step_id: 'INTAKE',
        event_type: 'step_completed',
      },
    ]
    const { POST } = await importRoute()
    const res = await POST(makeReq(phaseBoundary('SCHEDULING')))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.duplicate_suppressed).toBeUndefined()
    const rows = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(rows.length).toBe(1)
    expect(rows[0].step_id).toBe('SCHEDULING')
  })

  it('🟢 §148 · si la consulta del guardia falla, la fila se escribe igual que hoy', async () => {
    twinQueryShouldFail = true
    const { POST } = await importRoute()
    const res = await POST(makeReq(phaseBoundary('WORKSPACE')))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.duplicate_suppressed).toBeUndefined()
    const rows = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
    expect(rows.length).toBe(1)
  })
})
