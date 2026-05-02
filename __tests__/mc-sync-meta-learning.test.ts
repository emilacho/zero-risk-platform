/**
 * mc-sync-meta-learning.test.ts · Wave 15 · CC#3 · T6
 *
 * Covers the new `meta_learning_complete` action handler on POST /api/mc-sync.
 * Closes the gap surfaced by the W15-T5 contract audit (mirror of B-001 /
 * hitl_cycle_complete · W14-T4).
 *
 *  1. happy path        → 200 + ok:true + persisted_id
 *  2. missing field     → 400 + E-INPUT-INVALID (week absent)
 *  3. invalid type      → 400 + E-INPUT-INVALID (tasks_analyzed as string)
 *  4. auth missing      → 401 + E-AUTH-001 (no x-api-key)
 *  5. double action     → existing health_check still routes correctly,
 *                         confirming the new branch doesn't shadow others
 *
 * Supabase admin + MC bridge are mocked so tests don't touch prod.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'test-internal-key-mc-meta'

const captured: { table?: string; row?: Record<string, unknown> } = {}

const insertSingleResolver = vi.fn(async () => ({
  data: { id: '11111111-1111-1111-1111-111111111111' },
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

describe('POST /api/mc-sync · action=meta_learning_complete (W15-T6)', () => {
  beforeEach(() => {
    _resetValidatorCache()
    process.env.INTERNAL_API_KEY = VALID_KEY
    captured.table = undefined
    captured.row = undefined
    insertSingleResolver.mockClear()
    insertSingleResolver.mockImplementation(async () => ({
      data: { id: '11111111-1111-1111-1111-111111111111' },
      error: null,
    }))
  })

  it('happy path · persists weekly cycle and returns 200 with persisted_id', async () => {
    const req = authedRequest({
      action: 'meta_learning_complete',
      week: '2026-W18',
      tasks_analyzed: 142,
      success_rate: '0.87',
      proposals_queued: 9,
      timestamp: '2026-05-04T09:00:00Z',
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('meta_learning_complete')
    expect(body.persisted_id).toBe('11111111-1111-1111-1111-111111111111')

    expect(captured.table).toBe('mc_inbox_meta_learning_cycles')
    expect(captured.row).toMatchObject({
      week: '2026-W18',
      tasks_analyzed: 142,
      success_rate: '0.87',
      proposals_queued: 9,
      cycle_timestamp: '2026-05-04T09:00:00Z',
      source: 'n8n-meta-agent-weekly-cycle',
    })
  })

  it('missing field · rejects payload without week with 400 + E-INPUT-INVALID', async () => {
    const req = authedRequest({
      action: 'meta_learning_complete',
      // week intentionally absent
      tasks_analyzed: 0,
      success_rate: '0.0',
      proposals_queued: 0,
      timestamp: '2026-05-04T09:00:00Z',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.code).toBe('E-INPUT-INVALID')
    expect(body.detail).toMatch(/week/i)
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })

  it('invalid type · rejects tasks_analyzed as string with 400 + E-INPUT-INVALID', async () => {
    const req = authedRequest({
      action: 'meta_learning_complete',
      week: '2026-W18',
      tasks_analyzed: 'one hundred', // wrong type
      success_rate: '0.5',
      proposals_queued: 0,
      timestamp: '2026-05-04T09:00:00Z',
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
        action: 'meta_learning_complete',
        week: '2026-W18',
        tasks_analyzed: 1,
        success_rate: '1.0',
        proposals_queued: 0,
        timestamp: '2026-05-04T09:00:00Z',
      },
      false,
    )

    const res = await POST(req)
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.code).toBe('E-AUTH-001')
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })

  it('double action · existing health_check still routes correctly', async () => {
    const req = authedRequest({ action: 'health_check' })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.mission_control).toBe('online')
    expect(captured.table).toBeUndefined()
    expect(insertSingleResolver).not.toHaveBeenCalled()
  })
})
