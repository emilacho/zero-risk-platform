/**
 * dispatch.test.ts · Sprint #3 Wave 10 · CC#1
 *
 * Tests unitarios para `dispatchJourney()` en `@/lib/journey-orchestrator`.
 *
 * Mockeamos Supabase via dependency injection (no module mocking) — el lib
 * exporta una función pura que toma `{ supabase, capture }` como deps.
 *
 * Cubre 5 casos: happy path (PRODUCE) + 4 errores (400 schema, 400 cross-field,
 * 404 client missing, 409 conflict).
 *
 * Run: npm run test
 */
import { describe, it, expect } from 'vitest'
import {
  dispatchJourney,
  type SupabaseLike,
  type SupabaseError,
} from '@/lib/journey-orchestrator'

// ────────────────────────────────────────────────────────────────────────────
// Mock Supabase builder · soporta select/insert/eq/in/limit/maybeSingle/single
// ────────────────────────────────────────────────────────────────────────────

interface MockTableConfig {
  /** Resultado para queries .maybeSingle() o .single() — first call returned */
  results?: Array<{ data: Record<string, unknown> | null; error: SupabaseError | null }>
}

interface MockSupabaseConfig {
  tables: Record<string, MockTableConfig>
}

function makeMockSupabase(config: MockSupabaseConfig): {
  client: SupabaseLike
  callsByTable: Record<string, number>
} {
  const callsByTable: Record<string, number> = {}
  // Queues persistentes por tabla · sobreviven entre llamadas a .from(table).
  // Cada terminal (.maybeSingle / .single) hace shift sobre el mismo queue.
  const queues: Record<
    string,
    Array<{ data: Record<string, unknown> | null; error: SupabaseError | null }>
  > = {}
  for (const [table, cfg] of Object.entries(config.tables)) {
    queues[table] = [...(cfg.results ?? [])]
  }

  const client: SupabaseLike = {
    from(table: string) {
      callsByTable[table] = (callsByTable[table] ?? 0) + 1
      const queue = queues[table] ?? (queues[table] = [])

      const builder = {
        select: () => builder,
        insert: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => queue.shift() ?? { data: null, error: null },
        single: async () =>
          queue.shift() ?? {
            data: null,
            error: { code: 'NO_RESULT', message: 'No mock result programmed' },
          },
      }
      return builder as unknown as ReturnType<SupabaseLike['from']>
    },
  }

  return { client, callsByTable }
}

const VALID_UUID = '07f88bef-8054-4d09-9102-46bc36177c2f'
const OTHER_UUID = '11111111-1111-1111-1111-111111111111'

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('dispatchJourney() — happy path', () => {
  it('returns 201 with journey_id when PRODUCE journey + existing client + no conflict', async () => {
    const { client } = makeMockSupabase({
      tables: {
        // 1st call: client lookup → exists
        clients: { results: [{ data: { id: VALID_UUID }, error: null }] },
        // 2nd: conflict check → no conflict (null)
        // 3rd: insert → returns new row id
        client_journey_state: {
          results: [
            { data: null, error: null }, // conflict check
            {
              data: { id: 'journey-uuid-001', started_at: '2026-04-28T20:00:00Z' },
              error: null,
            }, // insert
          ],
        },
      },
    })

    const captures: Array<{ event: string; props: Record<string, unknown> }> = []
    const capture = (event: string, _id: string, props: Record<string, unknown>) => {
      captures.push({ event, props })
    }

    const result = await dispatchJourney(
      {
        client_id: VALID_UUID,
        journey: 'PRODUCE',
        trigger_type: 'manual',
        trigger_source: 'unit_test',
        params: { campaign_objective: 'test' },
      },
      { supabase: client, capture },
    )

    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({
      journey_id: 'journey-uuid-001',
      client_id: VALID_UUID,
      journey: 'PRODUCE',
      status: 'initiated',
      dispatch_target: 'nexus-7phase-orchestrator',
    })
    expect(captures).toHaveLength(1)
    expect(captures[0].event).toBe('journey_dispatched')
    expect(captures[0].props).toMatchObject({
      journey_id: 'journey-uuid-001',
      journey: 'PRODUCE',
      trigger_type: 'manual',
    })
  })
})

describe('dispatchJourney() — validation errors', () => {
  it('returns 400 when journey field is missing (Ajv schema fail)', async () => {
    const { client } = makeMockSupabase({ tables: {} })

    const result = await dispatchJourney(
      { client_id: VALID_UUID, trigger_type: 'manual' },
      { supabase: client },
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('validation_error')
    expect(String(result.body.detail)).toContain('journey')
  })

  it('returns 400 when client_id is missing for non-ACQUIRE journey (cross-field rule)', async () => {
    const { client } = makeMockSupabase({ tables: {} })

    const result = await dispatchJourney(
      { journey: 'PRODUCE', trigger_type: 'manual' },
      { supabase: client },
    )

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({
      error: 'validation_error',
    })
    expect(String(result.body.detail)).toContain('client_id required')
  })
})

describe('dispatchJourney() — not found / conflict errors', () => {
  it('returns 404 when client_id is provided but client does not exist', async () => {
    const { client } = makeMockSupabase({
      tables: {
        // client lookup → not found
        clients: { results: [{ data: null, error: null }] },
      },
    })

    const result = await dispatchJourney(
      { client_id: OTHER_UUID, journey: 'PRODUCE' },
      { supabase: client },
    )

    expect(result.status).toBe(404)
    expect(result.body.error).toBe('not_found')
    expect(String(result.body.detail)).toContain(OTHER_UUID)
  })

  it('returns 409 when client already has an active journey of the same type (no force_new)', async () => {
    const existingJourneyId = 'existing-journey-abc'
    const { client } = makeMockSupabase({
      tables: {
        // client exists
        clients: { results: [{ data: { id: VALID_UUID }, error: null }] },
        // conflict check returns existing active journey
        client_journey_state: {
          results: [
            {
              data: { id: existingJourneyId, status: 'active' },
              error: null,
            },
          ],
        },
      },
    })

    const result = await dispatchJourney(
      { client_id: VALID_UUID, journey: 'PRODUCE' },
      { supabase: client },
    )

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({
      error: 'conflict',
      existing_journey_id: existingJourneyId,
    })
  })
})

describe('dispatchJourney() — service availability', () => {
  it('returns 503 when client_journey_state table missing (migration pending)', async () => {
    const { client } = makeMockSupabase({
      tables: {
        clients: { results: [{ data: { id: VALID_UUID }, error: null }] },
        client_journey_state: {
          results: [
            {
              data: null,
              error: { code: 'PGRST205', message: 'relation does not exist' },
            },
          ],
        },
      },
    })

    const result = await dispatchJourney(
      { client_id: VALID_UUID, journey: 'PRODUCE' },
      { supabase: client },
    )

    expect(result.status).toBe(503)
    expect(result.body.error).toBe('service_unavailable')
    expect(String(result.body.detail)).toContain('migration')
  })
})
