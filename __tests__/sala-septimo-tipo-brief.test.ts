/**
 * EL SÉPTIMO TIPO DE VIAJE `BRIEF` · pruebas a costo cero · CC#1 · 2026-09-29 (encargo Lenovo §1.1 + §7 · aviso de CC#3).
 *
 * El tipo NO vive en un solo archivo: la unión cerrada de seis estaba escrita a mano en CINCO sitios
 * (libretos/types.ts · libretos/loader.ts · sala-router-consumer/parsing.ts · api/sala/events/append/route.ts ·
 * journey-orchestrator/types.ts), y DOS fallan en caliente sin romper la compilación:
 *   · parsing.ts  → el lector DESCARTA el sobre («journey_type … not in canonical set»)
 *   · events/append/route.ts → IMPIDE escribir el asiento (400 «journey_type must be one of …»)
 * El síntoma sería «el repartidor no despachó» y se pagaría una corrida entera para descubrirlo. Estas pruebas
 * afirman la lista COMPLETA en los cinco sitios, y ejercitan a los dos que fallan en caliente por su comportamiento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { InMemoryEventLogStorage, type EventLogStorage } from '@/lib/sala-event-log'
import { parseIntakeEvent } from '@/lib/sala-router-consumer/parsing'
import { CANONICAL_LIBRETOS, listJourneys } from '@/lib/sala/libretos/registry'
import { loadLibreto } from '@/lib/sala/libretos/loader'
import { JOURNEY_TYPES } from '@/lib/journey-orchestrator/types'
import { JOURNEY_STAGES } from '@/lib/journey-orchestrator/state-machine'
import { JOURNEY_WORKFLOW_MAP, getJourneyWorkflowTarget, isWorkflowJourney } from '@/lib/sala-journey-dispatch/journey-workflow-map'

// ─── mocks · mismo patrón que sala-events-append-route.test.ts ───
vi.mock('@/lib/internal-auth', () => ({
  checkInternalOrAdmin: vi.fn(async (r: Request) => (r.headers.get('x-api-key') === 'test-key' ? { ok: true, via: 'internal' as const } : { ok: false, reason: 'no auth' })),
}))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn(() => ({})) }))
let sharedStorage: InMemoryEventLogStorage
vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>('@/lib/sala-event-log')
  return {
    ...actual,
    SupabaseEventLogStorage: class FakeSupabaseStorage implements EventLogStorage {
      insert(input: Parameters<EventLogStorage['insert']>[0]) { return sharedStorage.insert(input) }
      select(filters: Parameters<EventLogStorage['select']>[0]) { return sharedStorage.select(filters) }
      findByIdempotencyKey(tenant_id: string, idempotency_key: string) { return sharedStorage.findByIdempotencyKey(tenant_id, idempotency_key) }
    },
  }
})
vi.mock('@/lib/sala-journey-dispatch/reconciliation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-journey-dispatch/reconciliation')>('@/lib/sala-journey-dispatch/reconciliation')
  return { ...actual, postReconciliationAlert: vi.fn(async () => {}) }
})

const SEIS_DE_SIEMPRE = ['ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW', 'ACQUIRE', 'GROWTH']
const LOS_SIETE = [...SEIS_DE_SIEMPRE, 'BRIEF', 'PIEZAS'] // desde el 01-oct son OCHO (PIEZAS · ver sala-octavo-tipo-piezas.test.ts); el nombre de la constante se conserva por historia

const leer = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
/** Las palabras entre comillas de una lista `[ 'A', 'B' ]` que empieza en `marca`. */
function listaTrasMarca(src: string, marca: string): string[] {
  const i = src.indexOf(marca)
  if (i === -1) throw new Error('no encuentro «' + marca + '»')
  const a = src.indexOf('[', src.indexOf('=', i))
  const b = src.indexOf(']', a)
  return [...src.slice(a, b).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
}
/** Los miembros de la unión `export type JourneyType = | 'A' | 'B' …` */
function unionJourneyType(src: string): string[] {
  const i = src.indexOf('export type JourneyType =')
  const fin = src.indexOf('\n\n', i)
  return [...src.slice(i, fin).matchAll(/\|\s*'([A-Z_]+)'/g)].map((m) => m[1])
}
const orden = (a: string[]) => [...a].sort()

describe('🔴 la lista COMPLETA en los CINCO sitios escritos a mano', () => {
  const sitios: Array<[string, () => string[]]> = [
    ['libretos/types.ts (unión JourneyType)', () => unionJourneyType(leer('src/lib/sala/libretos/types.ts'))],
    ['libretos/loader.ts (JOURNEY_TYPES)', () => listaTrasMarca(leer('src/lib/sala/libretos/loader.ts'), 'const JOURNEY_TYPES')],
    ['sala-router-consumer/parsing.ts (KNOWN_JOURNEYS)', () => listaTrasMarca(leer('src/lib/sala-router-consumer/parsing.ts'), 'const KNOWN_JOURNEYS')],
    ['api/sala/events/append/route.ts (KNOWN_JOURNEYS)', () => listaTrasMarca(leer('src/app/api/sala/events/append/route.ts'), 'const KNOWN_JOURNEYS')],
    ['journey-orchestrator/types.ts (JOURNEY_TYPES)', () => listaTrasMarca(leer('src/lib/journey-orchestrator/types.ts'), 'export const JOURNEY_TYPES')],
  ]
  it.each(sitios)('%s trae los ocho tipos (BRIEF y PIEZAS incluidos)', (_n, dame) => {
    expect(orden(dame())).toEqual(orden(LOS_SIETE))
  })
  it('los cinco coinciden ENTRE SÍ (si un octavo tipo se agrega en cuatro y se olvida el quinto, esto lo grita)', () => {
    const [primero, ...resto] = sitios.map(([, dame]) => orden(dame()))
    for (const r of resto) expect(r).toEqual(primero)
  })
  it('y coinciden con lo que se exporta y compila: registro de libretos, etapas del orquestador y JOURNEY_TYPES', () => {
    expect(orden([...JOURNEY_TYPES])).toEqual(orden(LOS_SIETE))
    expect(orden(Object.keys(JOURNEY_STAGES))).toEqual(orden(LOS_SIETE))
    expect(orden([...listJourneys()])).toEqual(orden(LOS_SIETE))
    expect(orden(Object.keys(CANONICAL_LIBRETOS))).toEqual(orden(LOS_SIETE))
  })
})

describe('🔴 los DOS que fallan en caliente: se prueban por su comportamiento', () => {
  // el asiento que deja la sala al recibir el sobre `planeacion/plan-listo` (forma real: ver sala-router-consumer-parsing.test.ts)
  const evento = (journey_type: string) => ({
    event_id: 'evt-brief-1', sequence: 1, occurred_at: '2026-09-29T00:00:00Z', tenant_id: 'naufrago',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc', stream_id: 'sala/v1/naufrago/d69100b5/brief/2026-W40/aabbccddeeff',
    correlation_id: 'corr-1', causation_id: null, event_type: 'step_completed', journey_type,
    operation_type: 'BRIEF.intake.planeacion/plan-listo.briefear', idempotency_key: 'idem-1', logical_period: '2026-W40',
    input_hash: null, workflow_run_id: null, step_id: 'intake.planeacion/plan-listo.briefear', step_state: 'done', attempt: null,
    payload: {
      source: 'sala-ingress', intake_source: 'planeacion/plan-listo', intake_intent: 'briefear', intake_tier: 'A',
      intake_auth_method: 'internal_key', worker_workflow_id: 'PQdIgbuFexuBsoh8', envelope_payload: { client_id: 'x' },
    },
    provenance_tag: null, agent_invocation_ref: null, gate_type: null, created_at: '2026-09-29T00:00:00Z',
  }) as unknown as Parameters<typeof parseIntakeEvent>[0]
  it('el LECTOR (parsing.ts) NO descarta un sobre de tipo BRIEF', () => {
    const r = parseIntakeEvent(evento('BRIEF'))
    if (!r.ok) throw new Error('el lector descartó BRIEF: ' + r.reason)
    expect(r.ok).toBe(true)
  })
  it('ROJO · el lector SÍ descarta un tipo que no existe, con el mensaje que dice cuáles son (incluido BRIEF)', () => {
    const r = parseIntakeEvent(evento('MYSTERY'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/not in canonical set/)
      expect(r.reason).toContain('BRIEF')
    }
  })

  describe('la RUTA que escribe el asiento (events/append)', () => {
    const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    const TENANT = '11111111-1111-1111-1111-111111111111'
    const STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    beforeEach(() => { sharedStorage = new InMemoryEventLogStorage(); process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true' })
    afterEach(() => { if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED; else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig })
    const req = (journey_type: string) => new Request('https://example.com/api/sala/events/append', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ tenant_id: TENANT, client_id: 'c-naufrago-stub', stream_id: STREAM, journey_type, phase_step_id: 'journey_completed' }),
    })
    it('un asiento de tipo BRIEF SE ESCRIBE (200 · appended) · no se rechaza con «journey_type must be one of»', async () => {
      const { POST } = await import('../src/app/api/sala/events/append/route')
      const res = await POST(req('BRIEF'))
      const body = await res.json()
      expect(res.status, JSON.stringify(body)).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.appended_event_id).toBeDefined()
      const filas = await sharedStorage.select({ tenant_id: TENANT, stream_id: STREAM })
      expect(filas).toHaveLength(1)
    })
    it('ROJO · un tipo fuera de la lista se rechaza ruidosamente (400) y el mensaje lista los ocho', async () => {
      const { POST } = await import('../src/app/api/sala/events/append/route')
      const res = await POST(req('MYSTERY'))
      expect(res.status).toBe(400)
      const body = await res.json()
      for (const t of LOS_SIETE) expect(body.detail).toContain(t)
    })
  })
})

describe('el libreto y el destino de BRIEF', () => {
  it('el libreto de BRIEF pasa el cargador (loadLibreto) y su entrada existe', () => {
    const r = loadLibreto(CANONICAL_LIBRETOS.BRIEF)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(CANONICAL_LIBRETOS.BRIEF.journey_type).toBe('BRIEF')
    expect(CANONICAL_LIBRETOS.BRIEF.steps.map((s) => s.step_id)).toEqual(['redactar_parte', 'parte_listo'])
  })
  it('ROJO · el cargador rechaza un libreto con un tipo que no está en la lista (no acepta cualquier cosa)', () => {
    const r = loadLibreto({ ...CANONICAL_LIBRETOS.BRIEF, journey_type: 'MYSTERY' } as never)
    expect(r.ok).toBe(false)
  })
  it('BRIEF tiene destino en el mapa: el flujo nuevo, con llave de despacho obligatoria (el obrero PAGA)', () => {
    const t = getJourneyWorkflowTarget('BRIEF')!
    expect(t).toMatchObject({ workflow_id: 'PQdIgbuFexuBsoh8', webhook_path: 'zero-risk/brief', dispatch_key_required: true })
    expect(t.phase_boundaries).toEqual(['journey_completed'])
    expect(isWorkflowJourney('BRIEF')).toBe(true)
  })
  it('`PRODUCE` NO se tocó: sigue siendo planeación, y los otros cuatro siguen sin destino', () => {
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE).toMatchObject({ workflow_id: 'X9F0zp6LQ2xGEYVS', webhook_path: 'zero-risk/planeacion' })
    for (const j of ['ACQUIRE', 'ALWAYS_ON', 'REVIEW', 'GROWTH'] as const) expect(JOURNEY_WORKFLOW_MAP[j]).toBeUndefined()
    expect(JOURNEY_WORKFLOW_MAP.ONBOARD).toMatchObject({ workflow_id: 'LyVoKcrypS5uLyuu' })
  })
  it('la etiqueta de la fila de ruteo (columna `journey_type`, NO `kind`) que se sembrará dice BRIEF', () => {
    const sql = leer('supabase/migrations/202609290400_brief_routing.sql')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(sql).toMatch(/journey_type/)
    expect(sql).toMatch(/'BRIEF'/)
    expect(sql).not.toMatch(/kind/i) // el SQL (sin comentarios) no usa una columna «kind»
  })
})
