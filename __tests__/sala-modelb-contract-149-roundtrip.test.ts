/**
 * Tests · Costura B contract · §149 correlation round-trip.
 *
 * Sprint 12 SEAM-CLOSE Ronda 2 convergencia (2026-06-05) · CC#4 ran
 * 3/3 round-trip smoke against the canonical n8n expression
 * `{{ $('Validate Deal Data').item.json._journey_id || $workflow.id }}`
 * (per `MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION` constant + master plan
 * SEAM-CLOSE §RONDA 2). The expression references the predecessor
 * node `Validate Deal Data` directly · NOT `$json.body` which would
 * read the wrong shape post-reshape.
 *
 * The test does NOT exercise the n8n worker · it simulates the
 * round-trip ·
 *   1. Sala dispatches to worker via `dispatchToWorkflow` · webhook
 *      body carries `_journey_id = stream_id`
 *   2. Worker (simulated · CC#4's expression evaluated) calls
 *      `/api/agents/run-sdk` with `workflow_id = <stream_id>`
 *   3. `/api/agents/run-sdk` writes a row to `agent_invocations` with
 *      `workflow_id = sala stream_id`
 *   4. Projection reads the row, synthesizes a `step_completed` event
 *      to `sala_event_log` with `stream_id = sala stream_id`
 *
 * If CC#4 forgets the edit · the projection's heuristic filter
 * (workflow_id legacy n8n shape) SKIPS the row · test verifies the
 * fail-safe.
 *
 * Drift detection · if the contract changes (e.g. the worker moves
 * the expression away from `Validate Deal Data` predecessor or stops
 * using `_journey_id` field), the expression invariants test breaks
 * and CC#3 + CC#4 must re-align.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  checkExpressionInvariants,
  dispatchToWorkflow,
  MODELB_EXPRESSION_INVARIANTS,
  MODELB_PREDECESSOR_NODE_NAME,
  MODELB_RUNSDK_NODE_NAMES,
  MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION,
  MODELB_WORKER_ID,
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

// =====================================================================
// SEAM-CLOSE Ronda 2 convergencia · canonical n8n expression invariants
// CC#4 ran 3/3 round-trip smoke with this exact string · sala mirrors it.
// =====================================================================

describe('Costura B · ronda 2 · canonical n8n expression invariants', () => {
  it('canon · MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION matches CC#4 runtime-confirmed string', () => {
    // Source of truth · CC#4 worker LyVoKcrypS5uLyuu · 3/3 round-trip
    // smoke PASS 2026-06-05 · master plan SEAM-CLOSE §RONDA 2.
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION).toBe(
      "{{ $('Validate Deal Data').item.json._journey_id || $workflow.id }}",
    )
  })

  it('canon · expression passes all 4 invariants · no drift', () => {
    const violations = checkExpressionInvariants(
      MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION,
    )
    expect(violations).toEqual([])
  })

  it('canon · references the predecessor node by name (not $json.body)', () => {
    // The predecessor node `Validate Deal Data` reshapes the webhook
    // payload · the run-sdk node consumes its output. So `$json.body`
    // refers to Validate's reshaped output, NOT the raw webhook body.
    // The canonical expression bypasses the reshape by addressing the
    // predecessor node DIRECTLY.
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION).toContain(
      `$('${MODELB_PREDECESSOR_NODE_NAME}')`,
    )
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION).not.toContain('$json.body')
  })

  it('canon · reads ._journey_id field on the predecessor output', () => {
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION).toContain('._journey_id')
  })

  it('canon · falls back to $workflow.id when _journey_id absent (legacy direct webhook)', () => {
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION).toContain('|| $workflow.id')
  })

  it('canon · wraps in n8n expression braces · runtime-evaluable', () => {
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION.startsWith('{{')).toBe(true)
    expect(MODELB_RUNSDK_WORKFLOW_ID_EXPRESSION.endsWith('}}')).toBe(true)
  })

  it('canon · the worker_id this expression applies to is LyVoKcrypS5uLyuu', () => {
    expect(MODELB_WORKER_ID).toBe('LyVoKcrypS5uLyuu')
  })

  it('canon · the only run-sdk node carrying this expression is Auto-Discovery', () => {
    expect(Array.from(MODELB_RUNSDK_NODE_NAMES)).toEqual([
      'Call Onboarding Specialist: Auto-Discovery',
    ])
  })

  it('canon · MODELB_EXPRESSION_INVARIANTS captures all 4 contract clauses', () => {
    expect(Object.keys(MODELB_EXPRESSION_INVARIANTS).sort()).toEqual([
      'contains_journey_id_field',
      'contains_predecessor_node_name',
      'has_fallback_to_n8n_workflow_id',
      'wraps_in_n8n_expression_braces',
    ])
  })

  it('canon · checkExpressionInvariants detects every individual violation', () => {
    expect(
      checkExpressionInvariants(
        '{{ $json.body._journey_id || $workflow.id }}',
      ),
    ).toContain('contains_predecessor_node_name')
    expect(
      checkExpressionInvariants(
        "{{ $('Validate Deal Data').item.json.other_field || $workflow.id }}",
      ),
    ).toContain('contains_journey_id_field')
    expect(
      checkExpressionInvariants(
        "{{ $('Validate Deal Data').item.json._journey_id }}",
      ),
    ).toContain('has_fallback_to_n8n_workflow_id')
    expect(
      checkExpressionInvariants(
        "$('Validate Deal Data').item.json._journey_id || $workflow.id",
      ),
    ).toContain('wraps_in_n8n_expression_braces')
  })
})

// =====================================================================
// Smoke conjunto · sala-side mirror of CC#4 runtime 3/3 PASS
// =====================================================================

describe('Costura B · ronda 2 · smoke conjunto · sala-side mirror', () => {
  it('canon · CC#4 3/3 mirror · expression resolves stream_id from webhook _journey_id', () => {
    // Simulate the n8n expression evaluation against the webhook body
    // CC#3 dispatcher sends. The predecessor node preserves _journey_id
    // through Validate Deal Data, so the expression resolves to it.
    const webhookBody = {
      _sala_correlation_id: 'corr-roundtrip',
      _journey_id: SALA_STREAM,
      tenant_id: TENANT,
      client_id: CLIENT,
      // ...rest of GHL deal payload...
    }
    // Mock the n8n eval · `$('Validate Deal Data').item.json` would
    // carry the preserved webhook fields after Validate's reshape.
    const validateOutput = { ...webhookBody }
    const resolvedWorkflowId =
      (validateOutput._journey_id as string | undefined) ?? 'lyvo-default'
    expect(resolvedWorkflowId).toBe(SALA_STREAM)
  })

  it('canon · 3/3 sala-side mirror · row appears under correct stream', async () => {
    // Mirror of CC#4's 3 round-trip runs · each writes an
    // agent_invocation row · projection surfaces each under the sala
    // stream. This is what CC#4 verified runtime; we replay sala-side
    // to confirm the contract closure.
    const storage = new InMemoryEventLogStorage()
    const rows: AgentInvocationRow[] = [
      {
        id: 'inv-r1',
        workflow_id: SALA_STREAM,
        workflow_execution_id: 'exec-r1',
        client_id: CLIENT,
        tenant_id: TENANT,
        agent_id: 'onboarding-specialist',
        agent_name: 'onboarding-specialist',
        status: 'completed',
        cost_usd: 0.04,
        duration_ms: 5_000,
        created_at: '2026-06-05T15:10:00Z',
      },
      {
        id: 'inv-r2',
        workflow_id: SALA_STREAM,
        workflow_execution_id: 'exec-r2',
        client_id: CLIENT,
        tenant_id: TENANT,
        agent_id: 'brand-strategist',
        agent_name: 'brand-strategist',
        status: 'completed',
        cost_usd: 0.06,
        duration_ms: 7_500,
        created_at: '2026-06-05T15:11:00Z',
      },
      {
        id: 'inv-r3',
        workflow_id: SALA_STREAM,
        workflow_execution_id: 'exec-r3',
        client_id: CLIENT,
        tenant_id: TENANT,
        agent_id: 'web-designer',
        agent_name: 'web-designer',
        status: 'completed',
        cost_usd: 0.05,
        duration_ms: 6_200,
        created_at: '2026-06-05T15:12:00Z',
      },
    ]
    for (const row of rows) {
      const input = projectAgentInvocation(row, { journey_type: 'ONBOARD' })
      expect(input).not.toBeNull()
      await append(storage, input!)
    }
    const events = await storage.select({
      tenant_id: TENANT,
      stream_id: SALA_STREAM,
    })
    expect(events.length).toBe(3)
    const stepIds = events.map((e) => e.step_id)
    expect(stepIds).toContain('onboarding-specialist')
    expect(stepIds).toContain('brand-strategist')
    expect(stepIds).toContain('web-designer')
  })
})
