/**
 * Tests · reconciliation · Model B OBSERVE mode (conexión 2026-06-05).
 *
 * Covers all 5 ReconcileMismatchKind branches + Slack alert helper
 * (match=log only · mismatch=Slack · fail-open).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  reconcileObserved,
  postReconciliationAlert,
} from '@/lib/sala-journey-dispatch'

// Canon canonical · the 7-phase taxonomy aligned with CC#4 (Costura C
// closure 2026-06-05). Names mirror CANONICAL_PHASES_LyVoKcrypS5uLyuu.
const PHASES = [
  'INTAKE',
  'DISCOVERY',
  'WORKSPACE',
  'SCHEDULING',
  'NOTIFICATION',
  'CASCADE',
  'APIFY_WIRE',
]

describe('reconcileObserved · match', () => {
  it('canon · first phase emitted, no baseline → match', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'INTAKE',
      last_phase_step_id: null,
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('match')
    expect(r.expected_next).toBe('DISCOVERY')
    expect(r.delta).toBe(0)
  })

  it('canon · emitted is expected next from last → match', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'DISCOVERY',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('match')
    expect(r.expected_next).toBe('SCHEDULING')
  })

  it('canon · idempotent re-emit of last phase → match', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'WORKSPACE',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('match')
    expect(r.summary).toMatch(/idempotent/)
  })
})

describe('reconcileObserved · skipped_ahead', () => {
  it('canon · first observed is not boundary #0 → skipped_ahead', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'SCHEDULING',
      last_phase_step_id: null,
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('skipped_ahead')
    expect(r.delta).toBe(3)
  })

  it('canon · emitted is 2 boundaries ahead → skipped_ahead with delta=1', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'INTAKE',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('skipped_ahead')
    expect(r.delta).toBe(1)
    expect(r.expected_next).toBe('DISCOVERY')
  })
})

describe('reconcileObserved · backwards', () => {
  it('canon · emitted before last → backwards with negative delta', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'DISCOVERY',
      last_phase_step_id: 'SCHEDULING',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('backwards')
    expect(r.delta).toBeLessThan(0)
  })
})

describe('reconcileObserved · unknown_phase', () => {
  it('canon · emitted not in boundaries → unknown_phase', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'MADE_UP_PHASE',
      last_phase_step_id: 'INTAKE',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('unknown_phase')
    expect(r.expected_next).toBeNull()
  })
})

describe('reconcileObserved · no_baseline', () => {
  it('canon · last not in boundaries → no_baseline', () => {
    const r = reconcileObserved({
      emitted_phase_step_id: 'INTAKE',
      last_phase_step_id: 'unknown-step-from-state',
      phase_boundaries: PHASES,
    })
    expect(r.kind).toBe('no_baseline')
  })
})

describe('postReconciliationAlert · match path · log only', () => {
  it('canon · match → no Slack fetch · info log', async () => {
    const fetchImpl = vi.fn()
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await postReconciliationAlert({
      result: {
        kind: 'match',
        expected_next: 'next',
        delta: 0,
        summary: 'ok',
      },
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'INTAKE',
      last_phase_step_id: null,
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
      logger,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('postReconciliationAlert · mismatch path · Slack alert', () => {
  it('canon · skipped_ahead → posts to Slack with [OBSERVE] prefix', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response('ok', { status: 200 }),
    )
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await postReconciliationAlert({
      result: {
        kind: 'skipped_ahead',
        expected_next: 'DISCOVERY',
        delta: 1,
        summary: 'skipped 1',
      },
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'INTAKE',
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
      logger,
    })
    expect(fetchImpl).toHaveBeenCalled()
    const callBody = JSON.parse(
      (fetchImpl.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(callBody.text).toContain('[OBSERVE]')
    expect(callBody.text).toContain('skipped_ahead')
    expect(callBody.text).toContain('ONBOARD')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('canon · backwards → posts to Slack', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response('ok', { status: 200 }),
    )
    await postReconciliationAlert({
      result: {
        kind: 'backwards',
        expected_next: 'next',
        delta: -2,
        summary: 'backwards',
      },
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'INTAKE',
      last_phase_step_id: 'SCHEDULING',
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
    })
    const callBody = JSON.parse(
      (fetchImpl.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(callBody.text).toContain('backwards')
  })

  it('canon · unknown_phase → posts to Slack', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response('ok', { status: 200 }),
    )
    await postReconciliationAlert({
      result: {
        kind: 'unknown_phase',
        expected_next: null,
        delta: Number.NaN,
        summary: 'unknown',
      },
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'MADE_UP_PHASE',
      last_phase_step_id: 'INTAKE',
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
    })
    expect(fetchImpl).toHaveBeenCalled()
  })
})

describe('postReconciliationAlert · fail-open · NEVER throws', () => {
  it('canon · Slack throws → swallow + warn log · NO propagation', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await expect(
      postReconciliationAlert({
        result: {
          kind: 'backwards',
          expected_next: 'x',
          delta: -1,
          summary: 's',
        },
        journey_type: 'ONBOARD',
        stream_id: 'stream-1',
        emitted_phase_step_id: 'INTAKE',
        last_phase_step_id: 'SCHEDULING',
        slack_webhook_url: 'https://hooks.test/slack',
        fetch_impl: fetchImpl as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('canon · Slack non-2xx → swallow + warn · NO throw', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 502 }))
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await postReconciliationAlert({
      result: {
        kind: 'unknown_phase',
        expected_next: null,
        delta: Number.NaN,
        summary: 's',
      },
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'x',
      last_phase_step_id: null,
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
      logger,
    })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('canon · no webhook URL set → skip + info log · NO throw', async () => {
    const orig = process.env.SLACK_WEBHOOK_URL_EQUIPO
    const origAlt = process.env.SLACK_WEBHOOK_URL
    delete process.env.SLACK_WEBHOOK_URL_EQUIPO
    delete process.env.SLACK_WEBHOOK_URL
    try {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      await postReconciliationAlert({
        result: {
          kind: 'backwards',
          expected_next: 'x',
          delta: -1,
          summary: 's',
        },
        journey_type: 'ONBOARD',
        stream_id: 'stream-1',
        emitted_phase_step_id: 'INTAKE',
        last_phase_step_id: 'SCHEDULING',
        logger,
      })
      expect(logger.info).toHaveBeenCalled()
    } finally {
      if (orig !== undefined) process.env.SLACK_WEBHOOK_URL_EQUIPO = orig
      if (origAlt !== undefined) process.env.SLACK_WEBHOOK_URL = origAlt
    }
  })
})

describe('reconcileObserved + alert · STOP-2 dimension (a) dispatch-único', () => {
  // The "dispatch-único" check is enforced at the storage layer via
  // idempotency_key UNIQUE constraint · here we verify that 2x emits of
  // the same phase produce IDEMPOTENT reconcile result, so re-emits do
  // NOT spam Slack with mismatch alerts.
  it('canon · re-emitting last phase boundary → match (no alert · idempotent)', async () => {
    const result1 = reconcileObserved({
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'WORKSPACE',
      phase_boundaries: PHASES,
    })
    expect(result1.kind).toBe('match')

    const fetchImpl = vi.fn()
    await postReconciliationAlert({
      result: result1,
      journey_type: 'ONBOARD',
      stream_id: 'stream-1',
      emitted_phase_step_id: 'WORKSPACE',
      last_phase_step_id: 'WORKSPACE',
      slack_webhook_url: 'https://hooks.test/slack',
      fetch_impl: fetchImpl as unknown as typeof fetch,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
