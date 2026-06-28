/**
 * Tests · isRetriableRailwayProxyFailure (502 diag fix · 2026-06-28 · CC#4).
 *
 * The Vercel→Railway proxy hop retries transient infra windows (agent-runner
 * deploy swap / crash restart → conn-fail or upstream 5xx) but must NOT retry
 * our own timeout (abort→504, re-doing 790s is wrong) nor graceful agent
 * failures (success:false bodies · app errors passed through). §148 honest
 * split · this unit covers the pure decision · the loop mechanics are integration.
 */
import { describe, it, expect } from 'vitest'
import { isRetriableRailwayProxyFailure } from '@/app/api/agents/run-sdk/route'

describe('isRetriableRailwayProxyFailure', () => {
  it('RETRY · connection error that is NOT an abort (Railway restart window)', () => {
    expect(isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: false })).toBe(true)
  })

  it('NO RETRY · abort (our own 790s timeout → 504)', () => {
    expect(isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: true })).toBe(false)
  })

  it('RETRY · upstream 502 non-graceful (Railway edge during swap)', () => {
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 502, isGracefulAgentFailure: false }),
    ).toBe(true)
  })

  it('RETRY · upstream 503 / 500 non-graceful (boundary)', () => {
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 503, isGracefulAgentFailure: false }),
    ).toBe(true)
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 500, isGracefulAgentFailure: false }),
    ).toBe(true)
  })

  it('NO RETRY · 5xx that is a graceful agent failure (success:false · passed through)', () => {
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 500, isGracefulAgentFailure: true }),
    ).toBe(false)
  })

  it('NO RETRY · non-5xx response (2xx/4xx proceed normally)', () => {
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 200, isGracefulAgentFailure: false }),
    ).toBe(false)
    expect(
      isRetriableRailwayProxyFailure({ kind: 'http', status: 499, isGracefulAgentFailure: false }),
    ).toBe(false)
  })
})
