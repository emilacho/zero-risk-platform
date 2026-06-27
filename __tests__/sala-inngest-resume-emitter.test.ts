/**
 * Tests · editorial resume seam (SALA_G6_HOOK_MODE) · §144 SHADOW.
 *
 * Verifies · shadow default suppresses emit · live mode sends the canonical
 * event with mapped data · the review-row → resolution mapper · fail-open on
 * send error. No Inngest cloud (client injected).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getResumeHookMode,
  emitEditorialResolution,
  buildEditorialResolutionFromDecisionRow,
  EDITORIAL_DECISION_RESOLVED_EVENT,
  type EditorialResolution,
} from '../src/lib/sala/inngest'

const resolution: EditorialResolution = {
  review_id: 'rev-9',
  status: 'approved',
  resolved_by: 'editor-en-jefe',
  decision_reason: 'majority green · 3/3',
}

const quietLogger = { warn: () => {}, info: () => {} }

afterEach(() => {
  delete process.env.SALA_G6_HOOK_MODE
})

describe('getResumeHookMode · flag default OFF', () => {
  it('defaults to shadow when unset', () => {
    delete process.env.SALA_G6_HOOK_MODE
    expect(getResumeHookMode()).toBe('shadow')
  })
  it('returns live ONLY when explicitly "live"', () => {
    process.env.SALA_G6_HOOK_MODE = 'live'
    expect(getResumeHookMode()).toBe('live')
    process.env.SALA_G6_HOOK_MODE = 'on'
    expect(getResumeHookMode()).toBe('shadow')
  })
})

describe('emitEditorialResolution · shadow (default)', () => {
  it('does NOT call the client · returns sent:false', async () => {
    const send = vi.fn(async () => ({}))
    const r = await emitEditorialResolution(resolution, {
      mode: 'shadow',
      client: { send },
      logger: quietLogger,
    })
    expect(send).not.toHaveBeenCalled()
    expect(r).toEqual({ sent: false, mode: 'shadow', review_id: 'rev-9' })
  })
})

describe('emitEditorialResolution · live', () => {
  it('sends the canonical event with mapped data', async () => {
    const send = vi.fn(async () => ({ ids: ['evt-1'] }))
    const r = await emitEditorialResolution(resolution, {
      mode: 'live',
      client: { send },
      logger: quietLogger,
    })
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith({
      name: EDITORIAL_DECISION_RESOLVED_EVENT,
      data: {
        review_id: 'rev-9',
        status: 'approved',
        resolved_by: 'editor-en-jefe',
        decision_reason: 'majority green · 3/3',
      },
    })
    expect(r.sent).toBe(true)
    expect(r.mode).toBe('live')
  })

  it('fail-open · send throws → sent:false + error · never rejects', async () => {
    const send = vi.fn(async () => {
      throw new Error('inngest 503')
    })
    const r = await emitEditorialResolution(resolution, {
      mode: 'live',
      client: { send },
      logger: quietLogger,
    })
    expect(r.sent).toBe(false)
    expect(r.error).toMatch(/inngest 503/)
  })
})

describe('buildEditorialResolutionFromDecisionRow', () => {
  it('maps a RESOLVED editorial_decisions row → resolution (REJECT→rejected)', () => {
    const res = buildEditorialResolutionFromDecisionRow({
      review_id: 'rev-9',
      status: 'RESOLVED',
      final_verdict: 'REJECT',
      resolved_by: 'editor-en-jefe',
      rationale: 'majority red',
    })
    expect(res).toEqual({
      review_id: 'rev-9',
      status: 'rejected',
      resolved_by: 'editor-en-jefe',
      decision_reason: 'majority red',
    })
  })

  it('PASS → approved · ESCALATE → escalated_hitl', () => {
    expect(
      buildEditorialResolutionFromDecisionRow({
        review_id: 'r', status: 'RESOLVED', final_verdict: 'PASS',
      })?.status,
    ).toBe('approved')
    expect(
      buildEditorialResolutionFromDecisionRow({
        review_id: 'r', status: 'RESOLVED', final_verdict: 'ESCALATE',
      })?.status,
    ).toBe('escalated_hitl')
  })

  it('returns null for a still-PENDING row (nothing to emit)', () => {
    expect(
      buildEditorialResolutionFromDecisionRow({
        review_id: 'rev-9', status: 'PENDING', final_verdict: null,
      }),
    ).toBeNull()
  })

  it('returns null for RESOLVED without a final_verdict', () => {
    expect(
      buildEditorialResolutionFromDecisionRow({ review_id: 'rev-9', status: 'RESOLVED' }),
    ).toBeNull()
  })
})
