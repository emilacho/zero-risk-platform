/**
 * Tests · apify_get_run_status (des-stubeado · 2026-07-19).
 * Mockea el ApifyClient en el boundary (spy en .get) · no mockea fetch.
 */
import { describe, it, expect, vi } from 'vitest'
import { name, argsSchema, handler } from '../src/tools/apify-get-run-status.js'
import type { ApifyClient } from '../src/client.js'

const clientWith = (getImpl: (path: string) => Promise<unknown>) =>
  ({ get: vi.fn(getImpl) } as unknown as ApifyClient)

describe('apify_get_run_status', () => {
  it('name + args schema', () => {
    expect(name).toBe('apify_get_run_status')
    expect(() => argsSchema.parse({})).toThrow()
    expect(argsSchema.parse({ run_id: 'run_42' }).run_id).toBe('run_42')
  })

  it('SUCCEEDED → ok + terminal + dataset_id surfaced', async () => {
    const client = clientWith(() =>
      Promise.resolve({
        data: {
          id: 'run_42',
          status: 'SUCCEEDED',
          defaultDatasetId: 'ds_9',
          startedAt: '2026-07-19T00:00:00Z',
          finishedAt: '2026-07-19T00:05:00Z',
        },
      }),
    )
    const r = await handler(client, { run_id: 'run_42' })
    expect(r).toMatchObject({
      run_id: 'run_42',
      status: 'SUCCEEDED',
      dataset_id: 'ds_9',
      is_terminal: true,
      ok: true,
      started_at: '2026-07-19T00:00:00Z',
      finished_at: '2026-07-19T00:05:00Z',
    })
  })

  it('RUNNING → not terminal · not ok · dataset_id null', async () => {
    const client = clientWith(() => Promise.resolve({ data: { id: 'r', status: 'RUNNING' } }))
    const r = await handler(client, { run_id: 'r' })
    expect(r.is_terminal).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.dataset_id).toBeNull()
  })

  it('FAILED → terminal pero NO ok', async () => {
    const client = clientWith(() => Promise.resolve({ data: { id: 'r', status: 'FAILED' } }))
    const r = await handler(client, { run_id: 'r' })
    expect(r.is_terminal).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('llama GET /actor-runs/{run_id} url-encoded', async () => {
    const getSpy = vi.fn(() => Promise.resolve({ data: { id: 'x', status: 'RUNNING' } }))
    const client = { get: getSpy } as unknown as ApifyClient
    await handler(client, { run_id: 'weird/id' })
    expect(getSpy).toHaveBeenCalledWith('/actor-runs/weird%2Fid')
  })

  it('respuesta sin data → UNKNOWN · no crashea', async () => {
    const client = clientWith(() => Promise.resolve({}))
    const r = await handler(client, { run_id: 'r' })
    expect(r.status).toBe('UNKNOWN')
    expect(r.is_terminal).toBe(false)
  })
})
