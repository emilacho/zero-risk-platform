/**
 * Tests · Costura B contract · §149 correlation round-trip.
 *
 * Sprint 12 SEAM-CLOSE Costura B (2026-06-05) · CC#4 owns the worker-
 * side edit (existing run-sdk node body-template must propagate
 * `_journey_id` → `workflow_id`). This test validates that IF CC#4's
 * modification lands correctly, the projection writes the right
 * `step_completed` event to the right sala stream.
 *
 * The test does NOT exercise the n8n worker · it simulates the
 * round-trip ·
 *   1. Sala dispatches to worker via `dispatchToWorkflow` · webhook
 *      body carries `_journey_id = stream_id`
 *   2. Worker (simulated) calls `/api/agents/run-sdk` with
 *      `workflow_id = body._journey_id` (CC#4's pending edit)
 *   3. `/api/agents/run-sdk` writes a row to `agent_invocations` with
 *      `workflow_id = sala stream_id`
 *   4. Projection reads the row, synthesizes a `step_completed` event
 *      to `sala_event_log` with `stream_id = sala stream_id`
 *
 * If CC#4 forgets the edit · the projection's heuristic filter
 * (workflow_id legacy n8n shape) SKIPS the row · test verifies the
 * fail-safe.
 *
 * Drift detection · if the contract changes (e.g. the worker stops
 * using `_journey_id` as the propagation field), this test breaks
 * and CC#3 + CC#4 must re-align.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  dispatchToWorkflow,
  projectAgentInvocation,
  type AgentInvocationRow,
} from '@/lib/sala-journey-dispatch'
import { InMemoryEventLogStorage, append } from '@/lib/sala-event-log'
import type { DispatchDecision } from '@/lib/sala-router'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = 'c-naufrago-stub'
const SALA_STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CORR = '44444444-4444-4444-4444-444444444444'
const EVT = '55555555-5555-5555-5555-555555555555'

function dispatchDecision(): DispatchDecision {
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
    idempotency_key: 'ik-roundtrip',
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

describe('Costura B · §149 round-trip · happy path (CC#4 wires the worker correctly)', () => {
  it('canon · sala dispatch carries _journey_id = stream_id (CC#4 reads it as workflow_id)', async () => {
    let webhookBody: Record<string, unknown> = {}
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      webhookBody = JSON.parse((init?.body as string) ?? '{}')
      return new Response('ok', { status: 200 })
    })
    await dispatchToWorkflow({
      decision: dispatchDecision(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    // Costura B canon · CC#4's worker reads webhookBody._journey_id
    // and passes it as workflow_id to /api/agents/run-sdk.
    expect(webhookBody._journey_id).toBe(SALA_STREAM)
  })

  it('canon · simulated round-trip · /api/agents/run-sdk writes workflow_id = sala stream_id', () => {
    // After CC#4's edit, the row would look like this · workflow_id
    // carries the sala stream_id (not the n8n workflow_id LyVoK).
    const row: AgentInvocationRow = {
      id: 'inv-roundtrip-1',
      workflow_id: SALA_STREAM, // ← CC#4 edit propagates this
      workflow_execution_id: 'n8n-exec-12345',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'onboarding-specialist',
      agent_name: 'onboarding-specialist',
      status: 'completed',
      cost_usd: 0.07,
      duration_ms: 8_500,
      tokens_input: 120,
      tokens_output: 280,
      created_at: '2026-06-05T15:00:00Z',
    }
    const eventInput = projectAgentInvocation(row, { journey_type: 'ONBOARD' })
    expect(eventInput).not.toBeNull()
    expect(eventInput!.stream_id).toBe(SALA_STREAM)
    expect(eventInput!.agent_invocation_ref).toBe('inv-roundtrip-1')
  })

  it('canon · projection appends step_completed under the sala stream · readable', async () => {
    const storage = new InMemoryEventLogStorage()
    const row: AgentInvocationRow = {
      id: 'inv-roundtrip-2',
      workflow_id: SALA_STREAM,
      workflow_execution_id: 'n8n-exec-67890',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'brand-strategist',
      agent_name: 'brand-strategist',
      status: 'completed',
      cost_usd: 0.05,
      duration_ms: 6_000,
      created_at: '2026-06-05T15:01:00Z',
    }
    const eventInput = projectAgentInvocation(row, { journey_type: 'ONBOARD' })
    await append(storage, eventInput!)
    const events = await storage.select({
      tenant_id: TENANT,
      stream_id: SALA_STREAM,
    })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('brand-strategist')
    expect(events[0].agent_invocation_ref).toBe('inv-roundtrip-2')
  })
})

describe('Costura B · §149 round-trip · fail-safe (CC#4 forgot the edit)', () => {
  it('canon · projection SKIPS rows where workflow_id is legacy n8n id', () => {
    // Pre-CC#4-edit · the row would carry the n8n workflow_id (LyVoK)
    // not the sala stream. The projection's filter rejects this and
    // the row does NOT corrupt the sala stream.
    const row: AgentInvocationRow = {
      id: 'inv-leaked-1',
      workflow_id: 'LyVoKcrypS5uLyuu', // ← legacy · not sala
      workflow_execution_id: 'n8n-exec-leaked',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'onboarding-specialist',
      created_at: '2026-06-05T15:00:00Z',
    }
    const eventInput = projectAgentInvocation(row)
    expect(eventInput).toBeNull()
  })

  it('canon · projection SKIPS rows where workflow_id is RwUo (Journey B Pipeline)', () => {
    const row: AgentInvocationRow = {
      id: 'inv-leaked-2',
      workflow_id: 'RwUo7G2PmZNqyMbe', // ← legacy · not sala
      workflow_execution_id: 'n8n-exec',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'brand-strategist',
      created_at: '2026-06-05T15:00:00Z',
    }
    const eventInput = projectAgentInvocation(row)
    expect(eventInput).toBeNull()
  })
})

describe('Costura B · contract-test bidirectional · stream_id format invariants', () => {
  it('canon · sala stream_ids are UUIDs · projection accepts UUID workflow_id', () => {
    // The sala generates stream_ids as UUIDs · the projection's
    // isWorkflowIdASalaStream heuristic accepts UUIDs.
    const row: AgentInvocationRow = {
      id: 'inv-x',
      workflow_id: '12345678-1234-1234-1234-123456789012',
      workflow_execution_id: 'exec',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'x',
      created_at: '2026-06-05T15:00:00Z',
    }
    expect(projectAgentInvocation(row)).not.toBeNull()
  })

  it('canon · sala-prefixed stream_ids also accepted (escape-hatch convention)', () => {
    const row: AgentInvocationRow = {
      id: 'inv-y',
      workflow_id: 'sala/onboard/naufrago/c-perez/2026-W23',
      workflow_execution_id: 'exec',
      client_id: CLIENT,
      tenant_id: TENANT,
      agent_id: 'y',
      created_at: '2026-06-05T15:00:00Z',
    }
    expect(projectAgentInvocation(row)).not.toBeNull()
  })
})
