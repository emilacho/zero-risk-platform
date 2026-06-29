/**
 * braintrust · agent-runner observability wire · unit tests
 *
 * Cubre · fail-open sin BRAINTRUST_API_KEY (no-op · cero overhead) +
 * pass-through del wrap del Claude Agent SDK + flush sin lanzar + defaults.
 *
 * NO testea el path init-con-key (haría login/red real) · solo el contrato
 * fail-open + pass-through que es lo que protege las invocaciones del runner.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  initBraintrust,
  isBraintrustEnabled,
  instrumentClaudeAgentSdk,
  flushBraintrust,
  BRAINTRUST_PROJECT_ID,
  BRAINTRUST_ORG_ID,
} from '../braintrust'

describe('braintrust · agent-runner wire · fail-open', () => {
  const savedKey = process.env.BRAINTRUST_API_KEY

  beforeEach(() => {
    delete process.env.BRAINTRUST_API_KEY
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.BRAINTRUST_API_KEY
    else process.env.BRAINTRUST_API_KEY = savedKey
  })

  it('initBraintrust returns null when no API key (no-op)', () => {
    expect(initBraintrust()).toBeNull()
  })

  it('isBraintrustEnabled is false without a logger', () => {
    expect(isBraintrustEnabled()).toBe(false)
  })

  it('instrumentClaudeAgentSdk is pass-through (same ref) without key', () => {
    const sdk = { query: () => {}, other: 1 }
    expect(instrumentClaudeAgentSdk(sdk)).toBe(sdk)
  })

  it('instrumentClaudeAgentSdk leaves a non-SDK object unchanged even with key', () => {
    // wrapClaudeAgentSDK warns + returns input when there is no `query` fn ·
    // exercises the wrap path fallback sin red.
    process.env.BRAINTRUST_API_KEY = 'sk-test-not-real'
    const notAnSdk = { foo: 1 }
    expect(instrumentClaudeAgentSdk(notAnSdk)).toBe(notAnSdk)
  })

  it('flushBraintrust resolves without throwing when disabled', async () => {
    await expect(flushBraintrust()).resolves.toBeUndefined()
  })

  it('exposes pinned project + org ids', () => {
    expect(BRAINTRUST_PROJECT_ID).toBe('9a1f2db0-41d0-444d-97ce-665c29cbf174')
    expect(BRAINTRUST_ORG_ID).toBe('681199c4-0884-4691-bd62-4e31e88e5835')
  })
})
