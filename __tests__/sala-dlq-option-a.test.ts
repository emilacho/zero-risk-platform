/**
 * Tests for DLQ Option A · src/lib/sala/inngest/dead-letter-handler.ts ·
 * Sprint 12 Fase 0 co-req #3 pre-flip escalón 5.
 *
 * Coverage ·
 * - EVENT_TYPES enum includes 'dead_letter' (TS-side)
 * - writeDeadLetter inserts a `dead_letter` row with canonical shape
 *   when storage is provided
 * - writeDeadLetter fires Slack webhook best-effort when URL set
 * - writeDeadLetter swallows storage errors (NEVER throws)
 * - writeDeadLetter swallows Slack errors (NEVER throws)
 * - writeDeadLetter skips Slack when env URL is unset
 * - buildDeadLetterFailureHandler returns an async function matching
 *   Inngest's onFailure signature shape
 * - Idempotency key includes the inngest_run_id so each terminal
 *   failure has a unique row (NO dedup collapse · we WANT every
 *   terminal failure tracked)
 */
import { describe, it, expect, vi } from 'vitest'
import {
  EVENT_TYPES,
  type EventType,
  type EventLogStorage,
} from '../src/lib/sala-event-log'
import {
  buildDeadLetterFailureHandler,
  writeDeadLetter,
  type DeadLetterContext,
  type DeadLetterHandlerDeps,
} from '../src/lib/sala/inngest/dead-letter-handler'

// ─── EVENT_TYPES enum ───────────────────────────────────────────────

describe('EVENT_TYPES · canonical enum extended for DLQ', () => {
  it('includes dead_letter as a value', () => {
    expect(EVENT_TYPES).toContain('dead_letter')
  })

  it('total count is 11 (10 base + dead_letter)', () => {
    expect(EVENT_TYPES.length).toBe(11)
  })

  it('dead_letter type narrows correctly', () => {
    const t: EventType = 'dead_letter'
    expect(t).toBe('dead_letter')
  })
})

// ─── writeDeadLetter happy path ─────────────────────────────────────

function fakeStorage() {
  const inserts: Array<Record<string, unknown>> = []
  const insertFn = vi.fn(async (input: Record<string, unknown>) => {
    inserts.push(input)
    return { inserted: true, event: { event_id: 'fake-' + inserts.length } }
  })
  const storage = {
    insert: insertFn,
    select: vi.fn(async () => []),
    findByIdempotencyKey: vi.fn(async () => null),
  } as unknown as EventLogStorage
  return { storage, inserts, insertFn }
}

/** Cast helper · keeps test deps typed without polluting prod types. */
function asDeps(d: {
  storage: EventLogStorage
  slackWebhookUrl?: string
  logger: unknown
  fetchImpl?: unknown
  now?: () => number
}): DeadLetterHandlerDeps {
  return d as unknown as DeadLetterHandlerDeps
}

function silentLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
  }
}

function buildCtx(
  overrides: Partial<DeadLetterContext> = {},
): DeadLetterContext {
  return {
    function_id: 'synthetic-durability-test',
    trigger_event: {
      id: 'evt-test-001',
      name: 'synthetic/durability.test',
      data: {
        runId: 'smoke-retry-001',
        tenant_id: 'synthetic',
        client_id: 'c-canary',
        stream_id: 'synthetic/c-canary/ONBOARD/2026-W23',
        correlation_id: 'corr-001',
        journey_type: 'ONBOARD',
        logical_period: '2026-W23',
      },
      ts: 1780_000_000_000,
    },
    error: new Error('synthetic transient failure · attempt 3 · runId smoke-retry-001'),
    inngest_run_id: 'inngest-run-abc-123',
    attempts_made: 4,
    ...overrides,
  }
}

describe('writeDeadLetter · happy path', () => {
  it('inserts a dead_letter event with canonical shape', async () => {
    const { storage, inserts } = fakeStorage()
    const logger = silentLogger()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    await writeDeadLetter(
      buildCtx(),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger,
        fetchImpl,
        now: () => 1780_000_000_000,
      }),
    )
    expect(storage.insert).toHaveBeenCalledTimes(1)
    expect(inserts[0]!.event_type).toBe('dead_letter')
    // tenant_id + client_id + stream_id + correlation_id are UUID-typed
    // columns · since buildCtx passes non-UUID strings, the writer
    // substitutes synthetic UUIDs and stashes originals in payload.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(inserts[0]!.tenant_id).toMatch(UUID_RE)
    expect(inserts[0]!.client_id).toMatch(UUID_RE)
    expect(inserts[0]!.stream_id).toMatch(UUID_RE)
    expect(inserts[0]!.correlation_id).toMatch(UUID_RE)
    expect(inserts[0]!.operation_type).toBe('synthetic-durability-test')
    expect(inserts[0]!.journey_type).toBe('ONBOARD')
    expect(inserts[0]!.workflow_run_id).toBe('inngest-run-abc-123')
    const payload = inserts[0]!.payload as Record<string, unknown>
    expect(payload.function_id).toBe('synthetic-durability-test')
    expect(payload.original_event_id).toBe('evt-test-001')
    expect(payload.final_error).toContain('synthetic transient failure')
    expect(payload.attempts_made).toBe(4)
    expect(payload.inngest_run_id).toBe('inngest-run-abc-123')
    expect(payload.dead_lettered_at).toBe(
      new Date(1780_000_000_000).toISOString(),
    )
    // Original non-UUID identifiers preserved in payload.
    const originals = payload.original_identifiers as Record<string, unknown>
    expect(originals.tenant_id).toBe('synthetic')
    expect(originals.client_id).toBe('c-canary')
    expect(originals.stream_id).toBe('synthetic/c-canary/ONBOARD/2026-W23')
    expect(originals.correlation_id).toBe('corr-001')
  })

  it('fires Slack webhook with [DLQ] format when URL provided', async () => {
    const { storage } = fakeStorage()
    const logger = silentLogger()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    await writeDeadLetter(
      buildCtx(),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger,
        fetchImpl,
      }),
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const callArgs = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0]!
    const [url, opts] = callArgs
    expect(url).toBe('https://slack.test/hook')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string) as { text: string }
    expect(body.text).toMatch(/^\[DLQ\] c-canary · synthetic-durability-test ·/)
    expect(body.text).toContain('synthetic transient failure')
  })

  it('truncates the error message in the Slack body (200 chars max)', async () => {
    const { storage } = fakeStorage()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    const longError = new Error('boom · ' + 'x'.repeat(500))
    await writeDeadLetter(
      buildCtx({ error: longError }),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl,
      }),
    )
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    const body = JSON.parse(calls[0]![1].body as string) as { text: string }
    // header is "[DLQ] X · function · " + 200-char error excerpt
    expect(body.text.length).toBeLessThanOrEqual(280)
  })

  it('passes through caller-provided UUIDs without substitution', async () => {
    const VALID_TENANT = '11111111-2222-4333-8444-555555555555'
    const VALID_CLIENT = '22222222-3333-4444-8555-666666666666'
    const VALID_STREAM = '33333333-4444-4555-8666-777777777777'
    const VALID_CORR = '44444444-5555-4666-8777-888888888888'
    const { storage, inserts } = fakeStorage()
    await writeDeadLetter(
      buildCtx({
        trigger_event: {
          id: 'evt-uuid-1',
          name: 'synthetic/durability.test',
          data: {
            tenant_id: VALID_TENANT,
            client_id: VALID_CLIENT,
            stream_id: VALID_STREAM,
            correlation_id: VALID_CORR,
            journey_type: 'ONBOARD',
            logical_period: '2026-W23',
          },
          ts: 1780_000_000_000,
        },
      }),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl: vi.fn(async () => ({ ok: true, status: 200 } as Response)),
      }),
    )
    expect(inserts[0]!.tenant_id).toBe(VALID_TENANT)
    expect(inserts[0]!.client_id).toBe(VALID_CLIENT)
    expect(inserts[0]!.stream_id).toBe(VALID_STREAM)
    expect(inserts[0]!.correlation_id).toBe(VALID_CORR)
    // No substitution → originals should be null in payload.
    const originals = (inserts[0]!.payload as Record<string, unknown>)
      .original_identifiers as Record<string, unknown>
    expect(originals.tenant_id).toBeNull()
    expect(originals.client_id).toBeNull()
    expect(originals.stream_id).toBeNull()
    expect(originals.correlation_id).toBeNull()
  })

  it('builds a unique idempotency_key per terminal failure (no dedup collapse)', async () => {
    const { storage, inserts } = fakeStorage()
    await writeDeadLetter(
      buildCtx({ inngest_run_id: 'run-A' }),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl: vi.fn(async () => ({ ok: true, status: 200 } as Response)),
      }),
    )
    await writeDeadLetter(
      buildCtx({ inngest_run_id: 'run-B' }),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl: vi.fn(async () => ({ ok: true, status: 200 } as Response)),
      }),
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0]!.idempotency_key).not.toBe(inserts[1]!.idempotency_key)
  })
})

// ─── writeDeadLetter fail-OPEN paths (§148) ─────────────────────────

describe('writeDeadLetter · fail-OPEN (NEVER throws)', () => {
  it('swallows storage.insert errors · still attempts Slack', async () => {
    const storage = {
      insert: vi.fn(async () => {
        throw new Error('supabase down')
      }),
      select: vi.fn(),
      findByIdempotencyKey: vi.fn(),
    } as unknown as EventLogStorage
    const logger = silentLogger()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    // The whole call must resolve without throwing.
    await expect(
      writeDeadLetter(
        buildCtx(),
        asDeps({
          storage,
          slackWebhookUrl: 'https://slack.test/hook',
          logger,
          fetchImpl,
        }),
      ),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      'dead_letter INSERT failed · fail_open',
      expect.any(Object),
    )
    // Slack still attempted.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('swallows Slack fetch errors · INSERT already done', async () => {
    const { storage, inserts } = fakeStorage()
    const logger = silentLogger()
    const fetchImpl = vi.fn(async () => {
      throw new Error('slack timeout')
    })
    await expect(
      writeDeadLetter(
        buildCtx(),
        asDeps({
          storage,
          slackWebhookUrl: 'https://slack.test/hook',
          logger,
          fetchImpl,
        }),
      ),
    ).resolves.toBeUndefined()
    expect(inserts).toHaveLength(1)
    expect(logger.warn).toHaveBeenCalledWith(
      'Slack alert dispatch failed · fail_open',
      expect.any(Object),
    )
  })

  it('Slack non-2xx is logged as warn but still resolves', async () => {
    const { storage } = fakeStorage()
    const logger = silentLogger()
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 } as Response))
    await writeDeadLetter(
      buildCtx(),
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger,
        fetchImpl,
      }),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      'Slack webhook non-2xx · alert may not have been received',
      expect.objectContaining({ status: 500 }),
    )
  })
})

// ─── writeDeadLetter env-gated Slack ────────────────────────────────

describe('writeDeadLetter · Slack URL gating', () => {
  it('skips Slack when SLACK_WEBHOOK_URL_EQUIPO and explicit URL both absent', async () => {
    const prev = process.env.SLACK_WEBHOOK_URL_EQUIPO
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
    try {
      const { storage } = fakeStorage()
      const logger = silentLogger()
      const fetchImpl = vi.fn()
      await writeDeadLetter(buildCtx(), asDeps({ storage, logger, fetchImpl }))
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        'SLACK_WEBHOOK_URL_EQUIPO unset · alert skipped',
        expect.any(Object),
      )
    } finally {
      if (prev !== undefined) process.env.SLACK_WEBHOOK_URL_EQUIPO = prev
    }
  })

  it('uses env URL when explicit URL not provided', async () => {
    const prev = process.env.SLACK_WEBHOOK_URL_EQUIPO
    process.env.SLACK_WEBHOOK_URL_EQUIPO = 'https://env-slack.test/hook'
    try {
      const { storage } = fakeStorage()
      const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
      await writeDeadLetter(
        buildCtx(),
        asDeps({
          storage,
          logger: silentLogger(),
          fetchImpl,
        }),
      )
      const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
      expect(calls[0]![0]).toBe('https://env-slack.test/hook')
    } finally {
      if (prev !== undefined) process.env.SLACK_WEBHOOK_URL_EQUIPO = prev
      else delete process.env.SLACK_WEBHOOK_URL_EQUIPO
    }
  })
})

// ─── buildDeadLetterFailureHandler signature ───────────────────────

describe('buildDeadLetterFailureHandler · Inngest onFailure wire shape', () => {
  it('returns an async function bound to function_id', async () => {
    const { storage, insertFn } = fakeStorage()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    const handler = buildDeadLetterFailureHandler(
      'test-fn-id',
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl,
      }),
    )
    expect(typeof handler).toBe('function')
    await handler({
      event: { id: 'evt-1', name: 'test/event', data: { tenant_id: 't' } },
      error: new Error('terminal failure'),
      attempt: 4,
      run_id: 'inngest-run-1',
    })
    expect(insertFn).toHaveBeenCalledOnce()
    const insertArg = insertFn.mock.calls[0]![0] as Record<string, unknown>
    expect(insertArg.operation_type).toBe('test-fn-id')
    expect((insertArg.payload as Record<string, unknown>).function_id).toBe(
      'test-fn-id',
    )
    expect((insertArg.payload as Record<string, unknown>).inngest_run_id).toBe(
      'inngest-run-1',
    )
    expect((insertArg.payload as Record<string, unknown>).attempts_made).toBe(
      4,
    )
  })

  it('unwraps the Inngest function.failed wrapper to reach the original event', async () => {
    const VALID_TENANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const VALID_CLIENT = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
    const { storage, insertFn } = fakeStorage()
    const handler = buildDeadLetterFailureHandler(
      'synthetic-durability-test',
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl: vi.fn(async () => ({ ok: true, status: 200 } as Response)),
      }),
    )
    // Simulate the real Inngest function.failed event shape · top-level
    // data is the wrapper · `data.event` is the ORIGINAL synthetic event.
    await handler({
      event: {
        id: '01KFAILUREID',
        name: 'inngest/function.failed',
        data: {
          _inngest: { status: 'Failed' },
          run_id: 'inngest-fn-run-abc',
          function_id: 'zero-risk-platform-synthetic-durability-test',
          event: {
            id: '01KORIGSYNTHETIC',
            name: 'synthetic/durability.test',
            data: {
              tenant_id: VALID_TENANT,
              client_id: VALID_CLIENT,
              runId: 'inner-run-xyz',
            },
          },
        },
      },
      error: new Error('terminal'),
    })
    const insertArg = insertFn.mock.calls[0]![0] as Record<string, unknown>
    // The writer should see the INNER event's UUIDs · NOT random ones.
    expect(insertArg.tenant_id).toBe(VALID_TENANT)
    expect(insertArg.client_id).toBe(VALID_CLIENT)
    // inngest_run_id should come from failure wrapper's `run_id` field.
    expect((insertArg.payload as Record<string, unknown>).inngest_run_id).toBe(
      'inngest-fn-run-abc',
    )
    // original_event_name should be the ORIGINAL (not the wrapper).
    expect(
      (insertArg.payload as Record<string, unknown>).original_event_name,
    ).toBe('synthetic/durability.test')
    expect(
      (insertArg.payload as Record<string, unknown>).original_event_id,
    ).toBe('01KORIGSYNTHETIC')
  })

  it('handler resolves even with undefined optional ctx fields', async () => {
    const { storage, insertFn } = fakeStorage()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as Response))
    const handler = buildDeadLetterFailureHandler(
      'minimal-fn',
      asDeps({
        storage,
        slackWebhookUrl: 'https://slack.test/hook',
        logger: silentLogger(),
        fetchImpl,
      }),
    )
    await expect(
      handler({
        event: { id: 'evt-x', name: 'x', data: null },
        error: 'string-error',
      }),
    ).resolves.toBeUndefined()
    const insertArg = insertFn.mock.calls[0]![0] as Record<string, unknown>
    // No tenant_id/client_id in trigger event → writer substitutes UUIDs.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(insertArg.tenant_id).toMatch(UUID_RE)
    expect(insertArg.client_id).toMatch(UUID_RE)
    expect((insertArg.payload as Record<string, unknown>).final_error).toBe(
      'string-error',
    )
  })
})
