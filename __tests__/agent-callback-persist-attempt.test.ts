/**
 * Tests · Track P · agent_callback_attempts persistence (SPEC 2026-06-09).
 *
 * Validates the fire-and-forget audit insert · success path, table-missing
 * console fallback, throw-safety, and the makeCallbackAttemptLogger factory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CALLBACK_ATTEMPTS_TABLE,
  makeCallbackAttemptLogger,
  persistCallbackAttempt,
} from '@/lib/agent-async-callback/persist-attempt'
import type { CallbackAttemptLog } from '@/lib/agent-async-callback'

const sampleLog: CallbackAttemptLog = {
  workflow_id: 'wf-abc',
  callback_url: 'https://n8n.test/resume/x',
  attempt_number: 2,
  status: 'non_2xx',
  http_status_code: 503,
  error_message: 'callback URL responded 503',
  attempted_at: '2026-06-27T00:00:00.000Z',
}

function mockSupabase(insertImpl: () => Promise<{ error: unknown }>) {
  const insert = vi.fn(insertImpl)
  const from = vi.fn(() => ({ insert }))
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

describe('persistCallbackAttempt', () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
  })

  it('inserts the row into agent_callback_attempts on success', async () => {
    const { client, from, insert } = mockSupabase(async () => ({ error: null }))
    await persistCallbackAttempt(client, sampleLog)
    expect(from).toHaveBeenCalledWith(CALLBACK_ATTEMPTS_TABLE)
    expect(insert).toHaveBeenCalledWith({
      workflow_id: 'wf-abc',
      callback_url: 'https://n8n.test/resume/x',
      attempt_number: 2,
      status: 'non_2xx',
      http_status_code: 503,
      error_message: 'callback URL responded 503',
      attempted_at: '2026-06-27T00:00:00.000Z',
    })
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('logs console.error when the table is missing · never throws', async () => {
    const { client } = mockSupabase(async () => ({
      error: { message: 'relation "agent_callback_attempts" does not exist' },
    }))
    await expect(persistCallbackAttempt(client, sampleLog)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledOnce()
    expect(String(errSpy.mock.calls[0][0])).toMatch(/persist failed/)
  })

  it('swallows a thrown insert · never rejects', async () => {
    const { client } = mockSupabase(async () => {
      throw new Error('network down')
    })
    await expect(persistCallbackAttempt(client, sampleLog)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledOnce()
    expect(String(errSpy.mock.calls[0][0])).toMatch(/persist threw/)
  })
})

describe('makeCallbackAttemptLogger', () => {
  it('returns undefined when no Supabase client (console-only path)', () => {
    expect(makeCallbackAttemptLogger(null)).toBeUndefined()
  })

  it('returns a sync hook that fires the insert fire-and-forget', async () => {
    const { client, insert } = mockSupabase(async () => ({ error: null }))
    const hook = makeCallbackAttemptLogger(client)
    expect(typeof hook).toBe('function')
    hook!(sampleLog)
    // sync hook returns immediately; let the microtask flush
    await Promise.resolve()
    await Promise.resolve()
    expect(insert).toHaveBeenCalledOnce()
  })
})
