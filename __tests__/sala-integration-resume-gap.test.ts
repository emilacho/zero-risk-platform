/**
 * Tests · Track T (Step 11 resume gap · 2026-06-04) ·
 * `RealSalaIntegration.resolveGate()` + interpreter adapter outcome handling.
 *
 * Sprint 12 Fase 0 prep finale · CC#3 owner.
 *
 * Verifies the gate→resume mechanic end-to-end through the real wire:
 *   kickstart → runUntilHalt → halts at gate_pending → resolveGate(approved
 *   | rejected) → router advances via interpreter (next_step vs
 *   next_step_rejected) → reaches terminal.
 *
 * §148 honest · uses a synthetic 3-step libreto (action → gate → terminal)
 * to isolate the resume mechanic from the canonical ONBOARD libreto's fork/
 * join. Coverage of fork/join+gate is left to a future E2E test once the
 * resume mechanic is proven here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'
import { RealSalaIntegration } from '../src/lib/sala-integration'
import type { Libreto, JourneyType } from '@/lib/sala/libretos'

const T = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'

function syntheticLibreto(opts: {
  rejected_handler?: string
  with_terminal_failure?: boolean
}): Libreto {
  const steps: Array<Libreto['steps'][number]> = [
    {
      step_id: 'pre_gate_action',
      step_type: 'action',
      agent_id: 'stub-agent',
      description: 'Synthetic pre-gate action',
      retry_budget: {
        max_attempts: 1,
        initial_backoff_ms: 100,
        max_backoff_ms: 1000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'review_gate' },
    },
    {
      step_id: 'review_gate',
      step_type: 'gate_camino_iii',
      description: 'Synthetic review gate · approve goes happy path',
      gate_config: {
        timeout_ms: 60_000,
        escalate_to: 'hitl',
        description: 'Camino III synthetic',
      },
      next_step: { kind: 'static', step_id: 'launch' },
      next_step_rejected: opts.rejected_handler ?? undefined,
    },
    {
      step_id: 'launch',
      step_type: 'terminal_success',
      description: 'Synthetic launch terminal',
    },
  ]
  if (opts.rejected_handler && opts.with_terminal_failure) {
    steps.push({
      step_id: opts.rejected_handler,
      step_type: 'terminal_failure',
      description: 'Synthetic rejected terminal',
    })
  } else if (opts.rejected_handler) {
    steps.push({
      step_id: opts.rejected_handler,
      step_type: 'action',
      agent_id: 'stub-revise-agent',
      description: 'Synthetic revise action',
      retry_budget: {
        max_attempts: 1,
        initial_backoff_ms: 100,
        max_backoff_ms: 1000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'launch' },
    })
  }
  return {
    journey_type: 'PRODUCE' as JourneyType,
    version: 1,
    description: 'synthetic Track T resume gap test libreto',
    entry_step_id: 'pre_gate_action',
    steps,
    metadata: { status: 'draft', notes: 'Track T synthetic · 2026-06-04' },
  }
}

function harnessFor(libreto: Libreto) {
  const storage = new InMemoryEventLogStorage()
  const integration = new RealSalaIntegration({
    storage,
    libreto_lookup: () => libreto,
  })
  return { storage, integration }
}

const kick = (stream: string) => ({
  tenant_id: T,
  client_id: C,
  stream_id: stream,
  journey_type: 'PRODUCE' as JourneyType,
  logical_period: '2026-W23',
})

describe('Track T · resolveGate · happy path · approved → terminal_success', () => {
  let storage: InMemoryEventLogStorage
  let integration: RealSalaIntegration
  beforeEach(() => {
    const h = harnessFor(syntheticLibreto({ rejected_handler: 'revise' }))
    storage = h.storage
    integration = h.integration
  })

  it('canon · runUntilHalt halts at gate_pending · journey parked', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const result = await integration.runUntilHalt(kick(stream))
    expect(result.halted_by).toBe('gate_pending')
    const gateDecision = result.last_decisions.find((d) => d.kind === 'gate_pending')
    expect(gateDecision).toBeDefined()
  })

  it('canon · resolveGate(approved) progresses past gate · reaches terminal_success', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    const halt1 = await integration.runUntilHalt(kick(stream))
    expect(halt1.halted_by).toBe('gate_pending')

    const gateRows = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = gateRows.find((r) => r.event_type === 'gate_pending')
    expect(gatePending).toBeDefined()

    const resume = await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending!.event_id,
      outcome: 'approved',
      resolved_by: 'emilio@hotmail.com',
    })
    // canon · canon canon-canon-after resume, router emitted terminal
    const terminal = resume.decisions.find((d) => d.kind === 'terminal')
    expect(terminal).toBeDefined()
    if (terminal && terminal.kind === 'terminal') {
      expect(terminal.outcome).toBe('success')
      expect(terminal.step_id).toBe('launch')
    }
  })

  it('canon · resolveGate appends gate_resolved with causation_id=gate_event_id', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'approved',
    })

    const after = await storage.select({ tenant_id: T, stream_id: stream })
    const gateResolved = after.find((r) => r.event_type === 'gate_resolved')
    expect(gateResolved).toBeDefined()
    expect(gateResolved!.causation_id).toBe(gatePending.event_id)
    expect(gateResolved!.gate_type).toBe('camino_iii')
    expect(gateResolved!.payload.outcome).toBe('approved')
    expect(gateResolved!.payload.resolved_by).toBe('system')
  })

  it('canon · resolveGate carries resolved_by + custom payload through to event', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'approved',
      resolved_by: 'camino-iii-panel',
      payload: { vote_count: 3, panel_members: ['a', 'b', 'c'] },
    })

    const after = await storage.select({ tenant_id: T, stream_id: stream })
    const resolved = after.find((r) => r.event_type === 'gate_resolved')!
    expect(resolved.payload.resolved_by).toBe('camino-iii-panel')
    expect(resolved.payload.vote_count).toBe(3)
    expect(resolved.payload.panel_members).toEqual(['a', 'b', 'c'])
  })
})

describe('Track T · resolveGate · rejected path · next_step_rejected branch', () => {
  it('canon · resolveGate(rejected) → follows next_step_rejected · NOT approved branch', async () => {
    const { storage, integration } = harnessFor(
      syntheticLibreto({ rejected_handler: 'revise' }),
    )
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    const resume = await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'rejected',
      resolved_by: 'camino-iii-panel',
    })

    // canon · the rejected branch is "revise" (action) · router emits dispatch
    const dispatch = resume.decisions.find((d) => d.kind === 'dispatch')
    expect(dispatch).toBeDefined()
    if (dispatch && dispatch.kind === 'dispatch') {
      expect(dispatch.step_id).toBe('revise')
      expect(dispatch.agent_id).toBe('stub-revise-agent')
    }
    // canon · NO terminal emitted (the launch happy path is NOT taken)
    const terminal = resume.decisions.find((d) => d.kind === 'terminal')
    expect(terminal).toBeUndefined()
  })

  it('canon · resolveGate(rejected) · NO next_step_rejected → terminal_failure', async () => {
    const { storage, integration } = harnessFor(
      syntheticLibreto({}),
    )
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    const resume = await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'rejected',
    })
    const terminal = resume.decisions.find((d) => d.kind === 'terminal')
    expect(terminal).toBeDefined()
    if (terminal && terminal.kind === 'terminal') {
      expect(terminal.outcome).toBe('failure')
    }
  })

  it('canon · resolveGate(rejected) · rejected handler IS a terminal_failure step → terminal_failure', async () => {
    const { storage, integration } = harnessFor(
      syntheticLibreto({
        rejected_handler: 'rejected_terminal',
        with_terminal_failure: true,
      }),
    )
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    const resume = await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'rejected',
    })
    const terminal = resume.decisions.find((d) => d.kind === 'terminal')
    expect(terminal).toBeDefined()
    if (terminal && terminal.kind === 'terminal') {
      expect(terminal.outcome).toBe('failure')
      expect(terminal.step_id).toBe('rejected_terminal')
    }
  })
})

describe('Track T · resolveGate · validation + replay safety', () => {
  let storage: InMemoryEventLogStorage
  let integration: RealSalaIntegration
  beforeEach(() => {
    const h = harnessFor(syntheticLibreto({ rejected_handler: 'revise' }))
    storage = h.storage
    integration = h.integration
  })

  it('canon · resolveGate throws if gate_event_id not in stream', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    await expect(
      integration.resolveGate({
        tenant_id: T,
        stream_id: stream,
        gate_event_id: '00000000-0000-0000-0000-000000000000',
        outcome: 'approved',
      }),
    ).rejects.toThrow(/not found in stream/)
  })

  it('canon · resolveGate throws if referenced event is not gate_pending', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const events = await storage.select({ tenant_id: T, stream_id: stream })
    const stepCompleted = events.find((r) => r.event_type === 'step_completed')!
    await expect(
      integration.resolveGate({
        tenant_id: T,
        stream_id: stream,
        gate_event_id: stepCompleted.event_id,
        outcome: 'approved',
      }),
    ).rejects.toThrow(/expected gate_pending/)
  })

  it('canon · resolveGate twice on same gate → second throws (replay rejected)', async () => {
    const stream = `stream-${Math.random().toString(36).slice(2)}`
    await integration.runUntilHalt(kick(stream))
    const before = await storage.select({ tenant_id: T, stream_id: stream })
    const gatePending = before.find((r) => r.event_type === 'gate_pending')!

    await integration.resolveGate({
      tenant_id: T,
      stream_id: stream,
      gate_event_id: gatePending.event_id,
      outcome: 'approved',
    })

    await expect(
      integration.resolveGate({
        tenant_id: T,
        stream_id: stream,
        gate_event_id: gatePending.event_id,
        outcome: 'rejected',
      }),
    ).rejects.toThrow(/already has a gate_resolved event/)
  })
})
