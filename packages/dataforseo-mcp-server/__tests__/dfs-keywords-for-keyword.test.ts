import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/dfs-keywords-for-keyword.js'
import type { DFSClient } from '../src/client.js'

describe('dfs_keywords_for_keyword · args validation', () => {
  it('accepts a non-empty keyword', () => {
    expect(() => argsSchema.parse({ keyword: 'extintores' })).not.toThrow()
  })

  it('rejects empty keyword', () => {
    expect(() => argsSchema.parse({ keyword: '' })).toThrow()
  })

  it('respects optional limits', () => {
    expect(() => argsSchema.parse({ keyword: 'x', limit: 0 })).toThrow()
    expect(() => argsSchema.parse({ keyword: 'x', limit: 1001 })).toThrow()
    expect(() => argsSchema.parse({ keyword: 'x', limit: 100 })).not.toThrow()
  })
})

describe('dfs_keywords_for_keyword · handler', () => {
  let client: DFSClient
  let postSpy: ReturnType<typeof vi.fn>
  let estimateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postSpy = vi.fn().mockResolvedValue({
      tasks: [{ result: [{ keyword: 'extintores', search_volume: 1000 }] }],
    })
    estimateSpy = vi.fn().mockReturnValue(0.0075)
    client = { post: postSpy, estimateCost: estimateSpy } as unknown as DFSClient
  })

  it('posts to keywords_for_keyword with default location and language', async () => {
    await handler(client, { keyword: 'extintores' })
    expect(postSpy).toHaveBeenCalledOnce()
    const [path, body] = postSpy.mock.calls[0]
    expect(path).toBe('/v3/keywords_data/google/keywords_for_keyword/live')
    expect(body[0]).toMatchObject({
      keyword: 'extintores',
      location_code: 2840,
      language_code: 'en',
      limit: 10,
    })
  })

  it('honours overrides when provided', async () => {
    await handler(client, {
      keyword: 'EPP',
      location_code: 2218, // Ecuador
      language_code: 'es',
      limit: 50,
    })
    const [, body] = postSpy.mock.calls[0]
    expect(body[0]).toMatchObject({
      keyword: 'EPP',
      location_code: 2218,
      language_code: 'es',
      limit: 50,
    })
  })

  it('attaches the cost estimate to the response', async () => {
    const result = (await handler(client, { keyword: 'extintores' })) as Record<string, unknown>
    expect(result.estimated_cost_usd).toBe(0.0075)
    expect(estimateSpy).toHaveBeenCalledWith('keywords.for_keyword')
  })
})
