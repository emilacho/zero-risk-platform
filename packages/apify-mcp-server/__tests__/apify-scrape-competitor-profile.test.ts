/**
 * Tests · apify_scrape_competitor_profile (2026-07-19).
 * Mockea el ApifyClient en el boundary (spy en .runActorAndCollect) · no mockea fetch.
 * Verifica: normalización IG/web · procedencia apify_scrape SOLO con scrape real (§148) ·
 * deep_scan_data · resolución de actor · run vacío · error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { name, argsSchema, handler } from '../src/tools/apify-scrape-competitor-profile.js'
import type { ApifyClient } from '../src/client.js'

const clientCollect = (impl: () => Promise<{ runId: string; datasetId: string | null; items: unknown[] }>) =>
  ({ runActorAndCollect: vi.fn(impl) } as unknown as ApifyClient)

afterEach(() => {
  delete process.env.APIFY_IG_PROFILE_ACTOR
  delete process.env.APIFY_WEB_ACTOR
})

describe('apify_scrape_competitor_profile · args', () => {
  it('name requerido · handle O website requerido', () => {
    expect(name).toBe('apify_scrape_competitor_profile')
    expect(() => argsSchema.parse({ name: 'X' })).toThrow() // sin handle ni website
    expect(argsSchema.parse({ name: 'X', handle: 'y' }).name).toBe('X')
    expect(argsSchema.parse({ name: 'X', website: 'https://z.com' }).website).toBe('https://z.com')
  })
})

describe('scrape IG · normalización + procedencia', () => {
  it('item real IG → competitor con source apify_scrape + deep_scan_data + handles', async () => {
    const client = clientCollect(() =>
      Promise.resolve({
        runId: 'run_1',
        datasetId: 'ds_1',
        items: [
          {
            username: 'surferslodge',
            fullName: 'Surfers Lodge Peniche',
            biography: 'Boutique surf hotel in Peniche',
            followersCount: 41200,
            followsCount: 310,
            postsCount: 1800,
            verified: true,
            externalUrl: 'https://surferslodge.com',
          },
        ],
      }),
    )
    const r = await handler(client, { name: 'Surfers Lodge', handle: '@surferslodge' })
    expect(r.status).toBe('scraped')
    expect(r.ok).toBe(true)
    expect(r.platform).toBe('instagram')
    expect(r.run_id).toBe('run_1')
    expect(r.dataset_id).toBe('ds_1')
    expect(r.competitor).not.toBeNull()
    const c = r.competitor!
    expect(c.source).toBe('apify_scrape') // ← procedencia REAL
    expect(c.trust_level).toBe('untrusted')
    expect(c.handles).toEqual({ instagram: 'surferslodge' })
    expect(c.positioning).toContain('Boutique surf hotel')
    expect(c.deep_scan_data).toMatchObject({
      followers_count: 41200,
      following_count: 310,
      posts_count: 1800,
      is_verified: true,
      full_name: 'Surfers Lodge Peniche',
      external_url: 'https://surferslodge.com',
      run_id: 'run_1',
      platform: 'instagram',
    })
    expect(r.raw_item_ref).toEqual({ dataset_id: 'ds_1', item_index: 0 })
  })

  it('normaliza handle desde URL de perfil IG', async () => {
    const collect = vi.fn(() => Promise.resolve({ runId: 'r', datasetId: 'd', items: [{ username: 'mocean' }] }))
    const client = { runActorAndCollect: collect } as unknown as ApifyClient
    await handler(client, { name: 'Mocean', handle: 'https://instagram.com/mocean/' })
    // input del actor lleva el username limpio
    expect(collect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ usernames: ['mocean'] }),
      expect.any(Number),
    )
  })
})

describe('scrape web · plataforma inferida', () => {
  it('sin handle → platform web · text_excerpt + positioning del contenido', async () => {
    const client = clientCollect(() =>
      Promise.resolve({
        runId: 'run_w',
        datasetId: 'ds_w',
        items: [{ title: 'Baleal Surf', text: 'We run surf camps on Baleal island '.repeat(30), url: 'https://baleal.com' }],
      }),
    )
    const r = await handler(client, { name: 'Baleal', website: 'https://baleal.com' })
    expect(r.platform).toBe('web')
    expect(r.status).toBe('scraped')
    const c = r.competitor!
    expect(c.source).toBe('apify_scrape')
    expect(c.deep_scan_data.title).toBe('Baleal Surf')
    expect(String(c.deep_scan_data.text_excerpt).length).toBeGreaterThan(0)
    expect(c.positioning).toContain('surf camps')
  })
})

describe('§148 · sin scrape real NO se emite apify_scrape', () => {
  it('run vacío (0 items) → status empty · competitor null · sin source', async () => {
    const client = clientCollect(() => Promise.resolve({ runId: 'run_e', datasetId: 'ds_e', items: [] }))
    const r = await handler(client, { name: 'Ghost', handle: 'ghost' })
    expect(r.status).toBe('empty')
    expect(r.competitor).toBeNull() // NO hay tag apify_scrape sin scrape
    expect(r.run_id).toBe('run_e')
  })

  it('actor falla → status error · competitor null · error propagado', async () => {
    const client = clientCollect(() => Promise.reject(new Error('Apify actor run_x FAILED')))
    const r = await handler(client, { name: 'Boom', handle: 'boom' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('error')
    expect(r.competitor).toBeNull()
    expect(r.error).toContain('FAILED')
  })
})

describe('resolución de actor', () => {
  it('input actor_id gana sobre env y default', async () => {
    process.env.APIFY_IG_PROFILE_ACTOR = 'env/ig-actor'
    const collect = vi.fn(() => Promise.resolve({ runId: 'r', datasetId: 'd', items: [{ username: 'x' }] }))
    const client = { runActorAndCollect: collect } as unknown as ApifyClient
    const r = await handler(client, { name: 'X', handle: 'x', actor_id: 'custom/actor' })
    expect(r.actor_id).toBe('custom/actor')
    expect(collect).toHaveBeenCalledWith('custom/actor', expect.anything(), expect.any(Number))
  })

  it('env override para IG cuando no hay input actor_id', async () => {
    process.env.APIFY_IG_PROFILE_ACTOR = 'env/ig-actor'
    const client = clientCollect(() => Promise.resolve({ runId: 'r', datasetId: 'd', items: [{ username: 'x' }] }))
    const r = await handler(client, { name: 'X', handle: 'x' })
    expect(r.actor_id).toBe('env/ig-actor')
  })

  it('default IG cuando no hay override', async () => {
    const client = clientCollect(() => Promise.resolve({ runId: 'r', datasetId: 'd', items: [{ username: 'x' }] }))
    const r = await handler(client, { name: 'X', handle: 'x' })
    expect(r.actor_id).toBe('apify/instagram-profile-scraper')
  })
})
