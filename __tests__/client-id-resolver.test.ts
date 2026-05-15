/**
 * client-id-resolver.test.ts · multi-path body resolver for /api/agents/run-sdk
 *
 * Covers the seven fallback paths in order plus the null-when-empty case.
 * Pure function · no I/O · no mocks.
 */
import { describe, it, expect } from 'vitest'
import { resolveClientIdFromBody } from '../src/lib/client-id-resolver'

describe('resolveClientIdFromBody', () => {
  it('reads body.client_id (canonical contract path)', () => {
    expect(resolveClientIdFromBody({ client_id: 'cli-canonical' })).toBe('cli-canonical')
  })

  it('reads body.clientId (camelCase alias)', () => {
    expect(resolveClientIdFromBody({ clientId: 'cli-camel' })).toBe('cli-camel')
  })

  it('reads body.metadata.client_id (nested metadata)', () => {
    expect(
      resolveClientIdFromBody({ metadata: { client_id: 'cli-meta' } }),
    ).toBe('cli-meta')
  })

  it('reads body.metadata.clientId (nested metadata camelCase)', () => {
    expect(
      resolveClientIdFromBody({ metadata: { clientId: 'cli-meta-camel' } }),
    ).toBe('cli-meta-camel')
  })

  it('reads body.client.id (REST-ish object identifier)', () => {
    expect(
      resolveClientIdFromBody({ client: { id: 'cli-obj' } }),
    ).toBe('cli-obj')
  })

  it('reads body.extra.client_id (workflow extras passthrough)', () => {
    expect(
      resolveClientIdFromBody({ extra: { client_id: 'cli-extra' } }),
    ).toBe('cli-extra')
  })

  it('reads body.extra.clientId (workflow extras camelCase)', () => {
    expect(
      resolveClientIdFromBody({ extra: { clientId: 'cli-extra-camel' } }),
    ).toBe('cli-extra-camel')
  })

  it('returns null when no path matches', () => {
    expect(resolveClientIdFromBody({})).toBeNull()
    expect(resolveClientIdFromBody({ agent: 'researcher', task: 'do thing' })).toBeNull()
    expect(resolveClientIdFromBody(null)).toBeNull()
    expect(resolveClientIdFromBody(undefined)).toBeNull()
    expect(resolveClientIdFromBody('not an object')).toBeNull()
  })

  it('honors precedence · direct path wins over nested', () => {
    const body = {
      client_id: 'cli-direct',
      metadata: { client_id: 'cli-nested' },
      client: { id: 'cli-obj' },
      extra: { client_id: 'cli-extra' },
    }
    expect(resolveClientIdFromBody(body)).toBe('cli-direct')
  })

  it('treats empty strings as non-matches and falls through to the next path', () => {
    const body = {
      client_id: '',
      clientId: '',
      metadata: { client_id: '' },
      client: { id: '' },
      extra: { client_id: 'cli-extra-after-empty' },
    }
    expect(resolveClientIdFromBody(body)).toBe('cli-extra-after-empty')
  })
})
