/**
 * Tests · Track O · fast-ack helper + recursion strip (SPEC 2026-06-09).
 *
 * Validates the canonical `buildInnerRequestWithoutCallback` helper · the
 * inner request must have `callback_url` removed top-level + context-level
 * so the recursive POST takes the sync path canon · zero double-dispatch.
 * Plus the auth header passthrough (canon defense in depth).
 *
 * The full async-branch HTTP behavior (status 202 + ack body + waitUntil
 * dispatch) is exercised end-to-end in integration · vitest covers the pure
 * helper here · canon §148 honest split unit vs integration.
 */
import { describe, it, expect } from 'vitest'
import { buildInnerRequestWithoutCallback } from '@/app/api/agents/run-sdk/route'

function outerReq(body: Record<string, unknown>): Request {
  return new Request('https://prod.test/api/agents/run-sdk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'super-secret',
      'x-vercel-id': 'iad1::abc',
      host: 'should-be-stripped',
    },
    body: JSON.stringify(body),
  })
}

describe('buildInnerRequestWithoutCallback · canon callback_url strip', () => {
  it('strips callback_url top-level snake', async () => {
    const outer = outerReq({
      agent: 'x',
      task: 't',
      workflow_id: 'wf-1',
      workflow_execution_id: 'we-1',
      callback_url: 'https://outer.test/cb',
    })
    const inner = buildInnerRequestWithoutCallback(outer, {
      agent: 'x',
      task: 't',
      workflow_id: 'wf-1',
      workflow_execution_id: 'we-1',
      callback_url: 'https://outer.test/cb',
    })
    const innerBody = (await inner.json()) as Record<string, unknown>
    expect(innerBody.callback_url).toBeUndefined()
    expect(innerBody.callbackUrl).toBeUndefined()
    expect(innerBody.agent).toBe('x')
    expect(innerBody.task).toBe('t')
    expect(innerBody.workflow_id).toBe('wf-1')
    expect(innerBody.workflow_execution_id).toBe('we-1')
  })

  it('strips callbackUrl top-level camel', async () => {
    const outer = outerReq({ agent: 'x', task: 't', callbackUrl: 'https://outer.test/cb' })
    const inner = buildInnerRequestWithoutCallback(outer, {
      agent: 'x',
      task: 't',
      callbackUrl: 'https://outer.test/cb',
    })
    const innerBody = (await inner.json()) as Record<string, unknown>
    expect(innerBody.callbackUrl).toBeUndefined()
    expect(innerBody.callback_url).toBeUndefined()
  })

  it('strips callback_url + callbackUrl nested under context', async () => {
    const outer = outerReq({
      agent: 'x',
      task: 't',
      context: {
        smoke_test: false,
        callback_url: 'https://ctx.test/cb',
        callbackUrl: 'https://ctx.test/cb2',
        client_name: 'kept',
      },
    })
    const inner = buildInnerRequestWithoutCallback(outer, {
      agent: 'x',
      task: 't',
      context: {
        smoke_test: false,
        callback_url: 'https://ctx.test/cb',
        callbackUrl: 'https://ctx.test/cb2',
        client_name: 'kept',
      } as unknown as Record<string, unknown>,
    })
    const innerBody = (await inner.json()) as Record<string, unknown>
    const ctx = innerBody.context as Record<string, unknown>
    expect(ctx.callback_url).toBeUndefined()
    expect(ctx.callbackUrl).toBeUndefined()
    expect(ctx.client_name).toBe('kept')
    expect(ctx.smoke_test).toBe(false)
  })

  it('preserves all non-callback body fields verbatim', async () => {
    const fullBody = {
      agent: 'onboarding-specialist',
      task: 'long task body',
      client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
      workflow_id: 'wf-X',
      workflow_execution_id: 'we-Y',
      force_restart: true,
      callback_url: 'https://strip-me.test/cb',
      context: {
        smoke_test: false,
        client_name: 'Náufrago',
        website: 'https://www.instagram.com/naufrago.ec/',
        callback_url: 'https://strip-me-too.test/cb',
      },
    }
    const inner = buildInnerRequestWithoutCallback(outerReq(fullBody), fullBody)
    const innerBody = (await inner.json()) as Record<string, unknown>
    expect(innerBody.agent).toBe('onboarding-specialist')
    expect(innerBody.task).toBe('long task body')
    expect(innerBody.client_id).toBe('d69100b5-8ad7-4bb0-908c-68b5544065dc')
    expect(innerBody.workflow_id).toBe('wf-X')
    expect(innerBody.workflow_execution_id).toBe('we-Y')
    expect(innerBody.force_restart).toBe(true)
    expect(innerBody.callback_url).toBeUndefined()
    const ctx = innerBody.context as Record<string, unknown>
    expect(ctx.smoke_test).toBe(false)
    expect(ctx.client_name).toBe('Náufrago')
    expect(ctx.website).toBe('https://www.instagram.com/naufrago.ec/')
    expect(ctx.callback_url).toBeUndefined()
  })

  it('forwards request headers (canon · auth + workflow attribution)', async () => {
    const outer = outerReq({ agent: 'x', task: 't' })
    const inner = buildInnerRequestWithoutCallback(outer, {
      agent: 'x',
      task: 't',
    })
    expect(inner.method).toBe('POST')
    expect(inner.headers.get('x-api-key')).toBe('super-secret')
    expect(inner.headers.get('x-vercel-id')).toBe('iad1::abc')
    expect(inner.headers.get('content-type')).toBe('application/json')
    // Hop-by-hop stripped
    expect(inner.headers.get('host')).toBeNull()
  })

  it('handles missing context · defaults to empty object', async () => {
    const inner = buildInnerRequestWithoutCallback(
      outerReq({ agent: 'x', task: 't', callback_url: 'https://o.test/cb' }),
      { agent: 'x', task: 't', callback_url: 'https://o.test/cb' },
    )
    const innerBody = (await inner.json()) as Record<string, unknown>
    expect(innerBody.context).toEqual({})
  })

  it('uses the same URL as the outer request (canonical recursion target)', async () => {
    const outer = outerReq({ agent: 'x', task: 't' })
    const inner = buildInnerRequestWithoutCallback(outer, { agent: 'x', task: 't' })
    expect(inner.url).toBe(outer.url)
  })
})
