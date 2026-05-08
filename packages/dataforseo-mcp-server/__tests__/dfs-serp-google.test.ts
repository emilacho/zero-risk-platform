import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/dfs-serp-google.js'
import type { DFSClient } from '../src/client.js'

describe('dfs_serp_google · args validation', () => {
  it('requires a keyword', () => {
    expect(() => argsSchema.parse({})).toThrow()
    expect(() => argsSchema.parse({ keyword: 'extintores' })).not.toThrow()
  })

  it('rejects empty keyword', () => {
    expect(() => argsSchema.parse({ keyword: '' })).toThrow()
  })

  it('respects depth bounds (1-700)', () => {
    expect(() => argsSchema.parse({ keyword: 'x', depth: 0 })).toThrow()
    expect(() => argsSchema.parse({ keyword: 'x', depth: 701 })).toThrow()
    expect(() => argsSchema.parse({ keyword: 'x', depth: 100 })).not.toThrow()
  })
})

describe('dfs_serp_google · handler', () => {
  let client: DFSClient
  let postSpy: ReturnType<typeof vi.fn>
  let estimateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postSpy = vi.fn().mockResolvedValue({
      tasks: [
        {
          result: [
            {
              keyword: 'extintores guayaquil',
              items: [{ rank_group: 1, url: 'https://example.com' }],
            },
          ],
        },
      ],
    })
    estimateSpy = vi.fn().mockReturnValue(0.0006)
    client = { post: postSpy, estimateCost: estimateSpy } as unknown as DFSClient
  })

  it('hits /v3/serp/google/organic/live/regular with default location/lang/depth', async () => {
    await handler(client, { keyword: 'extintores guayaquil' })
    expect(postSpy).toHaveBeenCalledOnce()
    const [path, body] = postSpy.mock.calls[0]
    expect(path).toBe('/v3/serp/google/organic/live/regular')
    expect(body[0]).toMatchObject({
      keyword: 'extintores guayaquil',
      location_code: 2840,
      language_code: 'en',
      depth: 100,
    })
  })

  it('honours overrides (location_code, language_code, depth)', async () => {
    await handler(client, {
      keyword: 'EPP industrial',
      location_code: 2218,
      language_code: 'es',
      depth: 50,
    })
    const [, body] = postSpy.mock.calls[0]
    expect(body[0]).toMatchObject({
      keyword: 'EPP industrial',
      location_code: 2218,
      language_code: 'es',
      depth: 50,
    })
  })

  it('attaches the cost estimate to the response', async () => {
    const result = (await handler(client, { keyword: 'x' })) as Record<string, unknown>
    expect(result.estimated_cost_usd).toBe(0.0006)
    expect(estimateSpy).toHaveBeenCalledWith('serp.google')
  })
})
