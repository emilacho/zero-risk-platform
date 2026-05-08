import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/higgsfield-generate-video.js'
import type { HiggsfieldClient } from '../src/client.js'

describe('higgsfield_generate_video · args validation', () => {
  it('requires prompt + aspect + duration_sec', () => {
    expect(() => argsSchema.parse({})).toThrow()
    expect(() => argsSchema.parse({ prompt: 'fire safety scene' })).toThrow()
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '16:9' })).toThrow()
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '16:9', duration_sec: 5 })).not.toThrow()
  })

  it('rejects invalid aspect ratio', () => {
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '21:9', duration_sec: 5 })).toThrow()
  })

  it('rejects duration_sec out of range', () => {
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '16:9', duration_sec: 0 })).toThrow()
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '16:9', duration_sec: 31 })).toThrow()
    expect(() => argsSchema.parse({ prompt: 'x', aspect: '16:9', duration_sec: 30 })).not.toThrow()
  })
})

describe('higgsfield_generate_video · handler · no webhook', () => {
  it('POSTs to /v1/videos and returns the job_id', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'job_abc', eta: 45 })
    const client = { post, webhookUrl: null } as unknown as HiggsfieldClient
    const result = await handler(client, { prompt: 'extintor en planta', aspect: '16:9', duration_sec: 5 })
    expect(post).toHaveBeenCalledOnce()
    expect(post.mock.calls[0]).toEqual([
      '/v1/videos',
      { prompt: 'extintor en planta', aspect: '16:9', duration_sec: 5 },
    ])
    expect(result.job_id).toBe('job_abc')
    expect(result.eta_seconds).toBe(45)
    expect(result.webhook_registered).toBe(false)
  })

  it('throws when API response has no id', async () => {
    const post = vi.fn().mockResolvedValue({ status: 'queued' })
    const client = { post, webhookUrl: null } as unknown as HiggsfieldClient
    await expect(
      handler(client, { prompt: 'x', aspect: '16:9', duration_sec: 5 }),
    ).rejects.toThrow(/job id/)
  })

  it('falls back to default eta_seconds=60 when missing', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'job_x' })
    const client = { post, webhookUrl: null } as unknown as HiggsfieldClient
    const result = await handler(client, { prompt: 'x', aspect: '16:9', duration_sec: 5 })
    expect(result.eta_seconds).toBe(60)
  })
})

describe('higgsfield_generate_video · handler · webhook configured', () => {
  let post: ReturnType<typeof vi.fn>
  let client: HiggsfieldClient

  beforeEach(() => {
    post = vi
      .fn()
      .mockResolvedValueOnce({ id: 'job_abc', eta: 60 }) // /v1/videos
      .mockResolvedValueOnce({ ok: true }) // /v1/webhooks
    client = { post, webhookUrl: 'https://hooks.example.com/higgs' } as unknown as HiggsfieldClient
  })

  it('registers a webhook for the job', async () => {
    const result = await handler(client, { prompt: 'x', aspect: '16:9', duration_sec: 5 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]).toEqual([
      '/v1/webhooks',
      { jobId: 'job_abc', url: 'https://hooks.example.com/higgs', events: ['completed', 'failed'] },
    ])
    expect(result.webhook_registered).toBe(true)
  })

  it('marks webhook_registered=false when registration fails (best-effort)', async () => {
    const failingPost = vi
      .fn()
      .mockResolvedValueOnce({ id: 'job_abc' })
      .mockRejectedValueOnce(new Error('hook server unreachable'))
    const c = { post: failingPost, webhookUrl: 'https://hooks.example.com' } as unknown as HiggsfieldClient
    const result = await handler(c, { prompt: 'x', aspect: '16:9', duration_sec: 5 })
    expect(result.job_id).toBe('job_abc')
    expect(result.webhook_registered).toBe(false)
  })
})
