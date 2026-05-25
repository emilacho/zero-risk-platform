/**
 * workflow-checkpoint · Sprint 8D canon · unit tests
 *
 * Covers · getCheckpoint · shouldSkipStep · saveCheckpoint · listCheckpointsForClient
 * · resolveForceRestart · all with mocked Supabase client (in-memory store).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getCheckpoint,
  saveCheckpoint,
  shouldSkipStep,
  listCheckpointsForClient,
  resolveForceRestart,
  type Checkpoint,
  type CheckpointKey,
} from '../workflow-checkpoint'

interface MockStore {
  rows: Record<string, Checkpoint>
  errors: { op: string; msg: string }[]
}

function buildMockSupabase(store: MockStore): SupabaseClient {
  const buildKey = (workflow_id: string, client_id: string, step_name: string) =>
    `${workflow_id}::${client_id}::${step_name}`

  const fromFn = (table: string) => {
    if (table !== 'workflow_checkpoints') {
      throw new Error(`unexpected table ${table}`)
    }
    const query = {
      _filters: {} as Record<string, string>,
      _order: null as null | { col: string; asc: boolean },
      select(_cols: string) {
        return this
      },
      eq(col: string, val: string) {
        this._filters[col] = val
        return this
      },
      order(col: string, opts?: { ascending?: boolean }) {
        this._order = { col, asc: opts?.ascending ?? true }
        return this
      },
      maybeSingle() {
        const { workflow_id, client_id, step_name } = this._filters
        if (!workflow_id || !client_id || !step_name) {
          return Promise.resolve({ data: null, error: null })
        }
        const k = buildKey(workflow_id, client_id, step_name)
        const data = store.rows[k] ?? null
        return Promise.resolve({ data, error: null })
      },
      then(resolve: (v: { data: Checkpoint[]; error: null }) => unknown) {
        const all = Object.values(store.rows)
        const filtered = all.filter((r) => {
          for (const [k, v] of Object.entries(this._filters)) {
            if ((r as unknown as Record<string, unknown>)[k] !== v) return false
          }
          return true
        })
        if (this._order) {
          const col = this._order.col as keyof Checkpoint
          filtered.sort((a, b) => {
            const av = String(a[col] ?? '')
            const bv = String(b[col] ?? '')
            return this._order!.asc ? av.localeCompare(bv) : bv.localeCompare(av)
          })
        }
        return Promise.resolve({ data: filtered, error: null }).then(resolve)
      },
      upsert(row: Partial<Checkpoint>) {
        const k = buildKey(row.workflow_id!, row.client_id ?? '', row.step_name!)
        const existing = store.rows[k]
        const id = existing?.id ?? `cp_${k}`
        const created_at = existing?.created_at ?? new Date().toISOString()
        store.rows[k] = {
          id,
          workflow_id: row.workflow_id!,
          workflow_execution_id: row.workflow_execution_id ?? null,
          client_id: row.client_id ?? null,
          step_name: row.step_name!,
          step_status: row.step_status!,
          output_ref: row.output_ref ?? null,
          cost_usd: row.cost_usd ?? null,
          duration_ms: row.duration_ms ?? null,
          error_message: row.error_message ?? null,
          created_at,
          updated_at: new Date().toISOString(),
        }
        return Promise.resolve({ error: null })
      },
    }
    return query
  }

  return { from: fromFn } as unknown as SupabaseClient
}

describe('workflow-checkpoint · canon Sprint 8D', () => {
  let store: MockStore
  let supabase: SupabaseClient
  const key: CheckpointKey = {
    workflowId: 'RwUo7G2PmZNqyMbe',
    clientId: '5c2d2dd5-a49e-4da3-87c3-03b504b734f6',
    stepName: 'brand-strategist',
  }

  beforeEach(() => {
    store = { rows: {}, errors: [] }
    supabase = buildMockSupabase(store)
  })

  // ── getCheckpoint ──

  it('getCheckpoint · returns null when no row exists', async () => {
    const cp = await getCheckpoint(supabase, key)
    expect(cp).toBeNull()
  })

  it('getCheckpoint · returns null when client_id missing', async () => {
    const cp = await getCheckpoint(supabase, { ...key, clientId: null })
    expect(cp).toBeNull()
  })

  it('getCheckpoint · returns existing row after save', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'completed', outputRef: { table: 'agents_log', id: 'log-1' } })
    const cp = await getCheckpoint(supabase, key)
    expect(cp).not.toBeNull()
    expect(cp?.step_status).toBe('completed')
    expect(cp?.output_ref).toEqual({ table: 'agents_log', id: 'log-1' })
  })

  // ── saveCheckpoint ──

  it('saveCheckpoint · returns false when client_id missing', async () => {
    const ok = await saveCheckpoint(supabase, { ...key, clientId: null, status: 'completed' })
    expect(ok).toBe(false)
  })

  it('saveCheckpoint · upserts canonical · same key → single row · status updates', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'in_progress' })
    await saveCheckpoint(supabase, { ...key, status: 'completed', outputRef: { id: 'r1' } })
    const cp = await getCheckpoint(supabase, key)
    expect(cp?.step_status).toBe('completed')
    expect(cp?.output_ref).toEqual({ id: 'r1' })
    const rows = Object.values(store.rows).filter((r) => r.step_name === key.stepName)
    expect(rows.length).toBe(1)
  })

  it('saveCheckpoint · cost + duration persisted', async () => {
    await saveCheckpoint(supabase, {
      ...key,
      status: 'completed',
      costUsd: 0.123,
      durationMs: 5432,
    })
    const cp = await getCheckpoint(supabase, key)
    expect(cp?.cost_usd).toBe(0.123)
    expect(cp?.duration_ms).toBe(5432)
  })

  // ── shouldSkipStep ──

  it('shouldSkipStep · no skip when client_id missing · reason=no_client_id', async () => {
    const r = await shouldSkipStep(supabase, { ...key, clientId: null })
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('no_client_id')
  })

  it('shouldSkipStep · no skip when no checkpoint exists', async () => {
    const r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('no_checkpoint')
  })

  it('shouldSkipStep · SKIP canonical when status=completed', async () => {
    await saveCheckpoint(supabase, {
      ...key,
      status: 'completed',
      outputRef: { table: 'agents_log', id: 'log-1' },
    })
    const r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(true)
    expect(r.reason).toBe('completed')
    expect(r.checkpoint?.output_ref).toEqual({ table: 'agents_log', id: 'log-1' })
  })

  it('shouldSkipStep · NO skip when forceRestart=true even if completed', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'completed', outputRef: { id: 'x' } })
    const r = await shouldSkipStep(supabase, key, { forceRestart: true })
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('force_restart')
    expect(r.checkpoint).not.toBeNull()
  })

  it('shouldSkipStep · NO skip when status=in_progress (allow concurrent caller to proceed)', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'in_progress' })
    const r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('in_progress')
  })

  it('shouldSkipStep · NO skip when status=failed (retry allowed)', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'failed', errorMessage: 'timeout 300s' })
    const r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('failed')
  })

  it('shouldSkipStep · NO skip for pending or skipped statuses', async () => {
    await saveCheckpoint(supabase, { ...key, status: 'pending' })
    let r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('unknown_status')

    await saveCheckpoint(supabase, { ...key, status: 'skipped' })
    r = await shouldSkipStep(supabase, key)
    expect(r.skip).toBe(false)
    expect(r.reason).toBe('unknown_status')
  })

  // ── listCheckpointsForClient ──

  it('listCheckpointsForClient · returns empty when client_id null', async () => {
    const rows = await listCheckpointsForClient(supabase, key.workflowId, null)
    expect(rows).toEqual([])
  })

  it('listCheckpointsForClient · returns all rows for (workflow_id, client_id) pair', async () => {
    await saveCheckpoint(supabase, { ...key, stepName: 'step-1', status: 'completed' })
    await saveCheckpoint(supabase, { ...key, stepName: 'step-3', status: 'completed' })
    await saveCheckpoint(supabase, { ...key, stepName: 'step-4', status: 'failed' })
    const rows = await listCheckpointsForClient(supabase, key.workflowId, key.clientId)
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.step_name).sort()).toEqual(['step-1', 'step-3', 'step-4'])
  })

  // ── resolveForceRestart ──

  it('resolveForceRestart · false on null/undefined', () => {
    expect(resolveForceRestart(null)).toBe(false)
    expect(resolveForceRestart(undefined)).toBe(false)
  })

  it('resolveForceRestart · true on top-level forceRestart or force_restart', () => {
    expect(resolveForceRestart({ forceRestart: true })).toBe(true)
    expect(resolveForceRestart({ force_restart: true })).toBe(true)
  })

  it('resolveForceRestart · true on nested context.forceRestart or context.force_restart', () => {
    expect(resolveForceRestart({ context: { forceRestart: true } })).toBe(true)
    expect(resolveForceRestart({ context: { force_restart: true } })).toBe(true)
  })

  it('resolveForceRestart · false when value is not literally true', () => {
    expect(resolveForceRestart({ forceRestart: 'true' })).toBe(false)
    expect(resolveForceRestart({ forceRestart: 1 })).toBe(false)
    expect(resolveForceRestart({})).toBe(false)
  })
})
