/**
 * mc-sync-hitl-cycle.test.ts · Wave 14 · CC#3 · T4
 *
 * Covers the new `hitl_cycle_complete` action handler on POST /api/mc-sync
 * that closes B-001 (n8n HITL workflow → backend gap). Verifies:
 *
 *  1. happy path        → 200 + ok:true + persisted_id
 *  2. missing field     → 400 + E-INPUT-INVALID (cycle_id absent)
 *  3. invalid type      → 400 + E-INPUT-INVALID (queue_depth as string)
 *  4. auth missing      → 401 + E-AUTH-001 (no x-api-key)
 *  5. double action     → existing action (health_check) still routes correctly,
 *                         confirming the new branch doesn't shadow others
 *
 * The Supabase admin client is mocked so tests don't touch prod. The mock
 * captures inserted rows for assertion in the happy-path case.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'test-internal-key-mc-hitl'

// ---- Supabase mock ----------------------------------------------------------
// Captures the most recent insert for assertion. Reset in beforeEach.
const captured: { table?: string; row?: Record<string, unknown> } = {}

const insertSingleResolver = vi.fn(async () => ({
  data: { id: '00000000-0000-0000-0000-000000000abc' },
  error: null,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      captured.table = table
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row
          return {
            select() {
              return {
                single: insertSingleResolver,
              }
            },
          }
        },
      }
    },
  }),
  getSupabase: () => null,
}))

// ---- MC bridge mock (so health_check path doesn't try to reach Railway) ----
vi.mock('@/lib/mc-bridge', () => ({
  MissionControlBridge: class {
    async isAvailable() {
      return true
    }
    async syncPipelineToMC() {
      return { tasksCreated: 0, inboxSent: 0, errors: [] }
    }
  },
}))

// Import AFTER mocks are registered.
import { POST } from '../src/app/api/mc-sync/route'

function authedRequest(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/mc-sync', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/mc-sync · action=hitl_cycle_complete (W14-T4 · B-001 fix)', () => {
  beforeEach(() => {
    _resetValidatorCache()
    process.env.INTERNAL_API_KEY = VALID_KEY
    captured.table = undefined
    captured.row = undefined
    insertSingleResolver.mockClear()
    insertSingleResolver.mockImplementation(async () => ({
      data: { id: '00000000-0000-0000-0000-000000000abc' },
      error: null,
    }))
  })

  it('happy path · persists cycle and returns 200 with persisted_id', async () => {
    const req = authedRequest({
      action: 'hitl_cycle_complete',
      cycle_id: 'hitl-2026-05-01T12-00-00Z',
      queue_depth: 3,
      items_processed: 7,
      timestamp: '2026-05-01T12:00:00Z',
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('hitl_cycle_complete')
    expect(body.persisted_id).toBe('00000000-0000-0000-0000-000000000abc')

    expect(captured.table).toBe('mc_inbox_hitl_cycles')
    expect(captured.row).toMatchObject({
      cycle_id: 'hitl-2026-05-01T12-00-00Z',
      queue_depth: 3,
      items_processed: 7,
      cycle_timestamp: '2026-05-01T12:00:00Z',
      source: 'n8n-hitl-workflow',
    })
  })

  it('missing field · rejects payload without cycle_id with 400 + E-INPUT-INVALID', async () => {
    const req = authedRequest({
      action: 'hitl_cycle_complete',
      // cycle_id intentionally absent
      queue_depth: 0,
      items_processed: 0,
      timestamp: '2026-05-01T12:00:00Z',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
    expect(body.detail).toMatch(/cycle_id/i)
    // Must NOT have hit the DB.
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })

  it('invalid type · rejects queue_depth as string with 400 + E-INPUT-INVALID', async () => {
    const req = authedRequest({
      action: 'hitl_cycle_complete',
      cycle_id: 'hitl-bad',
      queue_depth: 'three', // wrong type
      items_processed: 0,
      timestamp: '2026-05-01T12:00:00Z',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })

  it('auth missing · returns 401 + E-AUTH-001 when x-api-key is absent', async () => {
    const req = authedRequest(
      {
        action: 'hitl_cycle_complete',
        cycle_id: 'hitl-no-auth',
        queue_depth: 0,
        items_processed: 0,
        timestamp: '2026-05-01T12:00:00Z',
      },
      false, // no x-api-key
    )

    const res = await POST(req)
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.code).toBe('E-AUTH-001')
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })

  it('double action · existing health_check still routes correctly (no shadowing by new branch)', async () => {
    const req = authedRequest({ action: 'health_check' })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.mission_control).toBe('online')
    // hitl_cycle_complete branch must NOT have run.
    expect(captured.table).toBeUndefined()
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })
})
