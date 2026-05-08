import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/ghl-search-contacts.js'
import type { GHLClient } from '../src/client.js'

describe('ghl_search_contacts · args validation', () => {
  it('accepts a non-empty query', () => {
    expect(() => argsSchema.parse({ query: 'john' })).not.toThrow()
  })

  it('rejects empty query', () => {
    expect(() => argsSchema.parse({ query: '' })).toThrow()
  })

  it('rejects limit out of range', () => {
    expect(() => argsSchema.parse({ query: 'x', limit: 0 })).toThrow()
    expect(() => argsSchema.parse({ query: 'x', limit: 101 })).toThrow()
    expect(() => argsSchema.parse({ query: 'x', limit: 50 })).not.toThrow()
  })
})

describe('ghl_search_contacts · handler', () => {
  let client: GHLClient
  let getSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSpy = vi.fn().mockResolvedValue({ contacts: [{ id: 'c1', name: 'X' }] })
    client = { get: getSpy } as unknown as GHLClient
  })

  it('builds the search URL with default limit 20', async () => {
    await handler(client, { query: 'jane' })
    expect(getSpy).toHaveBeenCalledOnce()
    const url = getSpy.mock.calls[0][0] as string
    expect(url).toBe('/contacts/search?query=jane&limit=20')
  })

  it('passes through a custom limit', async () => {
    await handler(client, { query: 'acme', limit: 5 })
    const url = getSpy.mock.calls[0][0] as string
    expect(url).toBe('/contacts/search?query=acme&limit=5')
  })

  it('encodes special characters in the query', async () => {
    await handler(client, { query: 'jane doe & co' })
    const url = getSpy.mock.calls[0][0] as string
    expect(url).toContain('jane+doe+%26+co')
  })

  it('returns the client response unchanged', async () => {
    const result = await handler(client, { query: 'jane' })
    expect(result).toEqual({ contacts: [{ id: 'c1', name: 'X' }] })
  })
})
