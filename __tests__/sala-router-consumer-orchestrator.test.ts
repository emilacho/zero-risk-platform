/**
 * Tests · sala-router-consumer orchestrator · full tick · in-memory storage.
 *
 * Covers · empty pending · single dispatch_ok · marker writing · marker
 * exclusion prevents re-processing · multiple events in batch · per-event
 * outcome isolation when one fails.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
} from '@/lib/sala-event-log'
import {
  consumeIntakeTick,
} from '@/lib/sala-router-consumer'

const TENANT = 'naufrago'

async function seedIntakeEvent(
  storage: InMemoryEventLogStorage,
  overrides: Partial<EventAppendInput> = {},
) {
  const random = Math.random().toString(36).slice(2, 10)
  const input: EventAppendInput = {
    tenant_id: TENANT,
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    stream_id: `sala/v1/naufrago/d69100b5/onboard/2026-W23/${random}`,
    correlation_id: `corr-${random}`,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: 'ONBOARD',
    operation_type: `ONBOARD.intake.ventas/deal-won.onboard.${random}`,
    idempotency_key: buildIdempotencyKey({
      operation_type: `ONBOARD.intake.ventas/deal-won.onboard.${random}`,
      client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
      logical_period: '2026-W23',
    }),
    logical_period: '2026-W23',
    step_id: 'intake.ventas/deal-won.onboard',
    step_state: 'done',
    payload: {
      source: 'sala-ingress',
      intake_source: 'ventas/deal-won',
      intake_intent: 'onboard',
      intake_tier: 'B',
      intake_auth_method: 'hmac',
      worker_workflow_id: 'LyVoKcrypS5uLyuu',
      envelope_payload: { client_name: 'Naufrago' },
    },
    gate_type: null,
    ...overrides,
  }
  return await append(storage, input)
}

describe('consumeIntakeTick · empty', () => {
  it('returns empty outcomes when no pending intake events', async () => {
    const storage = new InMemoryEventLogStorage()
    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
    })
    expect(r.scanned).toBe(0)
    expect(r.processed).toBe(0)
    expect(r.outcomes).toEqual([])
  })
})

describe('consumeIntakeTick · single intake · dispatched_ok', () => {
  it('fires webhook + writes marker + returns dispatched_ok', async () => {
    const storage = new InMemoryEventLogStorage()
    const seed = await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))

    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(r.processed).toBe(1)
    expect(r.outcomes[0].kind).toBe('dispatched_ok')
    expect(r.outcomes[0].intake_event_id).toBe(seed.event.event_id)
    expect(r.outcomes[0].marker_event_id).not.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('writes a marker step_completed event with router.dispatch.* step_id', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))
    await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const events = await storage.select({ tenant_id: TENANT })
    const markers = events.filter((e) => e.step_id?.startsWith('router.dispatch.'))
    expect(markers.length).toBe(1)
    expect(markers[0].payload!.dispatch_kind).toBe('dispatched_ok')
  })
})

describe('consumeIntakeTick · marker exclusion · no re-processing', () => {
  it('skips intake events that already have a marker for their stream', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))

    // First tick · processes the intake
    const r1 = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r1.processed).toBe(1)

    // Second tick · no new intake events · cero re-process
    const r2 = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r2.processed).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('consumeIntakeTick · multiple events · per-event isolation', () => {
  it('processes multiple pending intakes in one tick', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    await seedIntakeEvent(storage)
    await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))

    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.processed).toBe(3)
    expect(r.outcomes.every((o) => o.kind === 'dispatched_ok')).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('caps result at batch_size', async () => {
    const storage = new InMemoryEventLogStorage()
    for (let i = 0; i < 5; i++) await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 }))

    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      batch_size: 2,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.processed).toBe(2)
  })
})

describe('consumeIntakeTick · dispatched_failed isolation · still marker', () => {
  it('writes marker even when dispatch fails · prevents retry loop', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    const fetcher = vi.fn(async () => new Response('boom', { status: 502 }))
    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(r.outcomes[0].kind).toBe('dispatched_failed')
    expect(r.outcomes[0].marker_event_id).not.toBeNull()
    const events = await storage.select({ tenant_id: TENANT })
    const markers = events.filter((e) => e.step_id?.startsWith('router.dispatch.'))
    expect(markers.length).toBe(1)
    expect(markers[0].payload!.dispatch_kind).toBe('dispatched_failed')
  })
})

describe('consumeIntakeTick · skipped_dispatcher_off · canon-OFF still marks', () => {
  it('marks the intake as processed even when dispatcher is off', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: false, // SALA_WORKFLOW_DISPATCH_ENABLED=false
    })
    expect(r.outcomes[0].kind).toBe('skipped_dispatcher_off')
    expect(r.outcomes[0].marker_event_id).not.toBeNull()
  })
})

describe('consumeIntakeTick · tick metadata', () => {
  it('includes tick_id + timestamps + scanned count', async () => {
    const storage = new InMemoryEventLogStorage()
    await seedIntakeEvent(storage)
    const r = await consumeIntakeTick({
      storage,
      tenant_id: TENANT,
      enabled: true,
      n8n_base_url: 'https://n8n.test',
      fetcher: vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch,
    })
    expect(/^[0-9a-f-]{36}$/i.test(r.tick_id)).toBe(true)
    expect(new Date(r.started_at).toString()).not.toBe('Invalid Date')
    expect(new Date(r.finished_at).toString()).not.toBe('Invalid Date')
    expect(r.scanned).toBeGreaterThanOrEqual(1)
  })
})
