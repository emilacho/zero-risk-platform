/**
 * Tests · sala-hitl-bridge n8n workflow E2E synthetic.
 *
 * Sprint 12 Fase 0 prep finale · CC#3 owner. Proves the round-trip
 * contract end-to-end · synthetic only · no real journeys · no n8n live
 * call · no Vercel call:
 *
 *   1. The workflow JSON shape is well-formed (n8n PUT contract)
 *   2. Simulates the workflow's HTTP body construction (the `jsonBody`
 *      template expansion that n8n applies at runtime)
 *   3. Feeds the constructed body into the actual route handler · same
 *      module-level mocks as the route integration tests
 *   4. Asserts the round-trip: panel payload → n8n template → endpoint
 *      → resolveGate → gate_resolved appended + next dispatch decision
 *
 * §148 honest · this test exercises EVERYTHING except the literal n8n
 * runtime · the workflow JSON itself is asserted structurally + the
 * template logic is reproduced verbatim. When the workflow runs in n8n
 * production, the same body shape arrives at the same endpoint. Any
 * drift in the workflow JSON breaks this test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  InMemoryEventLogStorage,
  type EventLogStorage,
} from '@/lib/sala-event-log'

// ─── Module mocks · canon canon-canon-isolate route from prod deps ───

vi.mock('@/lib/internal-auth', () => ({
  checkInternalOrAdmin: vi.fn(async (r: Request) => {
    if (r.headers.get('x-api-key') === 'test-internal-key') {
      return { ok: true, via: 'internal' as const }
    }
    return { ok: false, reason: 'no test auth' }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}))

let sharedStorage: InMemoryEventLogStorage

vi.mock('@/lib/sala-event-log', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sala-event-log')>(
    '@/lib/sala-event-log',
  )
  return {
    ...actual,
    SupabaseEventLogStorage: class FakeSupabaseStorage implements EventLogStorage {
      insert(input: Parameters<EventLogStorage['insert']>[0]) {
        return sharedStorage.insert(input)
      }
      select(filters: Parameters<EventLogStorage['select']>[0]) {
        return sharedStorage.select(filters)
      }
      findByIdempotencyKey(tenant_id: string, idempotency_key: string) {
        return sharedStorage.findByIdempotencyKey(tenant_id, idempotency_key)
      }
    },
  }
})

// ─── Test fixtures ───

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'

const WORKFLOW_JSON_PATH = path.join(
  process.cwd(),
  'scripts',
  'sala',
  'n8n-workflows',
  'sala-hitl-resolve-bridge.workflow.json',
)

interface N8nWorkflow {
  name: string
  active: boolean
  nodes: Array<{
    id: string
    name: string
    type: string
    typeVersion: number
    parameters: Record<string, unknown>
  }>
  connections: Record<string, unknown>
  settings: Record<string, unknown>
}

function loadWorkflow(): N8nWorkflow {
  const raw = fs.readFileSync(WORKFLOW_JSON_PATH, 'utf8')
  return JSON.parse(raw) as N8nWorkflow
}

/**
 * Canon canonical · simulate n8n's template expansion of the workflow's
 * jsonBody. The template is `={...}` with `{{ $json.body.X }}` lookups +
 * `{{ $workflow.id }}` + `{{ $execution.id }}`. We expand them with
 * concrete values to verify the contract.
 */
function expandWorkflowHttpBody(args: {
  panelPayload: Record<string, unknown>
  workflowId: string
  executionId: string
}): Record<string, unknown> {
  const wf = loadWorkflow()
  const httpNode = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
  const jsonBodyTpl = httpNode.parameters.jsonBody as string

  const body = args.panelPayload as Record<string, unknown>

  // Replicate n8n's expression evaluation for this specific template.
  // We parse the `={...}` shape and eval the embedded JS-like expressions.
  const stripped = jsonBodyTpl.startsWith('=') ? jsonBodyTpl.slice(1) : jsonBodyTpl

  // Replace each {{ ... }} expression with its resolved value.
  const resolved = stripped.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr) => {
    const exprTrim = (expr as string).trim()
    if (exprTrim === '$workflow.id') return args.workflowId
    if (exprTrim === '$execution.id') return args.executionId
    // Resolve $json.body.X (with optional fallback via `||`)
    const orMatch = exprTrim.match(/^(.+?)\s*\|\|\s*(.+)$/)
    if (orMatch) {
      const left = resolveExpr(orMatch[1].trim(), body)
      if (left !== undefined && left !== null && left !== '') {
        return String(left)
      }
      const right = orMatch[2].trim()
      if (right.startsWith("'") && right.endsWith("'")) return right.slice(1, -1)
      if (right.startsWith('"') && right.endsWith('"')) return right.slice(1, -1)
      const r = resolveExpr(right, body)
      return r !== undefined ? String(r) : ''
    }
    const v = resolveExpr(exprTrim, body)
    return v !== undefined && v !== null ? String(v) : ''
  })

  return JSON.parse(resolved)
}

function resolveExpr(expr: string, body: Record<string, unknown>): unknown {
  if (expr === '$json.body') return body
  const m = expr.match(/^\$json\.body\.(\w+)$/)
  if (m) return body[m[1]]
  return undefined
}

async function seedGatePending(stream_id: string) {
  const { append, buildIdempotencyKey } = await import('@/lib/sala-event-log')
  const { randomUUID } = await import('node:crypto')
  const correlation_id = randomUUID()
  const logical_period = '2026-W23'

  await append(sharedStorage, {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id,
    correlation_id,
    event_type: 'step_completed',
    journey_type: 'PRODUCE',
    operation_type: 'PRODUCE.phase_1_strategy',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'PRODUCE.phase_1_strategy.complete',
      client_id: CLIENT,
      logical_period: `${logical_period}::${randomUUID()}`,
    }),
    logical_period,
    step_id: 'phase_1_strategy',
    step_state: 'done',
    payload: {},
    gate_type: null,
  })

  const gateResult = await append(sharedStorage, {
    tenant_id: TENANT,
    client_id: CLIENT,
    stream_id,
    correlation_id,
    event_type: 'gate_pending',
    journey_type: 'PRODUCE',
    operation_type: 'PRODUCE.validate_phase_1.gate',
    idempotency_key: buildIdempotencyKey({
      operation_type: 'PRODUCE.validate_phase_1.gate',
      client_id: CLIENT,
      logical_period: `${logical_period}::${randomUUID()}`,
    }),
    logical_period,
    step_id: 'validate_phase_1',
    payload: {},
    gate_type: 'camino_iii',
  })
  return gateResult.event
}

// ─── Tests · structural · workflow JSON contract ───

describe('sala-hitl-bridge n8n workflow · structural contract', () => {
  let wf: N8nWorkflow
  beforeEach(() => {
    wf = loadWorkflow()
  })

  it('canon · workflow is active=false by default (shadow guardrail)', () => {
    expect(wf.active).toBe(false)
  })

  it('canon · has exactly 2 nodes (webhook + httpRequest)', () => {
    expect(wf.nodes).toHaveLength(2)
    const types = wf.nodes.map((n) => n.type).sort()
    expect(types).toEqual([
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.webhook',
    ])
  })

  it('canon · webhook is POST /sala-hitl-resolve-bridge', () => {
    const webhook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')!
    expect(webhook.parameters.path).toBe('sala-hitl-resolve-bridge')
    expect(webhook.parameters.httpMethod).toBe('POST')
  })

  it('canon · httpRequest targets /api/sala/hitl/resolve', () => {
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
    expect(http.parameters.url).toContain('/api/sala/hitl/resolve')
    expect(http.parameters.method).toBe('POST')
  })

  it('canon · httpRequest carries x-api-key header from $env.INTERNAL_API_KEY', () => {
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
    const headers = http.parameters.headerParameters as {
      parameters: Array<{ name: string; value: string }>
    }
    const apiKey = headers.parameters.find((p) => p.name === 'x-api-key')
    expect(apiKey).toBeDefined()
    expect(apiKey!.value).toContain('INTERNAL_API_KEY')
  })

  it('canon · httpRequest body includes source="n8n-mc-inbox" hardcoded', () => {
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
    const tpl = http.parameters.jsonBody as string
    expect(tpl).toContain('"source": "n8n-mc-inbox"')
  })

  it('canon · httpRequest carries workflow_id + workflow_execution_id (canon §149)', () => {
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
    const tpl = http.parameters.jsonBody as string
    expect(tpl).toContain('$workflow.id')
    expect(tpl).toContain('$execution.id')
  })

  it('canon · httpRequest has retryOnFail (canon §150 G2)', () => {
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest') as {
      retryOnFail?: boolean
      maxTries?: number
    } & N8nWorkflow['nodes'][number]
    expect(http.retryOnFail).toBe(true)
    expect(http.maxTries).toBeGreaterThanOrEqual(1)
  })

  it('canon · webhook connects to httpRequest', () => {
    const webhookName = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')!
      .name
    const httpName = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest')!
      .name
    const conn = (wf.connections as Record<string, { main: Array<Array<{ node: string }>> }>)[
      webhookName
    ]
    expect(conn).toBeDefined()
    expect(conn.main[0][0].node).toBe(httpName)
  })
})

// ─── Tests · template expansion · workflow body matches endpoint shape ───

describe('sala-hitl-bridge n8n workflow · template expansion', () => {
  it('canon · approved panel payload → body includes source + decision', () => {
    const body = expandWorkflowHttpBody({
      panelPayload: {
        tenant_id: TENANT,
        stream_id: 'stream-abc',
        gate_event_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        decision: 'approved',
        reviewer: 'emilio@hotmail.com',
      },
      workflowId: 'wf-test',
      executionId: 'exec-test',
    })
    expect(body.source).toBe('n8n-mc-inbox')
    expect(body.tenant_id).toBe(TENANT)
    expect(body.stream_id).toBe('stream-abc')
    expect(body.decision).toBe('approved')
    expect(body.reviewer).toBe('emilio@hotmail.com')
    expect(body.workflow_id).toBe('wf-test')
    expect(body.workflow_execution_id).toBe('exec-test')
  })

  it('canon · rejected panel payload → body decision=rejected', () => {
    const body = expandWorkflowHttpBody({
      panelPayload: {
        tenant_id: TENANT,
        stream_id: 'stream-xyz',
        gate_event_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        decision: 'rejected',
        reviewer: 'panel-lead',
        feedback: 'tone is off',
      },
      workflowId: 'wf-x',
      executionId: 'exec-x',
    })
    expect(body.decision).toBe('rejected')
    expect(body.feedback).toBe('tone is off')
  })

  it('canon · missing reviewer → fallback "mc-inbox:unknown"', () => {
    const body = expandWorkflowHttpBody({
      panelPayload: {
        tenant_id: TENANT,
        stream_id: 'stream-y',
        gate_event_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        decision: 'approved',
      },
      workflowId: 'wf-y',
      executionId: 'exec-y',
    })
    expect(body.reviewer).toBe('mc-inbox:unknown')
  })
})

// ─── Tests · E2E round-trip · panel → workflow → endpoint → resolveGate ───

describe('sala-hitl-bridge n8n workflow · E2E synthetic round-trip', () => {
  const originalEnv = process.env.SALA_HITL_RESOLVE_ENABLED
  beforeEach(() => {
    sharedStorage = new InMemoryEventLogStorage()
    process.env.SALA_HITL_RESOLVE_ENABLED = 'true'
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_HITL_RESOLVE_ENABLED
    else process.env.SALA_HITL_RESOLVE_ENABLED = originalEnv
  })

  it('canon · approved panel payload → workflow body → endpoint resolves → next dispatch', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)

    // Step 1 · the panel POSTs to the webhook (synthetic body)
    const panelPayload = {
      tenant_id: TENANT,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      decision: 'approved',
      reviewer: 'emilio@hotmail.com',
      feedback: 'Brand book looks good · ship it',
    }

    // Step 2 · the workflow expands the jsonBody template
    const httpBody = expandWorkflowHttpBody({
      panelPayload,
      workflowId: 'hitl-bridge-wf-id',
      executionId: 'hitl-bridge-exec-1',
    })

    // Step 3 · the workflow POSTs to /api/sala/hitl/resolve
    const { POST } = await import('../src/app/api/sala/hitl/resolve/route')
    const res = await POST(
      new Request('https://example.com/api/sala/hitl/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-internal-key',
        },
        body: JSON.stringify(httpBody),
      }),
    )

    // Step 4 · verify the round-trip outcome
    expect(res.status).toBe(200)
    const responseBody = await res.json()
    expect(responseBody.ok).toBe(true)
    expect(responseBody.outcome).toBe('approved')
    expect(responseBody.via).toBe('internal')
    // Approving validate_phase_1 advances to phase_2_research (action)
    const dispatch = responseBody.decisions.find(
      (d: { kind: string }) => d.kind === 'dispatch',
    )
    expect(dispatch).toBeDefined()
    expect(dispatch.step_id).toBe('phase_2_research')

    // Step 5 · verify the audit chain in the event-log
    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
    const resolved = events.find((e) => e.event_type === 'gate_resolved')!
    expect(resolved).toBeDefined()
    expect(resolved.causation_id).toBe(gatePending.event_id)
    expect(resolved.payload.outcome).toBe('approved')
    expect(resolved.payload.source).toBe('n8n-mc-inbox')
    expect(resolved.payload.feedback).toBe('Brand book looks good · ship it')
  })

  it('canon · rejected panel payload → workflow body → endpoint resolves rejected', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)

    const panelPayload = {
      tenant_id: TENANT,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      decision: 'rejected',
      reviewer: 'panel-lead',
      feedback: 'Revise voice',
    }
    const httpBody = expandWorkflowHttpBody({
      panelPayload,
      workflowId: 'hitl-bridge-wf-id',
      executionId: 'hitl-bridge-exec-2',
    })

    const { POST } = await import('../src/app/api/sala/hitl/resolve/route')
    const res = await POST(
      new Request('https://example.com/api/sala/hitl/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-internal-key',
        },
        body: JSON.stringify(httpBody),
      }),
    )
    expect(res.status).toBe(200)
    const responseBody = await res.json()
    expect(responseBody.outcome).toBe('rejected')

    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
    const resolved = events.find((e) => e.event_type === 'gate_resolved')!
    expect(resolved.payload.outcome).toBe('rejected')
    expect(resolved.payload.feedback).toBe('Revise voice')
  })

  it('canon · edited panel payload → workflow body → endpoint maps to approved + carries edit', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const gatePending = await seedGatePending(stream)

    const panelPayload = {
      tenant_id: TENANT,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      decision: 'edited',
      reviewer: 'emilio@hotmail.com',
      edited_content: 'Revised brand voice paragraph · final',
    }
    const httpBody = expandWorkflowHttpBody({
      panelPayload,
      workflowId: 'hitl-bridge-wf-id',
      executionId: 'hitl-bridge-exec-3',
    })

    const { POST } = await import('../src/app/api/sala/hitl/resolve/route')
    const res = await POST(
      new Request('https://example.com/api/sala/hitl/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-internal-key',
        },
        body: JSON.stringify(httpBody),
      }),
    )
    expect(res.status).toBe(200)
    const responseBody = await res.json()
    // Bridge maps edited → approved (canon · edit lives in payload audit)
    expect(responseBody.outcome).toBe('approved')

    const events = await sharedStorage.select({ tenant_id: TENANT, stream_id: stream })
    const resolved = events.find((e) => e.event_type === 'gate_resolved')!
    expect(resolved.payload.decision).toBe('edited')
    expect(resolved.payload.edited_content).toBe('Revised brand voice paragraph · final')
  })
})
