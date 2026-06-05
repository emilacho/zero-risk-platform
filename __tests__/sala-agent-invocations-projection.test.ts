/**
 * Tests · agent-invocations-projection · Model B (conexión 2026-06-05).
 *
 * Covers · default-OFF flag · workflow_id heuristic (sala stream vs
 * legacy n8n) · pure projector (idempotency · field mapping · null
 * handling) · subscription wiring shape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isAgentInvocationsProjectionEnabled,
  isWorkflowIdASalaStream,
  projectAgentInvocation,
  runAgentInvocationsProjection,
  type AgentInvocationRow,
} from '@/lib/sala-journey-dispatch'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'
import type { SupabaseClient } from '@supabase/supabase-js'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CLIENT = '22222222-2222-2222-2222-222222222222'
const SALA_STREAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ROW_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const EXEC_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function row(overrides: Partial<AgentInvocationRow> = {}): AgentInvocationRow {
  return {
    id: ROW_ID,
    workflow_id: SALA_STREAM,
    workflow_execution_id: EXEC_ID,
    client_id: CLIENT,
    tenant_id: TENANT,
    agent_id: 'onboarding-specialist',
    agent_name: 'onboarding-specialist',
    status: 'completed',
    cost_usd: 0.05,
    duration_ms: 12_345,
    tokens_input: 100,
    tokens_output: 200,
    created_at: '2026-06-05T12:00:00Z',
    response_text: 'I have processed the onboarding request successfully.',
    metadata: {},
    ...overrides,
  }
}

describe('isAgentInvocationsProjectionEnabled', () => {
  const orig = process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED
  afterEach(() => {
    if (orig === undefined) delete process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED
    else process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED = orig
  })

  it('canon · default-OFF when env not set', () => {
    delete process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED
    expect(isAgentInvocationsProjectionEnabled()).toBe(false)
  })
  it('canon · enabled when env === "true"', () => {
    process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED = 'true'
    expect(isAgentInvocationsProjectionEnabled()).toBe(true)
  })
  it('canon · ANY non-"true" treated as disabled', () => {
    process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED = 'yes'
    expect(isAgentInvocationsProjectionEnabled()).toBe(false)
  })
  it('canon · explicit override beats env', () => {
    process.env.SALA_AGENT_INVOCATIONS_PROJECTION_ENABLED = 'true'
    expect(isAgentInvocationsProjectionEnabled({ enabled: false })).toBe(false)
  })
})

describe('isWorkflowIdASalaStream · filter heuristic', () => {
  it('canon · UUID → sala stream', () => {
    expect(isWorkflowIdASalaStream(SALA_STREAM)).toBe(true)
  })
  it('canon · sala/ prefix → sala stream', () => {
    expect(isWorkflowIdASalaStream('sala/stream-1')).toBe(true)
  })
  it('canon · sala:: prefix → sala stream', () => {
    expect(isWorkflowIdASalaStream('sala::abc')).toBe(true)
  })
  it('canon · legacy n8n id LyVoKcrypS5uLyuu → NOT sala stream', () => {
    expect(isWorkflowIdASalaStream('LyVoKcrypS5uLyuu')).toBe(false)
  })
  it('canon · legacy n8n id RwUo7G2PmZNqyMbe → NOT sala stream', () => {
    expect(isWorkflowIdASalaStream('RwUo7G2PmZNqyMbe')).toBe(false)
  })
  it('canon · null → false', () => {
    expect(isWorkflowIdASalaStream(null)).toBe(false)
  })
  it('canon · empty string → false', () => {
    expect(isWorkflowIdASalaStream('')).toBe(false)
  })
})

describe('projectAgentInvocation · pure projector', () => {
  it('canon · happy path · returns EventAppendInput', () => {
    const out = projectAgentInvocation(row(), { journey_type: 'ONBOARD' })
    expect(out).not.toBeNull()
    expect(out!.tenant_id).toBe(TENANT)
    expect(out!.client_id).toBe(CLIENT)
    expect(out!.stream_id).toBe(SALA_STREAM)
    expect(out!.correlation_id).toBe(EXEC_ID)
    expect(out!.causation_id).toBe(ROW_ID)
    expect(out!.event_type).toBe('step_completed')
    expect(out!.journey_type).toBe('ONBOARD')
    expect(out!.step_id).toBe('onboarding-specialist')
    expect(out!.step_state).toBe('done')
    expect(out!.agent_invocation_ref).toBe(ROW_ID)
    expect(out!.gate_type).toBe(null)
  })

  it('canon · payload carries cost + duration + tokens + agent_invocation_id', () => {
    const out = projectAgentInvocation(row())
    expect(out!.payload).toMatchObject({
      source: 'agent-invocations-projection',
      agent_invocation_id: ROW_ID,
      agent_name: 'onboarding-specialist',
      cost_usd: 0.05,
      duration_ms: 12_345,
      tokens_input: 100,
      tokens_output: 200,
      status: 'completed',
    })
  })

  it('canon · response_excerpt truncated to 240 chars', () => {
    const long = 'a'.repeat(500)
    const out = projectAgentInvocation(row({ response_text: long }))
    const excerpt = out!.payload!.response_excerpt as string
    expect(excerpt.length).toBe(240)
  })

  it('canon · returns null when workflow_id is legacy n8n (not sala stream)', () => {
    expect(projectAgentInvocation(row({ workflow_id: 'LyVoKcrypS5uLyuu' }))).toBeNull()
    expect(projectAgentInvocation(row({ workflow_id: 'RwUo7G2PmZNqyMbe' }))).toBeNull()
  })

  it('canon · returns null when workflow_id is null', () => {
    expect(projectAgentInvocation(row({ workflow_id: null }))).toBeNull()
  })

  it('canon · returns null when client_id is null', () => {
    expect(projectAgentInvocation(row({ client_id: null }))).toBeNull()
  })

  it('canon · returns null when tenant_id is missing or empty', () => {
    expect(projectAgentInvocation(row({ tenant_id: null }))).toBeNull()
    expect(projectAgentInvocation(row({ tenant_id: '' }))).toBeNull()
  })

  it('canon · idempotency_key is derived from agent_invocations.id (replay-safe)', () => {
    const a = projectAgentInvocation(row())
    const b = projectAgentInvocation(row())
    expect(a!.idempotency_key).toBe(b!.idempotency_key)
  })

  it('canon · different row id → different idempotency_key', () => {
    const a = projectAgentInvocation(row({ id: 'row-a' }))
    const b = projectAgentInvocation(row({ id: 'row-b' }))
    expect(a!.idempotency_key).not.toBe(b!.idempotency_key)
  })

  it('canon · journey_type defaults to UNKNOWN when not provided', () => {
    const out = projectAgentInvocation(row())
    expect(out!.journey_type).toBe('UNKNOWN')
  })

  it('canon · step_id falls back to agent_name when agent_id missing', () => {
    const out = projectAgentInvocation(
      row({ agent_id: null, agent_name: 'fallback-name' }),
    )
    expect(out!.step_id).toBe('fallback-name')
  })

  it('canon · step_id falls back to "unknown-step" when both agent_id+name missing', () => {
    const out = projectAgentInvocation(row({ agent_id: null, agent_name: null }))
    expect(out!.step_id).toBe('unknown-step')
  })
})

describe('runAgentInvocationsProjection · subscription wiring shape', () => {
  it('canon · flag off → returns no-op handle · no subscribe', async () => {
    const storage = new InMemoryEventLogStorage()
    const supabase = {
      channel: vi.fn(),
    } as unknown as SupabaseClient
    const handle = await runAgentInvocationsProjection({
      supabase,
      storage,
      enabled: false,
    })
    expect(handle.channel_name).toContain('disabled')
    expect(supabase.channel).not.toHaveBeenCalled()
    await handle.stop()
  })

  it('canon · channel unavailable → returns no-channel handle · NO throw', async () => {
    const storage = new InMemoryEventLogStorage()
    const supabase = {} as unknown as SupabaseClient // no channel fn
    const handle = await runAgentInvocationsProjection({
      supabase,
      storage,
      enabled: true,
    })
    expect(handle.channel_name).toContain('no-channel')
  })

  it('canon · enabled → subscribes to INSERT on agent_invocations', async () => {
    const storage = new InMemoryEventLogStorage()
    const subscribe = vi.fn()
    const onFn = vi.fn((_event: string, _filter: unknown, _handler: unknown) => ({
      subscribe,
    }))
    const channelFn = vi.fn(() => ({ on: onFn }))
    const removeChannel = vi.fn(async () => {})
    const supabase = {
      channel: channelFn,
      removeChannel,
    } as unknown as SupabaseClient

    const handle = await runAgentInvocationsProjection({
      supabase,
      storage,
      enabled: true,
    })
    expect(channelFn).toHaveBeenCalledWith('sala/projection/agent_invocations')
    expect(onFn).toHaveBeenCalled()
    const filterArg = onFn.mock.calls[0][1] as {
      event: string
      schema: string
      table: string
    }
    expect(filterArg.event).toBe('INSERT')
    expect(filterArg.table).toBe('agent_invocations')
    expect(subscribe).toHaveBeenCalled()

    await handle.stop()
    expect(removeChannel).toHaveBeenCalled()
  })

  it('canon · projects an INSERT payload through to storage', async () => {
    const storage = new InMemoryEventLogStorage()
    let handler:
      | ((p: { new: AgentInvocationRow }) => Promise<void>)
      | undefined
    const subscribe = vi.fn()
    const onFn = vi.fn(
      (
        _event: string,
        _filter: unknown,
        h: (p: { new: AgentInvocationRow }) => Promise<void>,
      ) => {
        handler = h
        return { subscribe }
      },
    )
    const channelFn = vi.fn(() => ({ on: onFn }))
    const supabase = {
      channel: channelFn,
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient

    await runAgentInvocationsProjection({
      supabase,
      storage,
      enabled: true,
      journey_type_resolver: () => 'ONBOARD',
    })

    // Simulate INSERT
    await handler!({ new: row() })

    const events = await storage.select({ tenant_id: TENANT, stream_id: SALA_STREAM })
    expect(events.length).toBe(1)
    expect(events[0].event_type).toBe('step_completed')
    expect(events[0].journey_type).toBe('ONBOARD')
    expect(events[0].agent_invocation_ref).toBe(ROW_ID)
  })

  it('canon · skips INSERT where workflow_id is legacy n8n id', async () => {
    const storage = new InMemoryEventLogStorage()
    let handler:
      | ((p: { new: AgentInvocationRow }) => Promise<void>)
      | undefined
    const subscribe = vi.fn()
    const onFn = vi.fn(
      (
        _event: string,
        _filter: unknown,
        h: (p: { new: AgentInvocationRow }) => Promise<void>,
      ) => {
        handler = h
        return { subscribe }
      },
    )
    const channelFn = vi.fn(() => ({ on: onFn }))
    const supabase = {
      channel: channelFn,
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient

    await runAgentInvocationsProjection({
      supabase,
      storage,
      enabled: true,
    })

    await handler!({ new: row({ workflow_id: 'LyVoKcrypS5uLyuu' }) })

    // Search both possible stream_ids · neither should have an event
    const all = await storage.select({ tenant_id: TENANT })
    expect(all.length).toBe(0)
  })
})
