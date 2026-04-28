/**
 * persist-resume.test.ts · Sprint #3 Wave 10 · CP3
 *
 * Tests unitarios para `@/lib/persist-resume`.
 * Mockeamos Supabase via DI · igual estrategia que dispatch.test.ts.
 *
 * Run: npm run test
 */
import { describe, it, expect } from 'vitest'
import {
  generateResumeToken,
  verifyResumeToken,
  validatePersistPayload,
  persistJourneyState,
  resumeJourney,
  expireOldStates,
  getJourneyState,
  PersistResumeError,
  DEFAULT_TTLS,
  type PersistDeps,
} from '@/lib/persist-resume'
import type { SupabaseLike, SupabaseError } from '@/lib/journey-orchestrator'

// ────────────────────────────────────────────────────────────────────────────
// Mock Supabase · queue-per-table compartido · soporta .insert() encadenado
// ────────────────────────────────────────────────────────────────────────────

type MockResult = {
  data: Record<string, unknown> | null
  error: SupabaseError | null
}

interface MockConfig {
  tables: Record<string, MockResult[]>
}

function makeMockSupabase(config: MockConfig): {
  client: SupabaseLike
  callsByTable: Record<string, number>
  insertedRows: Array<{ table: string; row: Record<string, unknown> }>
} {
  const callsByTable: Record<string, number> = {}
  const insertedRows: Array<{ table: string; row: Record<string, unknown> }> = []
  const queues: Record<string, MockResult[]> = {}
  for (const [table, results] of Object.entries(config.tables)) {
    queues[table] = [...results]
  }

  const client: SupabaseLike = {
    from(table: string) {
      callsByTable[table] = (callsByTable[table] ?? 0) + 1
      const queue = queues[table] ?? (queues[table] = [])
      let lastInsert: Record<string, unknown> | null = null

      const builder = {
        select: () => builder,
        insert: (row: Record<string, unknown>) => {
          lastInsert = row
          insertedRows.push({ table, row })
          return builder
        },
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () =>
          queue.shift() ?? { data: null, error: null },
        single: async () =>
          queue.shift() ?? {
            data: null,
            error: { code: 'NO_RESULT', message: 'No mock result programmed' },
          },
      }
      return builder as unknown as ReturnType<SupabaseLike['from']>
    },
  }

  return { client, callsByTable, insertedRows }
}

const VALID_UUID = '07f88bef-8054-4d09-9102-46bc36177c2f'
const SECRET = 'test-secret-do-not-use-in-prod'
const BASE_URL = 'https://test.example.com'

// ────────────────────────────────────────────────────────────────────────────
// Token generation
// ────────────────────────────────────────────────────────────────────────────

describe('generateResumeToken / verifyResumeToken', () => {
  it('generates token with shape <32hex>.<32hex>', () => {
    const token = generateResumeToken(SECRET)
    expect(token).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{32}$/i)
  })

  it('generated tokens are unique across calls', () => {
    const a = generateResumeToken(SECRET)
    const b = generateResumeToken(SECRET)
    expect(a).not.toBe(b)
  })

  it('verifies valid tokens with correct secret', () => {
    const token = generateResumeToken(SECRET)
    expect(verifyResumeToken(token, SECRET)).toBe(true)
  })

  it('rejects tokens signed with different secret', () => {
    const token = generateResumeToken(SECRET)
    expect(verifyResumeToken(token, 'wrong-secret')).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(verifyResumeToken('not-a-token', SECRET)).toBe(false)
    expect(verifyResumeToken('abc.def', SECRET)).toBe(false)
    expect(verifyResumeToken('', SECRET)).toBe(false)
  })

  it('rejects tampered HMAC', () => {
    const token = generateResumeToken(SECRET)
    const [random] = token.split('.')
    const tampered = `${random}.${'0'.repeat(32)}`
    expect(verifyResumeToken(tampered, SECRET)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// validatePersistPayload
// ────────────────────────────────────────────────────────────────────────────

describe('validatePersistPayload', () => {
  it('passes with all required keys present (PRODUCE phase_4)', () => {
    const r = validatePersistPayload('PRODUCE', 'phase_4_pre_build', {
      phase_0_brief: 'x',
      phase_1_research: 'y',
    })
    expect(r.valid).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('fails when required keys missing (ONBOARD stage_10)', () => {
    const r = validatePersistPayload('ONBOARD', 'stage_10', {
      brand_book_v0: 'b',
    })
    expect(r.valid).toBe(false)
    expect(r.missing).toContain('icp')
    expect(r.missing).toContain('competitive')
  })

  it('passes permissively for unknown stages', () => {
    const r = validatePersistPayload('PRODUCE', 'phase_unknown', {})
    expect(r.valid).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// persistJourneyState
// ────────────────────────────────────────────────────────────────────────────

describe('persistJourneyState', () => {
  it('inserts row with status=paused_hitl + token + ttl_expires_at + audit event', async () => {
    const { client, insertedRows } = makeMockSupabase({
      tables: {
        client_journey_state: [
          {
            data: {
              id: 'journey-001',
              client_id: VALID_UUID,
              journey: 'PRODUCE',
              status: 'paused_hitl',
              resume_token: 'will-be-set-by-impl',
              ttl_expires_at: '2026-05-12T00:00:00Z',
              payload: { phase_0_brief: 'x' },
              metadata: {},
              started_at: '2026-04-28T20:00:00Z',
              updated_at: '2026-04-28T20:00:00Z',
            },
            error: null,
          },
        ],
        journey_events: [],
      },
    })

    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }
    const result = await persistJourneyState(
      {
        client_id: VALID_UUID,
        journey: 'PRODUCE',
        current_stage: 'phase_5_qa_hitl',
        payload: { draft_outputs: [] },
      },
      deps,
    )

    // Row insertada en client_journey_state
    const cjsInsert = insertedRows.find((r) => r.table === 'client_journey_state')
    expect(cjsInsert).toBeTruthy()
    expect(cjsInsert?.row.status).toBe('paused_hitl')
    expect(cjsInsert?.row.resume_token).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{32}$/i)
    expect(cjsInsert?.row.ttl_expires_at).toBeTruthy()
    // 14 días default para PRODUCE phase_5_qa_hitl
    const ttlDate = new Date(cjsInsert?.row.ttl_expires_at as string)
    const daysFromNow =
      (ttlDate.getTime() - Date.now()) / 86400_000
    expect(daysFromNow).toBeGreaterThan(13.9)
    expect(daysFromNow).toBeLessThan(14.1)

    // Audit event insertado
    const auditInsert = insertedRows.find((r) => r.table === 'journey_events')
    expect(auditInsert).toBeTruthy()
    expect(auditInsert?.row.event_type).toBe('persisted')

    // resume_url construida
    expect(result.resume_url).toContain(BASE_URL)
    expect(result.resume_url).toContain('/api/journey/journey-001/resume')
  })

  it('throws E_PERSIST_001 when supabase insert fails', async () => {
    const { client } = makeMockSupabase({
      tables: {
        client_journey_state: [
          {
            data: null,
            error: { code: 'PGRST205', message: 'table missing' },
          },
        ],
      },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    await expect(
      persistJourneyState(
        {
          client_id: VALID_UUID,
          journey: 'PRODUCE',
          current_stage: 'phase_5_qa_hitl',
          payload: {},
        },
        deps,
      ),
    ).rejects.toThrow(PersistResumeError)
  })

  it('respects ttl_days override', async () => {
    const { client, insertedRows } = makeMockSupabase({
      tables: {
        client_journey_state: [
          {
            data: { id: 'j-002' },
            error: null,
          },
        ],
        journey_events: [],
      },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    await persistJourneyState(
      {
        client_id: VALID_UUID,
        journey: 'ACQUIRE',
        current_stage: 'stage_5',
        payload: { lead_data: {} },
        ttl_days: 30, // override default 14
      },
      deps,
    )

    const cjsInsert = insertedRows.find((r) => r.table === 'client_journey_state')
    const ttlDate = new Date(cjsInsert?.row.ttl_expires_at as string)
    const daysFromNow = (ttlDate.getTime() - Date.now()) / 86400_000
    expect(daysFromNow).toBeGreaterThan(29.9)
    expect(daysFromNow).toBeLessThan(30.1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// resumeJourney
// ────────────────────────────────────────────────────────────────────────────

describe('resumeJourney', () => {
  it('throws E_PERSIST_003 when token signature is invalid', async () => {
    const { client } = makeMockSupabase({ tables: {} })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    await expect(
      resumeJourney(
        { resume_token: 'malformed-token', reason: 'hitl_approved' },
        deps,
      ),
    ).rejects.toThrow(PersistResumeError)
  })

  it('throws E_PERSIST_003 when token not found in DB (already invalidated)', async () => {
    const validToken = generateResumeToken(SECRET)
    const { client } = makeMockSupabase({
      tables: {
        client_journey_state: [{ data: null, error: null }],
      },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    await expect(
      resumeJourney({ resume_token: validToken, reason: 'manual' }, deps),
    ).rejects.toThrow(/Token not found/i)
  })

  it('throws E_PERSIST_002 when TTL expired', async () => {
    const validToken = generateResumeToken(SECRET)
    const expiredAt = new Date(Date.now() - 86400_000).toISOString() // ayer
    const { client } = makeMockSupabase({
      tables: {
        client_journey_state: [
          {
            data: {
              id: 'journey-expired',
              client_id: VALID_UUID,
              journey: 'PRODUCE',
              status: 'paused_hitl',
              resume_token: validToken,
              ttl_expires_at: expiredAt,
              payload: {},
              metadata: {},
              started_at: '2026-04-01T00:00:00Z',
              updated_at: '2026-04-01T00:00:00Z',
            },
            error: null,
          },
        ],
      },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    await expect(
      resumeJourney({ resume_token: validToken, reason: 'manual' }, deps),
    ).rejects.toThrow(/TTL expired/i)
  })

  it('returns active row + audit event on valid resume', async () => {
    const validToken = generateResumeToken(SECRET)
    const futureExpiry = new Date(Date.now() + 86400_000).toISOString()
    const { client, insertedRows } = makeMockSupabase({
      tables: {
        client_journey_state: [
          {
            data: {
              id: 'journey-resumable',
              client_id: VALID_UUID,
              journey: 'PRODUCE',
              status: 'paused_hitl',
              resume_token: validToken,
              ttl_expires_at: futureExpiry,
              payload: { draft: 'x' },
              metadata: {},
              started_at: '2026-04-28T20:00:00Z',
              updated_at: '2026-04-28T20:00:00Z',
            },
            error: null,
          },
        ],
        journey_events: [],
      },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    const result = await resumeJourney(
      { resume_token: validToken, reason: 'hitl_approved' },
      deps,
    )

    expect(result.status).toBe('active')
    expect(result.resume_token).toBeNull()
    const audit = insertedRows.find(
      (r) => r.table === 'journey_events' && r.row.event_type === 'resumed',
    )
    expect(audit).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// expireOldStates
// ────────────────────────────────────────────────────────────────────────────

describe('expireOldStates', () => {
  it('writes audit event for each expired row', async () => {
    const { client, insertedRows } = makeMockSupabase({
      tables: { journey_events: [] },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    const result = await expireOldStates(
      [
        { id: 'j-1', client_id: VALID_UUID, journey: 'PRODUCE' },
        { id: 'j-2', client_id: VALID_UUID, journey: 'ONBOARD' },
        { id: 'j-3', client_id: null, journey: 'ACQUIRE' },
      ],
      deps,
    )

    expect(result.expired).toBe(3)
    expect(result.abandoned).toBe(3)
    expect(result.errors).toEqual([])
    const auditEvents = insertedRows.filter(
      (r) => r.table === 'journey_events' && r.row.event_type === 'journey_abandoned_ttl',
    )
    expect(auditEvents).toHaveLength(3)
  })

  it('returns expired=0 with empty input', async () => {
    const { client } = makeMockSupabase({ tables: {} })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }

    const result = await expireOldStates([], deps)
    expect(result.expired).toBe(0)
    expect(result.abandoned).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// DEFAULT_TTLS sanity
// ────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_TTLS', () => {
  it('covers all 5 journey types', () => {
    expect(Object.keys(DEFAULT_TTLS).sort()).toEqual([
      'ACQUIRE',
      'ALWAYS_ON',
      'ONBOARD',
      'PRODUCE',
      'REVIEW',
    ])
  })

  it('PRODUCE phase_5_qa_hitl is 14 days', () => {
    expect(DEFAULT_TTLS.PRODUCE.phase_5_qa_hitl).toBe(14)
  })

  it('REVIEW stage_9 is 21 days', () => {
    expect(DEFAULT_TTLS.REVIEW.stage_9).toBe(21)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getJourneyState
// ────────────────────────────────────────────────────────────────────────────

describe('getJourneyState', () => {
  it('returns null when journey not found', async () => {
    const { client } = makeMockSupabase({
      tables: { client_journey_state: [{ data: null, error: null }] },
    })
    const deps: PersistDeps = { supabase: client, baseUrl: BASE_URL, secret: SECRET }
    const result = await getJourneyState('does-not-exist', deps)
    expect(result).toBeNull()
  })
})
