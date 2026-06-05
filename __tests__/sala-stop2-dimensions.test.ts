/**
 * Tests · STOP-2 dimensions (Opus pre-flip canon · 2026-06-05).
 *
 * Two correctness properties this PR MUST satisfy before Phase 1 ·
 *   (a) **dispatch-único** · 1 stream/execution despite re-trigger · the
 *       sala-side adapter computes a stable idempotency token from the
 *       stream + correlation + journey + suffix · the event-log UNIQUE
 *       idempotency_key constraint catches double-fires at the storage
 *       layer. ALSO · the worker's existing Deal Won webhook must NOT
 *       co-fire when the sala dispatches (worker stays under the sala's
 *       control · NOT triggered twice).
 *   (b) **§149 correlation** · stream_id ↔ workflow_id survives the
 *       round-trip · the sala stream_id is what the worker passes as
 *       `workflow_id` to /api/agents/run-sdk · so `agent_invocations`
 *       rows carry the sala stream_id back · which the projection then
 *       reads to write step_completed events to sala_event_log.
 *
 * §148 honest · these are assertions on the WIRE SHAPE · the
 * projection/dispatcher pure code is unit-tested already · this file
 * walks both dimensions end-to-end through the pure helpers + log.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildDispatchIdempotencyToken,
  dispatchToWorkflow,
  projectAgentInvocation,
  type AgentInvocationRow,
} from '@/lib/sala-journey-dispatch'
import {
  InMemoryEventLogStorage,
  append,
} from '@/lib/sala-event-log'
import type { DispatchDecision } from '@/lib/sala-router'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = 'c-naufrago'
const SALA_STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CORR = '44444444-4444-4444-4444-444444444444'
const EVT = '55555555-5555-5555-5555-555555555555'

function workflowDispatch(): DispatchDecision {
  return {
    kind: 'dispatch',
    stream_id: SALA_STREAM,
    correlation_id: CORR,
    tenant_id: TENANT,
    client_id: CLIENT,
    journey_type: 'ONBOARD',
    step_id: 'entry',
    agent_id: 'sala-router',
    attempt: 1,
    idempotency_key: 'ik-test',
    idempotency_inputs: {
      operation_type: 'ONBOARD.entry',
      client_id: CLIENT,
      logical_period: '2026-W23',
    },
    libreto_version: 1,
    caused_by_event_id: EVT,
    target: 'workflow',
  }
}

// =====================================================================
// Dimension (a) · dispatch-único
// =====================================================================

describe('STOP-2 (a) · dispatch-único · stable idempotency token', () => {
  it('canon · 2x dispatchToWorkflow same decision → same idempotency_token in body', async () => {
    const captured: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      captured.push(JSON.parse((init?.body as string) ?? '{}'))
      return new Response('ok', { status: 200 })
    })

    const decision = workflowDispatch()
    const r1 = await dispatchToWorkflow({
      decision,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const r2 = await dispatchToWorkflow({
      decision,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.idempotency_token).toBe(r2.idempotency_token)
    }
    expect(captured[0]._sala_idempotency_token).toBe(
      captured[1]._sala_idempotency_token,
    )
    // The two webhook POSTs carry the same token · the WORKER side can
    // use this for its own idempotency check; sala-side idempotency is
    // enforced by buildDispatchIdempotencyToken stability + event-log
    // UNIQUE constraint.
  })

  it('canon · different stream → different token · no false collision', () => {
    const a = buildDispatchIdempotencyToken({
      stream_id: SALA_STREAM,
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 'onboard-worker-dispatch',
    })
    const b = buildDispatchIdempotencyToken({
      stream_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 'onboard-worker-dispatch',
    })
    expect(a).not.toBe(b)
  })

  it('canon · same stream + different correlation → different token (forensic separator)', () => {
    const a = buildDispatchIdempotencyToken({
      stream_id: SALA_STREAM,
      correlation_id: 'corr-a',
      journey_type: 'ONBOARD',
      idempotency_suffix: 's',
    })
    const b = buildDispatchIdempotencyToken({
      stream_id: SALA_STREAM,
      correlation_id: 'corr-b',
      journey_type: 'ONBOARD',
      idempotency_suffix: 's',
    })
    expect(a).not.toBe(b)
  })
})

describe('STOP-2 (a) · deal-won-NO-co-disparo guard · sala dispatch flag controls webhook fire', () => {
  it('canon · with sala dispatch FLAG OFF · nothing fires · worker stays in legacy Deal-Won path', async () => {
    const fetcher = vi.fn()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: false, // flag off · sala is NOT dispatching · worker
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('flag_off')
    expect(fetcher).not.toHaveBeenCalled()
    // canon · with flag off, the sala adapter cannot fire the webhook.
    // The worker still receives Deal Won via its existing webhook (the
    // sala's webhook URL is the SAME as the worker's existing entrypoint
    // · LyVo's path 'zero-risk/deal-won-onboarding') · CRITICAL detail
    // for the §144 Flip 6 sequence: enabling sala dispatch implicitly
    // doubles the trigger UNLESS the existing Deal Won source is
    // re-routed to fire via sala. Documented in spec §7 decision #2.
  })

  it('canon · with FLAG ON · sala adapter fires exactly ONCE per call (no implicit retry)', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))
    const decision = workflowDispatch()
    await dispatchToWorkflow({
      decision,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

// =====================================================================
// Dimension (b) · §149 correlation · stream_id ↔ workflow_id survives
// =====================================================================

describe('STOP-2 (b) · §149 correlation · stream_id propagates as workflow_id', () => {
  it('canon · webhook body _journey_id = stream_id (what worker passes as workflow_id to /run-sdk)', async () => {
    let captured: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })

    await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })

    // Worker template: workflow_id = {{ $json.body._journey_id }}
    // (canon · CC#4 modification to existing worker · 1 of 2 n8n nodes)
    expect(captured._journey_id).toBe(SALA_STREAM)
  })

  it('canon · projection round-trip · workflow_id from agent_invocations → stream_id in sala_event_log', async () => {
    // Simulate what the worker sends to agent_invocations with the §149
    // correlation in place: workflow_id = sala stream_id
    const row: AgentInvocationRow = {
      id: 'inv-row-1',
      workflow_id: SALA_STREAM, // carries sala stream
      workflow_execution_id: 'exec-1',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'onboarding-specialist',
      agent_name: 'onboarding-specialist',
      status: 'completed',
      cost_usd: 0.05,
      duration_ms: 1000,
      tokens_input: 50,
      tokens_output: 100,
      created_at: '2026-06-05T12:00:00Z',
    }
    const eventInput = projectAgentInvocation(row, { journey_type: 'ONBOARD' })
    expect(eventInput).not.toBeNull()
    expect(eventInput!.stream_id).toBe(SALA_STREAM)
    expect(eventInput!.tenant_id).toBe(TENANT)
    expect(eventInput!.agent_invocation_ref).toBe('inv-row-1')

    // Round-trip · append to storage · row appears under the same sala stream
    const storage = new InMemoryEventLogStorage()
    await append(storage, eventInput!)
    const events = await storage.select({
      tenant_id: TENANT,
      stream_id: SALA_STREAM,
    })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('onboarding-specialist')
  })

  it('canon · §149 fail-safe · if worker forgets the correlation (uses legacy n8n workflow_id) → projection SKIPS', () => {
    const row: AgentInvocationRow = {
      id: 'inv-row-1',
      workflow_id: 'LyVoKcrypS5uLyuu', // legacy · forgot to use _journey_id
      workflow_execution_id: 'exec-1',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'onboarding-specialist',
      created_at: '2026-06-05T12:00:00Z',
    }
    const eventInput = projectAgentInvocation(row)
    expect(eventInput).toBeNull()
    // canon · the row does NOT corrupt the sala stream · it stays in
    // agent_invocations only (legacy observability). The CC#4 worker
    // modification IS load-bearing for the correlation to survive.
  })
})
