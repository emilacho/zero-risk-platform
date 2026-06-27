/**
 * Tests · editorial gate · Inngest durable HITL wait (Camino III) · §144.
 *
 * §148 honest · STRUCTURE + pure-logic only · no Inngest cloud (CI has no
 * creds · the durable `step.waitForEvent` runtime property was proven by the
 * spike RESULTS-CC3-inngest-runtime-verify §2.3). The pure `decideEditorialOutcome`
 * covers every branch the live function delegates to.
 */
import { describe, it, expect } from 'vitest'
import {
  EDITORIAL_GATE_REQUESTED_EVENT,
  EDITORIAL_DECISION_RESOLVED_EVENT,
  EDITORIAL_GATE_TIMEOUT,
  editorialGateFn,
  decideEditorialOutcome,
  LIVE_FUNCTIONS,
  type EditorialGateRequest,
  type EditorialResolution,
} from '../src/lib/sala/inngest'

const baseReq: EditorialGateRequest = {
  review_id: 'rev-123',
  stream_id: 'stream-abc',
  workflow_id: 'wf-xyz',
  client_id: 'client-1',
}

describe('editorial gate · event vocabulary', () => {
  it('declares canonical gate + resolve event names', () => {
    expect(EDITORIAL_GATE_REQUESTED_EVENT).toBe('editorial/gate.requested')
    expect(EDITORIAL_DECISION_RESOLVED_EVENT).toBe('editorial/decision.resolved')
  })
  it('uses the 24h canonical Camino III window', () => {
    expect(EDITORIAL_GATE_TIMEOUT).toBe('24h')
  })
})

describe('decideEditorialOutcome · resolution branches', () => {
  it('approved · maps through with resolver + reason', () => {
    const res: EditorialResolution = {
      review_id: 'rev-123',
      status: 'approved',
      resolved_by: 'editor-en-jefe',
      decision_reason: 'majority green',
    }
    const o = decideEditorialOutcome(baseReq, res)
    expect(o).toEqual({
      review_id: 'rev-123',
      resolved: true,
      outcome: 'approved',
      resolved_by: 'editor-en-jefe',
      decision_reason: 'majority green',
      timed_out: false,
    })
  })

  it('rejected · maps through', () => {
    const o = decideEditorialOutcome(baseReq, {
      review_id: 'rev-123',
      status: 'rejected',
    })
    expect(o.resolved).toBe(true)
    expect(o.outcome).toBe('rejected')
    expect(o.resolved_by).toBeNull()
    expect(o.timed_out).toBe(false)
  })

  it('escalated_hitl · still a resolution (not a timeout)', () => {
    const o = decideEditorialOutcome(baseReq, {
      review_id: 'rev-123',
      status: 'escalated_hitl',
    })
    expect(o.resolved).toBe(true)
    expect(o.outcome).toBe('escalated_hitl')
    expect(o.timed_out).toBe(false)
  })

  it('timeout (null) · flagged timed_out · not resolved', () => {
    const o = decideEditorialOutcome(baseReq, null)
    expect(o.resolved).toBe(false)
    expect(o.outcome).toBe('timed_out')
    expect(o.timed_out).toBe(true)
    expect(o.review_id).toBe('rev-123')
    expect(o.decision_reason).toMatch(/timed out/)
  })
})

describe('editorial gate · function registration', () => {
  it('editorialGateFn has a stable id', () => {
    const anyFn = editorialGateFn as unknown as {
      id?: string | (() => string)
      opts?: { id?: string }
    }
    const id =
      typeof anyFn.id === 'function' ? anyFn.id() : (anyFn.id ?? anyFn.opts?.id ?? '')
    expect(typeof id).toBe('string')
    expect(id).toContain('editorial-gate-camino-iii')
  })

  it('lives in LIVE_FUNCTIONS (gated · NOT in synthetic set)', () => {
    expect(LIVE_FUNCTIONS.length).toBeGreaterThanOrEqual(1)
    expect(LIVE_FUNCTIONS).toContain(editorialGateFn)
  })
})
