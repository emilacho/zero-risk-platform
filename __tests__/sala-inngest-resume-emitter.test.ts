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
  buildEditorialResolutionFromReviewRow,
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

describe('buildEditorialResolutionFromReviewRow', () => {
  it('maps a terminal review row → resolution', () => {
    const res = buildEditorialResolutionFromReviewRow({
      id: 'rev-9',
      status: 'rejected',
      hitl_resolved_by: 'editor-en-jefe',
      decision_reason: 'majority red',
    })
    expect(res).toEqual({
      review_id: 'rev-9',
      status: 'rejected',
      resolved_by: 'editor-en-jefe',
      decision_reason: 'majority red',
    })
  })

  it('returns null for a still-pending row (nothing to emit)', () => {
    expect(
      buildEditorialResolutionFromReviewRow({ id: 'rev-9', status: 'pending' }),
    ).toBeNull()
  })

  it('accepts escalated_hitl as terminal/resolvable', () => {
    const res = buildEditorialResolutionFromReviewRow({
      id: 'rev-9',
      status: 'escalated_hitl',
    })
    expect(res?.status).toBe('escalated_hitl')
    expect(res?.resolved_by).toBeNull()
  })
})
