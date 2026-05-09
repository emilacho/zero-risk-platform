import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/apify-run-actor.js'
import type { ApifyClient } from '../src/client.js'

describe('apify_run_actor · args validation', () => {
  it('requires actor_id', () => {
    expect(() => argsSchema.parse({})).toThrow()
    expect(() => argsSchema.parse({ actor_id: 'apify/web-scraper' })).not.toThrow()
  })

  it('rejects empty actor_id', () => {
    expect(() => argsSchema.parse({ actor_id: '' })).toThrow()
  })

  it('input defaults to {}', () => {
    const parsed = argsSchema.parse({ actor_id: 'apify/web-scraper' })
    expect(parsed.input).toEqual({})
  })

  it('clamps timeout_ms to range', () => {
    expect(() => argsSchema.parse({ actor_id: 'a', timeout_ms: 999 })).toThrow()
    expect(() => argsSchema.parse({ actor_id: 'a', timeout_ms: 600_001 })).toThrow()
    expect(() => argsSchema.parse({ actor_id: 'a', timeout_ms: 60_000 })).not.toThrow()
  })
})

describe('apify_run_actor · handler · fire-and-return', () => {
  let client: ApifyClient
  let postSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postSpy = vi.fn().mockResolvedValue({ data: { id: 'run_42', status: 'RUNNING' } })
    client = { post: postSpy } as unknown as ApifyClient
  })

  it('POSTs to /acts/<id>/runs with the input body', async () => {
    await handler(client, { actor_id: 'apify/web-scraper', input: { startUrls: ['https://x.io'] } })
    expect(postSpy).toHaveBeenCalledOnce()
    const [path, body] = postSpy.mock.calls[0]
    expect(path).toBe('/acts/apify%2Fweb-scraper/runs')
    expect(body).toEqual({ startUrls: ['https://x.io'] })
  })

  it('returns the run handle without waiting', async () => {
    const result = (await handler(client, { actor_id: 'apify/web-scraper' })) as { data: { id: string } }
    expect(result.data.id).toBe('run_42')
  })

  it('does not call runActorAndWait by default', async () => {
    const waitSpy = vi.fn()
    ;(client as unknown as { runActorAndWait: typeof waitSpy }).runActorAndWait = waitSpy
    await handler(client, { actor_id: 'apify/web-scraper' })
    expect(waitSpy).not.toHaveBeenCalled()
  })
})

describe('apify_run_actor · handler · wait_for_finish=true', () => {
  it('delegates to runActorAndWait with timeout_ms', async () => {
    const waitSpy = vi.fn().mockResolvedValue([{ id: 'item-1' }])
    const postSpy = vi.fn()
    const client = { post: postSpy, runActorAndWait: waitSpy } as unknown as ApifyClient
    const result = await handler(client, {
      actor_id: 'apify/google-ads-scraper',
      input: { advertiser: 'X' },
      wait_for_finish: true,
      timeout_ms: 30_000,
    })
    expect(waitSpy).toHaveBeenCalledOnce()
    expect(waitSpy.mock.calls[0]).toEqual(['apify/google-ads-scraper', { advertiser: 'X' }, 30_000])
    expect(postSpy).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: 'item-1' }])
  })

  it('falls back to default 120s timeout when not provided', async () => {
    const waitSpy = vi.fn().mockResolvedValue([])
    const client = { runActorAndWait: waitSpy } as unknown as ApifyClient
    await handler(client, { actor_id: 'apify/x', wait_for_finish: true })
    expect(waitSpy.mock.calls[0][2]).toBe(120_000)
  })
})
