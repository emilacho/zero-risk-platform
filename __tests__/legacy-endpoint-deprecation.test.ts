/**
 * Unit tests for src/lib/legacy-endpoint-deprecation.ts · Sprint 12 Drift B
 * paso D · deprecation instrumentation for the legacy `/api/agents/run`
 * endpoint.
 *
 * Spec · `spec-CC2-legacy-endpoint-deprecation-instrument.md`. Verifies ·
 *  - addLegacyDeprecationHeaders attaches RFC 9745 Deprecation + Link headers
 *  - legacyJson returns a NextResponse with body intact + deprecation headers
 *  - logLegacyEndpointUsage fires a single structured console.warn line
 *  - LEGACY_INVOCATION_METADATA shape canon (consumed by route metadata spread)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  addLegacyDeprecationHeaders,
  legacyJson,
  logLegacyEndpointUsage,
  LEGACY_INVOCATION_METADATA,
  LEGACY_ENDPOINT_PATH,
  LEGACY_SUCCESSOR_PATH,
} from '../src/lib/legacy-endpoint-deprecation'
import { NextResponse } from 'next/server'

describe('legacy-endpoint-deprecation · addLegacyDeprecationHeaders', () => {
  it('attaches Deprecation: true header per RFC 9745', () => {
    const res = NextResponse.json({ ok: true })
    addLegacyDeprecationHeaders(res)
    expect(res.headers.get('Deprecation')).toBe('true')
  })

  it('attaches Link rel="successor-version" pointing to /api/agents/run-sdk', () => {
    const res = NextResponse.json({ ok: true })
    addLegacyDeprecationHeaders(res)
    const link = res.headers.get('Link')
    expect(link).toBe('</api/agents/run-sdk>; rel="successor-version"')
  })

  it('attaches X-Deprecated-Endpoint + X-Successor-Endpoint markers', () => {
    const res = NextResponse.json({ ok: true })
    addLegacyDeprecationHeaders(res)
    expect(res.headers.get('X-Deprecated-Endpoint')).toBe('/api/agents/run')
    expect(res.headers.get('X-Successor-Endpoint')).toBe('/api/agents/run-sdk')
  })

  it('is idempotent · multiple calls do not stack headers', () => {
    const res = NextResponse.json({ ok: true })
    addLegacyDeprecationHeaders(res)
    addLegacyDeprecationHeaders(res)
    addLegacyDeprecationHeaders(res)
    expect(res.headers.get('Deprecation')).toBe('true')
  })

  it('returns the same response instance (chainable)', () => {
    const res = NextResponse.json({ ok: true })
    const out = addLegacyDeprecationHeaders(res)
    expect(out).toBe(res)
  })
})

describe('legacy-endpoint-deprecation · legacyJson', () => {
  it('returns a NextResponse with the body intact', async () => {
    const res = legacyJson({ hello: 'world' })
    const body = (await res.json()) as { hello: string }
    expect(body.hello).toBe('world')
  })

  it('honors the status init parameter', () => {
    const res = legacyJson({ error: 'unauthorized' }, { status: 401 })
    expect(res.status).toBe(401)
  })

  it('always includes deprecation headers regardless of status', () => {
    const res200 = legacyJson({ ok: true })
    const res400 = legacyJson({ error: 'bad' }, { status: 400 })
    const res500 = legacyJson({ error: 'internal' }, { status: 500 })
    for (const r of [res200, res400, res500]) {
      expect(r.headers.get('Deprecation')).toBe('true')
      expect(r.headers.get('X-Deprecated-Endpoint')).toBe('/api/agents/run')
    }
  })
})

describe('legacy-endpoint-deprecation · logLegacyEndpointUsage', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('emits a single console.warn call', () => {
    logLegacyEndpointUsage({
      workflow_id: 'wf_test',
      workflow_execution_id: 'exec_test',
      agent_slug: 'jefe-marketing',
      caller: 'n8n',
      user_agent: 'n8n/test',
      client_id: 'client_test',
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('log line carries the canon scan tag · kind=legacy_endpoint_invocation', () => {
    logLegacyEndpointUsage({
      workflow_id: 'wf_test',
      workflow_execution_id: 'exec_test',
      agent_slug: 'jefe-marketing',
      caller: 'n8n',
      user_agent: null,
      client_id: null,
    })
    const arg = warnSpy.mock.calls[0]?.[0] as string
    expect(arg).toContain('§149 Drift B paso D')
    expect(arg).toContain('"kind":"legacy_endpoint_invocation"')
    expect(arg).toContain('"endpoint":"/api/agents/run"')
    expect(arg).toContain('"successor":"/api/agents/run-sdk"')
  })

  it('preserves null workflow_id + user_agent without dropping the call', () => {
    logLegacyEndpointUsage({
      workflow_id: null,
      workflow_execution_id: null,
      agent_slug: 'unknown',
      caller: 'api',
      user_agent: null,
      client_id: null,
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const arg = warnSpy.mock.calls[0]?.[0] as string
    expect(arg).toContain('"workflow_id":null')
  })

  it('includes a parseable JSON payload after the prefix tag', () => {
    logLegacyEndpointUsage({
      workflow_id: 'wf_x',
      workflow_execution_id: 'exec_x',
      agent_slug: 'reporting-agent',
      caller: 'n8n',
      user_agent: 'webhook',
      client_id: 'client_x',
    })
    const arg = warnSpy.mock.calls[0]?.[0] as string
    // The tag is fixed prefix · JSON is everything after the closing `]`.
    const jsonStart = arg.indexOf('{')
    expect(jsonStart).toBeGreaterThan(0)
    const json = JSON.parse(arg.slice(jsonStart)) as {
      kind: string
      endpoint: string
      successor: string
      workflow_id: string | null
      agent_slug: string | null
      ts: string
    }
    expect(json.kind).toBe('legacy_endpoint_invocation')
    expect(json.endpoint).toBe('/api/agents/run')
    expect(json.workflow_id).toBe('wf_x')
    expect(json.agent_slug).toBe('reporting-agent')
    expect(typeof json.ts).toBe('string')
    // ts is an ISO date string
    expect(new Date(json.ts).toISOString()).toBe(json.ts)
  })
})

describe('legacy-endpoint-deprecation · LEGACY_INVOCATION_METADATA constant', () => {
  it('carries the canon shape consumed by route metadata spread', () => {
    expect(LEGACY_INVOCATION_METADATA.endpoint_path).toBe('/api/agents/run')
    expect(LEGACY_INVOCATION_METADATA.endpoint_legacy).toBe(true)
    expect(LEGACY_INVOCATION_METADATA.endpoint_successor).toBe('/api/agents/run-sdk')
  })

  it('exports canonical path constants for downstream consumers', () => {
    expect(LEGACY_ENDPOINT_PATH).toBe('/api/agents/run')
    expect(LEGACY_SUCCESSOR_PATH).toBe('/api/agents/run-sdk')
  })
})
