/**
 * Tests · workflow-dispatcher · Model B (conexión 2026-06-05).
 *
 * Covers default-OFF gate · decision target validation · journey-target
 * lookup · webhook URL composition · §149 correlation in body shape
 * (STOP-2 (b)) · idempotency token (STOP-2 (a)) · happy-path + failure
 * modes (network throw · non-2xx response) · logger calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildDispatchIdempotencyToken,
  dispatchToWorkflow,
  isWorkflowDispatchEnabled,
} from '@/lib/sala-journey-dispatch'
import type {
  WorkflowDispatchLogger,
} from '@/lib/sala-journey-dispatch'
import type { DispatchDecision } from '@/lib/sala-router'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'
const STREAM = '33333333-3333-3333-3333-333333333333'
const CORR = '44444444-4444-4444-4444-444444444444'
const EVT = '55555555-5555-5555-5555-555555555555'

function workflowDispatch(overrides: Partial<DispatchDecision> = {}): DispatchDecision {
  return {
    kind: 'dispatch',
    stream_id: STREAM,
    correlation_id: CORR,
    tenant_id: TENANT,
    client_id: CLIENT,
    journey_type: 'ONBOARD',
    step_id: 'entry',
    agent_id: 'sala-router',
    attempt: 1,
    idempotency_key: 'idem-key-test',
    idempotency_inputs: {
      operation_type: 'ONBOARD.entry',
      client_id: CLIENT,
      logical_period: '2026-W23',
    },
    libreto_version: 1,
    caused_by_event_id: EVT,
    target: 'workflow',
    ...overrides,
  }
}

function silentLogger(): WorkflowDispatchLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('isWorkflowDispatchEnabled', () => {
  const originalEnv = process.env.SALA_WORKFLOW_DISPATCH_ENABLED
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    else process.env.SALA_WORKFLOW_DISPATCH_ENABLED = originalEnv
  })

  it('canon · default-OFF when env not set', () => {
    delete process.env.SALA_WORKFLOW_DISPATCH_ENABLED
    expect(isWorkflowDispatchEnabled()).toBe(false)
  })
  it('canon · enabled when env === "true"', () => {
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    expect(isWorkflowDispatchEnabled()).toBe(true)
  })
  it('canon · ANY non-"true" treated as disabled', () => {
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = '1'
    expect(isWorkflowDispatchEnabled()).toBe(false)
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'TRUE'
    expect(isWorkflowDispatchEnabled()).toBe(false)
  })
  it('canon · explicit input.enabled overrides env', () => {
    process.env.SALA_WORKFLOW_DISPATCH_ENABLED = 'true'
    expect(isWorkflowDispatchEnabled({ enabled: false })).toBe(false)
  })
})

describe('buildDispatchIdempotencyToken · STOP-2 (a) dispatch-único', () => {
  it('canon · same inputs → same token', () => {
    const a = buildDispatchIdempotencyToken({
      stream_id: STREAM,
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 'onboard-worker-dispatch',
    })
    const b = buildDispatchIdempotencyToken({
      stream_id: STREAM,
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 'onboard-worker-dispatch',
    })
    expect(a).toBe(b)
  })
  it('canon · different stream → different token', () => {
    const a = buildDispatchIdempotencyToken({
      stream_id: STREAM,
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 's',
    })
    const b = buildDispatchIdempotencyToken({
      stream_id: 'other-stream',
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 's',
    })
    expect(a).not.toBe(b)
  })
  it('canon · token contains all key components for forensics', () => {
    const t = buildDispatchIdempotencyToken({
      stream_id: STREAM,
      correlation_id: CORR,
      journey_type: 'ONBOARD',
      idempotency_suffix: 'onboard-worker-dispatch',
    })
    expect(t).toContain('ONBOARD')
    expect(t).toContain(STREAM)
    expect(t).toContain(CORR)
    expect(t).toContain('onboard-worker-dispatch')
  })
})

describe('dispatchToWorkflow · default-OFF · NO network', () => {
  it('canon · flag off → returns flag_off · NO fetch', async () => {
    const fetcher = vi.fn()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: false,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('flag_off')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('dispatchToWorkflow · decision validation', () => {
  it('canon · wrong target (agent) returns wrong_target · NO fetch', async () => {
    const fetcher = vi.fn()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch({ target: 'agent' }),
      enabled: true,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('wrong_target')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('canon · target undefined returns wrong_target · NO fetch', async () => {
    const fetcher = vi.fn()
    const decision = workflowDispatch()
    delete (decision as { target?: unknown }).target
    const res = await dispatchToWorkflow({
      decision,
      enabled: true,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('wrong_target')
  })

  it('canon · unmapped journey returns no_journey_target · NO fetch', async () => {
    const fetcher = vi.fn()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch({ journey_type: 'PRODUCE' }),
      enabled: true,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no_journey_target')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('dispatchToWorkflow · happy path · §149 correlation (STOP-2 (b))', () => {
  let capturedUrl: string | null = null
  let capturedBody: Record<string, unknown> = {}
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    capturedUrl = url
    capturedBody = JSON.parse((init?.body as string) ?? '{}')
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  beforeEach(() => {
    capturedUrl = null
    capturedBody = {}
    fetcher.mockClear()
  })

  it('canon · fires webhook to journey target URL', async () => {
    const res = await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.workflow_id).toBe('LyVoKcrypS5uLyuu')
      expect(res.webhook_url).toBe('https://n8n.test/webhook/zero-risk/deal-won-onboarding')
      expect(res.status_code).toBe(200)
    }
    expect(capturedUrl).toBe('https://n8n.test/webhook/zero-risk/deal-won-onboarding')
  })

  it('canon · body carries _journey_id = stream_id (§149 correlation · STOP-2 (b))', async () => {
    await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(capturedBody._journey_id).toBe(STREAM)
    expect(capturedBody.client_id).toBe(CLIENT)
    expect(capturedBody.tenant_id).toBe(TENANT)
    expect(capturedBody.trigger_source).toBe('sala-router-dispatch')
  })

  it('canon · body carries _sala_correlation_id + _sala_idempotency_token (STOP-2 (a))', async () => {
    await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(capturedBody._sala_correlation_id).toBe(CORR)
    expect(capturedBody._sala_idempotency_token).toMatch(/ONBOARD/)
    expect(capturedBody._sala_idempotency_token).toContain(STREAM)
  })

  it('canon · body carries _sala_caused_by_event_id + libreto_version', async () => {
    await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(capturedBody._sala_caused_by_event_id).toBe(EVT)
    expect(capturedBody._sala_libreto_version).toBe(1)
  })

  it('canon · target_step_id propagated for worker to route internally if needed', async () => {
    await dispatchToWorkflow({
      decision: workflowDispatch({ step_id: 'my-step' }),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(capturedBody.target_step_id).toBe('my-step')
  })
})

describe('dispatchToWorkflow · failure modes', () => {
  it('canon · fetcher throws → fetch_threw · returns detail', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const logger = silentLogger()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('fetch_threw')
      expect(res.detail).toContain('econnreset')
    }
    expect(logger.error).toHaveBeenCalled()
  })

  it('canon · non-2xx response → webhook_failed · carries status', async () => {
    const fetcher = vi.fn(
      async () => new Response('server down', { status: 502 }),
    )
    const logger = silentLogger()
    const res = await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('webhook_failed')
      expect(res.status_code).toBe(502)
    }
    expect(logger.warn).toHaveBeenCalled()
  })

  it('canon · no n8n_base_url + no env → fetch_threw', async () => {
    const orig = process.env.N8N_BASE_URL
    delete process.env.N8N_BASE_URL
    try {
      const fetcher = vi.fn()
      const res = await dispatchToWorkflow({
        decision: workflowDispatch(),
        enabled: true,
        fetcher: fetcher as unknown as typeof fetch,
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.reason).toBe('fetch_threw')
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      if (orig !== undefined) process.env.N8N_BASE_URL = orig
    }
  })
})

describe('dispatchToWorkflow · custom target override (tests + smoke)', () => {
  it('canon · explicit target override skips JOURNEY_WORKFLOW_MAP lookup', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))
    const res = await dispatchToWorkflow({
      decision: workflowDispatch({ journey_type: 'PRODUCE' }), // unmapped
      enabled: true,
      target: {
        workflow_id: 'TestWorkflowId123',
        webhook_path: 'test/webhook',
        worker_name: 'Test Worker',
        phase_boundaries: ['a', 'b'],
        idempotency_suffix: 'test',
      },
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.workflow_id).toBe('TestWorkflowId123')
  })
})

describe('dispatchToWorkflow · Phase 1.1 gap #1 · business_payload spread', () => {
  it('canon · spreads business_payload into webhook body BEFORE sala metadata', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    })
    const res = await dispatchToWorkflow({
      decision: workflowDispatch({
        business_payload: {
          client_name: 'Náufrago',
          website: 'naufrago.com',
          industry: 'F&B',
          contract_scope: 'onboarding',
        },
      }),
      enabled: true,
      n8n_base_url: 'https://example.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger: silentLogger(),
    })
    expect(res.ok).toBe(true)
    expect(capturedBody).toBeDefined()
    expect(capturedBody!.client_name).toBe('Náufrago')
    expect(capturedBody!.website).toBe('naufrago.com')
    expect(capturedBody!.industry).toBe('F&B')
    expect(capturedBody!.contract_scope).toBe('onboarding')
  })

  it('canon · sala metadata ALWAYS overrides business_payload on collision', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    })
    await dispatchToWorkflow({
      decision: workflowDispatch({
        business_payload: {
          // malicious / buggy source tries to override sala fields
          _sala_correlation_id: 'attacker-supplied',
          _journey_id: 'attacker-supplied-stream',
          client_id: 'attacker-supplied-client',
          tenant_id: 'attacker-supplied-tenant',
          trigger_source: 'attacker-supplied',
          benign_field: 'kept',
        },
      }),
      enabled: true,
      n8n_base_url: 'https://example.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger: silentLogger(),
    })
    expect(capturedBody).toBeDefined()
    // sala fields preserved
    expect(capturedBody!._sala_correlation_id).toBe(CORR)
    expect(capturedBody!._journey_id).toBe(STREAM)
    expect(capturedBody!.client_id).toBe(CLIENT)
    expect(capturedBody!.tenant_id).toBe(TENANT)
    expect(capturedBody!.trigger_source).toBe('sala-router-dispatch')
    // benign source field passes through
    expect(capturedBody!.benign_field).toBe('kept')
  })

  it('canon · null / undefined / array business_payload is ignored safely', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    })
    // Array (rejected · spread is dropped)
    await dispatchToWorkflow({
      decision: workflowDispatch({
        business_payload: ['not', 'an', 'object'] as unknown as Record<string, unknown>,
      }),
      enabled: true,
      n8n_base_url: 'https://example.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger: silentLogger(),
    })
    expect(capturedBody!._journey_id).toBe(STREAM)
    expect(capturedBody!.client_id).toBe(CLIENT)
    // Missing business_payload (typical · current call-sites)
    await dispatchToWorkflow({
      decision: workflowDispatch(),
      enabled: true,
      n8n_base_url: 'https://example.test',
      fetcher: fetcher as unknown as typeof fetch,
      logger: silentLogger(),
    })
    expect(capturedBody!._journey_id).toBe(STREAM)
  })
})
