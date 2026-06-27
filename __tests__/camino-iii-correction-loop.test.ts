/**
 * Tests · Camino III lazo de corrección · cap + evento + persist (SPEC §5/§7).
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORRECTION_CYCLE_CAP,
  CORRECTION_REQUIRED_EVENT,
  evaluateCorrectionCap,
  buildCorrectionRequiredEvent,
  persistCorrectionDecision,
} from '../src/lib/camino-iii/correction-loop'
import type { ConsolidatedCorrection } from '../src/lib/camino-iii/corrections'

const quietLogger = { warn: () => {}, info: () => {} }
const NOW = () => Date.parse('2026-06-27T12:00:00.000Z')

const sampleCorrections: ConsolidatedCorrection[] = [
  {
    eje: 'factual',
    severidad: 'red',
    donde: 'p1',
    problema: 'x',
    por_que: 'y',
    cambio_sugerido: 'z',
    reviewer_agent: 'editor-en-jefe',
    is_voting: true,
  },
]

describe('evaluateCorrectionCap · §150 tope 3 ciclos', () => {
  it('cap constant is 3', () => {
    expect(CORRECTION_CYCLE_CAP).toBe(3)
  })
  it('re-dispatches and increments while under cap (0→1, 1→2, 2→3)', () => {
    expect(evaluateCorrectionCap(0)).toMatchObject({ action: 're_dispatch', next_revision_count: 1 })
    expect(evaluateCorrectionCap(1)).toMatchObject({ action: 're_dispatch', next_revision_count: 2 })
    expect(evaluateCorrectionCap(2)).toMatchObject({ action: 're_dispatch', next_revision_count: 3 })
  })
  it('escalates to human at the cap (3) and beyond', () => {
    expect(evaluateCorrectionCap(3)).toMatchObject({ action: 'escalate_human', next_revision_count: 3 })
    expect(evaluateCorrectionCap(5).action).toBe('escalate_human')
  })
  it('clamps negative / fractional input', () => {
    expect(evaluateCorrectionCap(-2).next_revision_count).toBe(1)
    expect(evaluateCorrectionCap(1.9).next_revision_count).toBe(2)
  })
})

describe('buildCorrectionRequiredEvent · evento ligero', () => {
  it('carries item_id + verdict + revision_count · NOT the full text', () => {
    const e = buildCorrectionRequiredEvent({
      item_type: 'content_deliverable',
      item_id: 'piece-1',
      revision_count: 1,
      journey_id: 'stream-abc',
      client_id: 'client-1',
    })
    expect(e.event_type).toBe(CORRECTION_REQUIRED_EVENT)
    expect(e.item_id).toBe('piece-1')
    expect(e.verdict).toBe('REJECT')
    expect(e.revision_count).toBe(1)
    expect(e.journey_id).toBe('stream-abc')
    expect(e.operation_type).toBe('camino_iii.rejected_with_corrections')
    // light · no correction text fields on the event
    expect(Object.keys(e)).not.toContain('corrections')
  })
})

/** Mock supabase · `.from().upsert().select()` → {data,error}. */
function mockSupabase(result: { data: unknown; error: unknown }) {
  const select = vi.fn(async () => result)
  const upsert = vi.fn(() => ({ select }))
  const from = vi.fn(() => ({ upsert }))
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, from, upsert, select }
}

describe('persistCorrectionDecision · editorial_decisions upsert', () => {
  it('REJECT · upsert PENDING with corrections + revision_count · onConflict item', async () => {
    const { client, from, upsert } = mockSupabase({ data: [{ id: 'd1' }], error: null })
    const r = await persistCorrectionDecision(
      client,
      {
        review_id: 'rev-1',
        item_type: 'content_deliverable',
        item_id: 'piece-1',
        client_id: 'client-1',
        corrections: sampleCorrections,
        revision_count: 1,
        status: 'REJECT',
        rationale: 'majority red',
      },
      { now: NOW, logger: quietLogger },
    )
    expect(from).toHaveBeenCalledWith('editorial_decisions')
    const [row, opts] = upsert.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(row).toMatchObject({
      item_type: 'content_deliverable',
      item_id: 'piece-1',
      status: 'PENDING',
      final_verdict: null,
      revision_count: 1,
    })
    expect(row.corrections).toHaveLength(1)
    expect(opts).toEqual({ onConflict: 'item_type,item_id' })
    expect(r).toEqual({ ok: true, written: true })
  })

  it('ESCALATE · status RESOLVED + final_verdict ESCALATE + resolved_at', async () => {
    const { client, upsert } = mockSupabase({ data: [{ id: 'd1' }], error: null })
    await persistCorrectionDecision(
      client,
      {
        review_id: 'rev-1',
        item_type: 'content_deliverable',
        item_id: 'piece-1',
        corrections: sampleCorrections,
        revision_count: 3,
        status: 'ESCALATE',
      },
      { now: NOW, logger: quietLogger },
    )
    const [row] = upsert.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(row).toMatchObject({
      status: 'RESOLVED',
      final_verdict: 'ESCALATE',
      resolved_at: '2026-06-27T12:00:00.000Z',
      revision_count: 3,
    })
  })

  it('fail-open on error · ok:false · never throws', async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: 'column "corrections" does not exist' },
    })
    const r = await persistCorrectionDecision(
      client,
      {
        review_id: 'rev-1',
        item_type: 't',
        item_id: 'i',
        corrections: [],
        revision_count: 1,
        status: 'REJECT',
      },
      { now: NOW, logger: quietLogger },
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/does not exist/)
  })
})
