/**
 * EL OCTAVO TIPO DE VIAJE `PIEZAS` · pruebas a costo cero · CC#1 · 2026-10-01 (encargo Lenovo «construir el flujo de la pieza» · §144 Emilio 01-oct).
 *
 * Mismo defecto que el séptimo: la unión cerrada de tipos está escrita a mano en CINCO sitios y dos fallan EN CALIENTE (el lector descarta el sobre · la ruta impide escribir el asiento).
 * Aquí se afirman los ocho en los cinco sitios, se ejercitan los dos que fallan en caliente por su comportamiento, y se comprueba que el nombre NO es `PRODUCE` (planeación).
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

const LOS_OCHO = ['ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW', 'ACQUIRE', 'GROWTH', 'BRIEF', 'PIEZAS']
const leer = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
function listaTrasMarca(src: string, marca: string): string[] {
  const i = src.indexOf(marca)
  if (i === -1) throw new Error('no encuentro «' + marca + '»')
  const a = src.indexOf('[', src.indexOf('=', i))
  const b = src.indexOf(']', a)
  return [...src.slice(a, b).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
}
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
  it.each(sitios)('%s trae los ocho tipos, PIEZAS incluido', (_n, dame) => {
    expect(orden(dame())).toEqual(orden(LOS_OCHO))
  })
  it('los cinco coinciden ENTRE SÍ y con lo que se exporta y compila (registro, etapas, JOURNEY_TYPES)', () => {
    const [primero, ...resto] = sitios.map(([, dame]) => orden(dame()))
    for (const r of resto) expect(r).toEqual(primero)
    expect(orden([...JOURNEY_TYPES])).toEqual(orden(LOS_OCHO))
    expect(orden(Object.keys(JOURNEY_STAGES))).toEqual(orden(LOS_OCHO))
    expect(orden([...listJourneys()])).toEqual(orden(LOS_OCHO))
    expect(orden(Object.keys(CANONICAL_LIBRETOS))).toEqual(orden(LOS_OCHO))
  })
})

describe('🔴 los DOS que fallan en caliente: se prueban por su comportamiento', () => {
  const evento = (journey_type: string) => ({
    event_id: 'evt-pieza-1', sequence: 1, occurred_at: '2026-10-01T00:00:00Z', tenant_id: 'cliente-x',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc', stream_id: 'sala/v1/cliente-x/d69100b5/piezas/2026-W40/aabbccddeeff',
    correlation_id: 'corr-1', causation_id: null, event_type: 'step_completed', journey_type,
    operation_type: 'PIEZAS.intake.brief/parte-listo.producir', idempotency_key: 'idem-1', logical_period: '2026-W40',
    input_hash: null, workflow_run_id: null, step_id: 'intake.brief/parte-listo.producir', step_state: 'done', attempt: null,
    payload: { source: 'sala-ingress', intake_source: 'brief/parte-listo', intake_intent: 'producir', intake_tier: 'A', intake_auth_method: 'internal_key', worker_workflow_id: 'lVCLzxQCKNkd3uS0', envelope_payload: { client_id: 'x' } },
    provenance_tag: null, agent_invocation_ref: null, gate_type: null, created_at: '2026-10-01T00:00:00Z',
  }) as unknown as Parameters<typeof parseIntakeEvent>[0]
  it('el LECTOR NO descarta un sobre de tipo PIEZAS · y SÍ descarta uno que no existe, listando PIEZAS', () => {
    const r = parseIntakeEvent(evento('PIEZAS'))
    if (!r.ok) throw new Error('el lector descartó PIEZAS: ' + r.reason)
    const m = parseIntakeEvent(evento('MYSTERY'))
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.reason).toContain('PIEZAS')
  })
  describe('la RUTA que escribe el asiento (events/append)', () => {
    const orig = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    const TENANT = '11111111-1111-1111-1111-111111111111'
    const STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    beforeEach(() => { sharedStorage = new InMemoryEventLogStorage(); process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true' })
    afterEach(() => { if (orig === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED; else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = orig })
    const req = (journey_type: string) => new Request('https://example.com/api/sala/events/append', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ tenant_id: TENANT, client_id: 'c-cliente-stub', stream_id: STREAM, journey_type, phase_step_id: 'journey_completed' }),
    })
    it('un asiento de tipo PIEZAS SE ESCRIBE (200) · y un tipo fuera de la lista se rechaza (400) con los ocho en el mensaje', async () => {
      const { POST } = await import('../src/app/api/sala/events/append/route')
      const ok = await POST(req('PIEZAS'))
      const body = await ok.json()
      expect(ok.status, JSON.stringify(body)).toBe(200)
      expect(body.appended_event_id).toBeDefined()
      const mal = await POST(req('MYSTERY'))
      expect(mal.status).toBe(400)
      const d = await mal.json()
      for (const t of LOS_OCHO) expect(d.detail).toContain(t)
    })
  })
})

describe('el libreto, el destino y la migración de PIEZAS', () => {
  it('el libreto pasa el cargador · y el cargador rechaza un tipo inexistente', () => {
    expect(loadLibreto(CANONICAL_LIBRETOS.PIEZAS).ok).toBe(true)
    expect(CANONICAL_LIBRETOS.PIEZAS.steps.map((s) => s.step_id)).toEqual(['redactar_pieza', 'pieza_lista'])
    expect(loadLibreto({ ...CANONICAL_LIBRETOS.PIEZAS, journey_type: 'MYSTERY' } as never).ok).toBe(false)
  })
  it('🔴 PIEZAS tiene destino: el flujo nuevo, con llave de despacho obligatoria (el obrero PAGA) · y PRODUCE (planeación) NO se tocó', () => {
    const t = getJourneyWorkflowTarget('PIEZAS')!
    // r63 (relevo 61) · la pieza entra por la PUERTA de la oficina; la pieza simple queda de alias (su cable de vuelta sigue rotulado PIEZAS)
    expect(t).toMatchObject({ workflow_id: 'PzZ3b6cY6DYmIaOQ', webhook_path: 'zero-risk/oficina', dispatch_key_required: true, alias_workflow_ids: ['lVCLzxQCKNkd3uS0'] })
    expect(isWorkflowJourney('PIEZAS')).toBe(true)
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE).toMatchObject({ workflow_id: 'X9F0zp6LQ2xGEYVS', webhook_path: 'zero-risk/planeacion' })
    expect(JOURNEY_WORKFLOW_MAP.BRIEF).toMatchObject({ workflow_id: 'pBAp5Cx7R39U585i' })
  })
  it('la migración (NO aplicada) siembra la fuente y la regla con el MISMO id que el mapa · columna journey_type, nunca «kind»', () => {
    const sql = leer('supabase/migrations/202610010500_piezas_routing.sql').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).toContain("'brief/parte-listo'")
    expect(sql).toContain("'producir'")
    expect(sql).toContain("'PIEZAS'")
    expect(sql).toContain(getJourneyWorkflowTarget('PIEZAS')!.alias_workflow_ids![0])   // la migración ORIGINAL siembra la pieza simple; r63 la apunta a la puerta (202610110200)
    expect(sql).toMatch(/journey_type/)
    expect(sql).not.toMatch(/kind/i)
  })
})
