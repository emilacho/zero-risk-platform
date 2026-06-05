/**
 * Tests · sala-router-consumer parsing · event shape contract from PR #176.
 */
import { describe, it, expect } from 'vitest'
import { isIntakeEvent, parseIntakeEvent } from '@/lib/sala-router-consumer'
import type { PersistedEvent } from '@/lib/sala-event-log'

/**
 * Canon canonical · fixture matches what PR #176 orchestrator writes.
 * If PR #176 ever changes the event shape, update this fixture + the
 * parsing contract test (canon §148 single source of truth).
 */
function intakeFixture(overrides: Partial<PersistedEvent> = {}): PersistedEvent {
  return {
    event_id: 'evt-intake-1',
    sequence: 1,
    occurred_at: '2026-06-05T18:00:00Z',
    tenant_id: 'naufrago',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    stream_id: 'sala/v1/naufrago/d69100b5/onboard/2026-W23/aabbccddeeff',
    correlation_id: 'corr-1',
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: 'ONBOARD.intake.ventas/deal-won.onboard',
    idempotency_key: 'idem-1',
    logical_period: '2026-W23',
    input_hash: null,
    workflow_run_id: null,
    step_id: 'intake.ventas/deal-won.onboard',
    step_state: 'done',
    attempt: null,
    payload: {
      source: 'sala-ingress',
      intake_source: 'ventas/deal-won',
      intake_intent: 'onboard',
      intake_tier: 'B',
      intake_auth_method: 'hmac',
      worker_workflow_id: 'LyVoKcrypS5uLyuu',
      envelope_payload: { client_name: 'Naufrago' },
    },
    provenance_tag: null,
    agent_invocation_ref: null,
    gate_type: null,
    created_at: '2026-06-05T18:00:00Z',
    ...overrides,
  }
}

describe('isIntakeEvent', () => {
  it('accepts step_completed events with intake.* step_id', () => {
    expect(isIntakeEvent(intakeFixture())).toBe(true)
  })

  it('rejects non step_completed events', () => {
    expect(isIntakeEvent(intakeFixture({ event_type: 'step_started' }))).toBe(false)
    expect(isIntakeEvent(intakeFixture({ event_type: 'gate_pending' }))).toBe(false)
  })

  it('rejects step_id not starting with intake.', () => {
    expect(isIntakeEvent(intakeFixture({ step_id: 'phase_1_strategy' }))).toBe(false)
    expect(isIntakeEvent(intakeFixture({ step_id: 'router.dispatch.x.y' }))).toBe(false)
    expect(isIntakeEvent(intakeFixture({ step_id: null }))).toBe(false)
  })

  it('accepts hierarchical source in step_id', () => {
    expect(
      isIntakeEvent(intakeFixture({ step_id: 'intake.marketing/campaign-brief.campaign' })),
    ).toBe(true)
  })
})

describe('parseIntakeEvent · happy path', () => {
  it('extracts canonical fields from PR #176 fixture', () => {
    const r = parseIntakeEvent(intakeFixture())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.event_id).toBe('evt-intake-1')
      expect(r.value.intake_source).toBe('ventas/deal-won')
      expect(r.value.intake_intent).toBe('onboard')
      expect(r.value.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
      expect(r.value.journey_type).toBe('ONBOARD')
      expect(r.value.stream_id).toBe('sala/v1/naufrago/d69100b5/onboard/2026-W23/aabbccddeeff')
    }
  })

  it('keeps source_event reference for causation chain', () => {
    const event = intakeFixture()
    const r = parseIntakeEvent(event)
    if (r.ok) expect(r.value.source_event).toBe(event)
  })
})

describe('parseIntakeEvent · field-level rejections', () => {
  it('rejects non-intake step_id with prefix mismatch reason', () => {
    const r = parseIntakeEvent(intakeFixture({ step_id: 'other.x' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/does not match intake prefix/)
  })

  it('rejects missing stream_id', () => {
    const r = parseIntakeEvent(intakeFixture({ stream_id: '' as unknown as string }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/stream_id required/)
  })

  it('rejects missing correlation_id', () => {
    const r = parseIntakeEvent(intakeFixture({ correlation_id: '' as unknown as string }))
    expect(r.ok).toBe(false)
  })

  it('rejects missing tenant_id', () => {
    const r = parseIntakeEvent(intakeFixture({ tenant_id: '' }))
    expect(r.ok).toBe(false)
  })

  it('rejects missing client_id', () => {
    const r = parseIntakeEvent(intakeFixture({ client_id: '' }))
    expect(r.ok).toBe(false)
  })

  it('rejects unknown journey_type', () => {
    const r = parseIntakeEvent(intakeFixture({ journey_type: 'MYSTERY' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/not in canonical set/)
  })

  it('accepts other canonical journey_types', () => {
    for (const j of ['PRODUCE', 'ACQUIRE', 'ALWAYS_ON', 'REVIEW', 'GROWTH']) {
      const r = parseIntakeEvent(intakeFixture({ journey_type: j }))
      expect(r.ok).toBe(true)
    }
  })

  it('rejects missing payload.intake_source', () => {
    const r = parseIntakeEvent(
      intakeFixture({ payload: { intake_intent: 'onboard', worker_workflow_id: 'x' } }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/intake_source/)
  })

  it('rejects missing payload.intake_intent', () => {
    const r = parseIntakeEvent(
      intakeFixture({ payload: { intake_source: 'x', worker_workflow_id: 'y' } }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/intake_intent/)
  })

  it('rejects missing payload.worker_workflow_id', () => {
    const r = parseIntakeEvent(
      intakeFixture({ payload: { intake_source: 'x', intake_intent: 'y' } }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/worker_workflow_id/)
  })
})
