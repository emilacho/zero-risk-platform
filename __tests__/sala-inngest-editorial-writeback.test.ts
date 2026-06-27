/**
 * Tests · editorial write-back → editorial_decisions (CC#2 migration
 * 202606270010) · §144 SHADOW.
 *
 * Verifies · outcome→final_verdict map · UPDATE by review_id with the human
 * verdict · non-verdict outcomes (timeout) leave PENDING · 0-row + error +
 * throw are fail-open (never throws).
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EDITORIAL_DECISIONS_TABLE,
  mapOutcomeToFinalVerdict,
  verdictToResolutionStatus,
  persistEditorialDecision,
} from '../src/lib/sala/inngest/editorial-writeback'
import type { EditorialGateOutcome } from '../src/lib/sala/inngest/editorial-gate'

const quietLogger = { warn: () => {}, info: () => {} }
const NOW = () => Date.parse('2026-06-27T12:00:00.000Z')

function outcome(over: Partial<EditorialGateOutcome>): EditorialGateOutcome {
  return {
    review_id: 'rev-1',
    resolved: true,
    outcome: 'approved',
    resolved_by: 'editor-en-jefe',
    decision_reason: 'majority green',
    timed_out: false,
    ...over,
  }
}

/** Mock supabase · `.from().update().eq().select()` returns {data,error}. */
function mockSupabase(result: { data: unknown; error: unknown }) {
  const select = vi.fn(async () => result)
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, from, update, eq, select }
}

describe('mapOutcomeToFinalVerdict', () => {
  it('maps the 3 resolutions', () => {
    expect(mapOutcomeToFinalVerdict('approved')).toBe('PASS')
    expect(mapOutcomeToFinalVerdict('rejected')).toBe('REJECT')
    expect(mapOutcomeToFinalVerdict('escalated_hitl')).toBe('ESCALATE')
  })
  it('returns null for non-verdict outcomes', () => {
    expect(mapOutcomeToFinalVerdict('timed_out')).toBeNull()
    expect(mapOutcomeToFinalVerdict('expired')).toBeNull()
    expect(mapOutcomeToFinalVerdict('cancelled')).toBeNull()
  })
})

describe('verdictToResolutionStatus', () => {
  it('reverse maps', () => {
    expect(verdictToResolutionStatus('PASS')).toBe('approved')
    expect(verdictToResolutionStatus('REJECT')).toBe('rejected')
    expect(verdictToResolutionStatus('ESCALATE')).toBe('escalated_hitl')
    expect(verdictToResolutionStatus(null)).toBeNull()
    expect(verdictToResolutionStatus('weird')).toBeNull()
  })
})

describe('persistEditorialDecision', () => {
  it('UPDATEs editorial_decisions by review_id with the human verdict', async () => {
    const { client, from, update, eq, select } = mockSupabase({
      data: [{ id: 'dec-1' }],
      error: null,
    })
    const r = await persistEditorialDecision(client, outcome({ outcome: 'approved' }), {
      now: NOW,
      logger: quietLogger,
    })
    expect(from).toHaveBeenCalledWith(EDITORIAL_DECISIONS_TABLE)
    expect(update).toHaveBeenCalledWith({
      status: 'RESOLVED',
      final_verdict: 'PASS',
      resolved_by: 'editor-en-jefe',
      resolved_at: '2026-06-27T12:00:00.000Z',
      rationale: 'majority green',
    })
    expect(eq).toHaveBeenCalledWith('review_id', 'rev-1')
    expect(select).toHaveBeenCalled()
    expect(r).toEqual({ ok: true, written: true })
  })

  it('rejected → REJECT', async () => {
    const { client, update } = mockSupabase({ data: [{ id: 'd' }], error: null })
    await persistEditorialDecision(client, outcome({ outcome: 'rejected' }), {
      now: NOW,
      logger: quietLogger,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ final_verdict: 'REJECT', status: 'RESOLVED' }),
    )
  })

  it('non-verdict outcome (timeout) · no write · row stays PENDING', async () => {
    const { client, from } = mockSupabase({ data: [], error: null })
    const r = await persistEditorialDecision(
      client,
      outcome({ outcome: 'timed_out', resolved: false, timed_out: true }),
      { logger: quietLogger },
    )
    expect(from).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
    expect(r.written).toBe(false)
    expect(r.reason).toMatch(/non-verdict/)
  })

  it('0 rows matched · written:false · NOT an error', async () => {
    const { client } = mockSupabase({ data: [], error: null })
    const r = await persistEditorialDecision(client, outcome({}), {
      now: NOW,
      logger: quietLogger,
    })
    expect(r.ok).toBe(true)
    expect(r.written).toBe(false)
    expect(r.reason).toBe('no_row_for_review_id')
  })

  it('supabase error (table missing) · fail-open · ok:false · never throws', async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: 'relation "editorial_decisions" does not exist' },
    })
    const r = await persistEditorialDecision(client, outcome({}), {
      now: NOW,
      logger: quietLogger,
    })
    expect(r.ok).toBe(false)
    expect(r.written).toBe(false)
    expect(r.reason).toMatch(/does not exist/)
  })

  it('thrown error · fail-open · never rejects', async () => {
    const from = vi.fn(() => {
      throw new Error('network down')
    })
    const client = { from } as unknown as Pick<SupabaseClient, 'from'>
    const r = await persistEditorialDecision(client, outcome({}), {
      now: NOW,
      logger: quietLogger,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/network down/)
  })
})
