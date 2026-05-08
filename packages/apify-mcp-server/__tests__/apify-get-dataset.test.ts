import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/apify-get-dataset.js'
import type { ApifyClient } from '../src/client.js'

describe('apify_get_dataset · args validation', () => {
  it('requires dataset_id', () => {
    expect(() => argsSchema.parse({})).toThrow()
    expect(() => argsSchema.parse({ dataset_id: 'abc' })).not.toThrow()
  })

  it('rejects empty dataset_id', () => {
    expect(() => argsSchema.parse({ dataset_id: '' })).toThrow()
  })

  it('clamps limit to range', () => {
    expect(() => argsSchema.parse({ dataset_id: 'a', limit: 0 })).toThrow()
    expect(() => argsSchema.parse({ dataset_id: 'a', limit: 10001 })).toThrow()
    expect(() => argsSchema.parse({ dataset_id: 'a', limit: 10000 })).not.toThrow()
  })
})

describe('apify_get_dataset · handler', () => {
  let client: ApifyClient
  let getSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSpy = vi.fn().mockResolvedValue([{ id: 'item-1' }])
    client = { get: getSpy } as unknown as ApifyClient
  })

  it('calls /datasets/<id>/items with the default limit of 100', async () => {
    await handler(client, { dataset_id: 'ds_123' })
    const [path, extra] = getSpy.mock.calls[0]
    expect(path).toBe('/datasets/ds_123/items')
    expect(extra).toEqual({ limit: '100' })
  })

  it('passes limit and offset when provided', async () => {
    await handler(client, { dataset_id: 'ds_123', limit: 50, offset: 25 })
    const [, extra] = getSpy.mock.calls[0]
    expect(extra).toEqual({ limit: '50', offset: '25' })
  })

  it('encodes the dataset id', async () => {
    await handler(client, { dataset_id: 'foo bar/baz' })
    const [path] = getSpy.mock.calls[0]
    expect(path).toBe('/datasets/foo%20bar%2Fbaz/items')
  })

  it('returns the underlying client response', async () => {
    const result = await handler(client, { dataset_id: 'ds_123' })
    expect(result).toEqual([{ id: 'item-1' }])
  })
})
