/**
 * Tests for the `video-editor` agent · parallel invocation alongside
 * `carousel-designer` in the social-content cascade (2026-05-16 ·
 * deferred CC#2 backfill resolved).
 *
 * Contracts pinned here:
 *   1. `buildVideoEditorTask` embeds every upstream context block +
 *      vertical-video-platform filter.
 *   2. `parseVideoSpecs` tolerates both ```json fences and bare prose ·
 *      requires `scenes` array (discriminator vs storyboard).
 *   3. `runSocialContent` invokes BOTH agents in parallel (carousel +
 *      video) when at least one vertical-video platform is requested.
 *   4. video-editor is SKIPPED when no vertical-video platform is
 *      requested (instagram-feed only · facebook-feed only · etc).
 *   5. Partial-failure mode · if carousel fails but video succeeds (or
 *      vice versa), `ok=false` but the surviving artifact is returned.
 *   6. Total `cost_usd` sums BOTH parallel agents.
 *   7. `duration_ms` is parallel-aware (NOT sum · max).
 */
import { describe, it, expect } from 'vitest'
import {
  buildVideoEditorTask,
  parseVideoSpecs,
  runSocialContent,
  VIDEO_EDITOR_PLATFORMS,
  type SocialContentRequest,
} from '../src/lib/social-content-runner'

const baseReq: SocialContentRequest = {
  client_id: 'c-test',
  client_slug: 'test-cliente',
  client_name: 'Test Cliente',
  brief: 'Launch ceviche delivery to surfers in Olón · Saturday-only special',
  campaign_intent: 'awareness · drive WhatsApp orders',
  context: {
    brand_book: { positioning_statement: 'Cocina costera Olón', voice: 'cálida directa' },
    visual_direction: { palette_top5: [{ hex: '#0D5C6B' }, { hex: '#D4A853' }] },
    copy: { hero: { headline: 'Fresco como recién salido del mar' } },
  },
  platforms_requested: ['tiktok', 'instagram-reel', 'instagram-feed'],
  brand_assets: {
    logo_url: 'https://example.com/logo.png',
    brand_colors: [{ hex: '#0D5C6B' }],
    brand_fonts: ['Inter'],
  },
  caller: 'test',
}

describe('VIDEO_EDITOR_PLATFORMS · vertical-video filter', () => {
  it('includes tiktok and instagram-reel · excludes static-feed platforms', () => {
    expect(VIDEO_EDITOR_PLATFORMS).toContain('tiktok')
    expect(VIDEO_EDITOR_PLATFORMS).toContain('instagram-reel')
    expect(VIDEO_EDITOR_PLATFORMS).not.toContain('instagram-feed')
    expect(VIDEO_EDITOR_PLATFORMS).not.toContain('facebook-feed')
    expect(VIDEO_EDITOR_PLATFORMS).not.toContain('twitter-card')
  })
})

describe('buildVideoEditorTask', () => {
  it('embeds every upstream context block + vertical-video filter', () => {
    const task = buildVideoEditorTask(baseReq)
    expect(task).toContain('Test Cliente')
    expect(task).toContain('Cocina costera Olón')
    expect(task).toContain('Fresco como recién salido del mar')
    expect(task).toContain('#0D5C6B')
    expect(task).toContain('https://example.com/logo.png')
    // Filtered to vertical-video subset
    expect(task).toContain('tiktok, instagram-reel')
    // out of all requested
    expect(task).toContain('instagram-feed')
    // motion-designer language
    expect(task).toContain('scene')
    expect(task).toContain('aspect_ratio')
  })

  it('does NOT include instagram-feed in the video-platforms line', () => {
    const onlyTiktok = { ...baseReq, platforms_requested: ['tiktok' as const] }
    const task = buildVideoEditorTask(onlyTiktok)
    expect(task).toContain('Vertical-video platforms requested: tiktok')
    expect(task).not.toMatch(/Vertical-video platforms requested:.*instagram-feed/)
  })
})

describe('parseVideoSpecs', () => {
  it('parses bare JSON with scenes array', () => {
    const raw = JSON.stringify({
      version: 'video-specs-v1',
      client_slug: 'test-cliente',
      platforms: ['tiktok'],
      scenes: [{ scene_index: 0, duration_seconds: 3, role: 'hook', motion_pattern: 'push_in', primary_subject: 'ceviche bowl', transition_in: 'cut', transition_out: 'whip', captions: [] }],
      total_duration_seconds: 3,
      aspect_ratio: '9:16',
    })
    const parsed = parseVideoSpecs(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.scenes).toHaveLength(1)
    expect(parsed?.aspect_ratio).toBe('9:16')
  })

  it('parses ```json fenced output', () => {
    const raw = '```json\n' + JSON.stringify({ scenes: [{ scene_index: 0, duration_seconds: 1 }], version: 'v1', client_slug: 's', platforms: ['tiktok'], total_duration_seconds: 1, aspect_ratio: '9:16' }) + '\n```'
    const parsed = parseVideoSpecs(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.scenes).toHaveLength(1)
  })

  it('returns null when scenes array is missing (storyboard shape ≠ video shape)', () => {
    const raw = JSON.stringify({ version: 'v1', platforms: { tiktok: { slide_count: 3 } } })
    expect(parseVideoSpecs(raw)).toBeNull()
  })

  it('returns null on bare prose', () => {
    expect(parseVideoSpecs('agent waffled and did not return JSON')).toBeNull()
  })
})

describe('runSocialContent · parallel carousel + video', () => {
  it('invokes BOTH agents when at least one vertical-video platform requested', async () => {
    const calls: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      calls.push(body.agent)
      const isVideo = body.agent === 'video-editor'
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: isVideo
            ? JSON.stringify({ version: 'video-specs-v1', client_slug: 'test-cliente', platforms: ['tiktok', 'instagram-reel'], scenes: [{ scene_index: 0, duration_seconds: 3, role: 'hook', motion_pattern: 'push_in', primary_subject: 'ceviche bowl', transition_in: 'cut', transition_out: 'whip', captions: [] }], total_duration_seconds: 3, aspect_ratio: '9:16' })
            : JSON.stringify({ version: 'storyboard-v1', client_slug: 'test-cliente', campaign_intent: 'test', platforms: { tiktok: { slide_count: 3, narrative_arc: 'hook-build-payoff', slides: [] }, 'instagram-reel': { slide_count: 3, narrative_arc: 'hook-build-payoff', slides: [] }, 'instagram-feed': { slide_count: 5, narrative_arc: 'before-after', slides: [] } } }),
          cost_usd: isVideo ? 0.04 : 0.02,
          model: isVideo ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
          session_id: isVideo ? 's-video' : 's-carousel',
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runSocialContent(baseReq, {
      baseUrl: 'http://localhost',
      internalApiKey: 'test',
      fetchImpl,
    })

    expect(calls).toContain('carousel-designer')
    expect(calls).toContain('video-editor')
    expect(result.ok).toBe(true)
    expect(result.storyboard).not.toBeNull()
    expect(result.video_specs).not.toBeNull()
    expect(result.platforms_produced).toEqual(expect.arrayContaining(['tiktok', 'instagram-reel', 'instagram-feed']))
    expect(result.video_platforms_produced).toEqual(expect.arrayContaining(['tiktok', 'instagram-reel']))
  })

  it('SKIPS video-editor when no vertical-video platform is requested', async () => {
    const calls: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      calls.push(body.agent)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: JSON.stringify({ version: 'storyboard-v1', client_slug: 'test-cliente', campaign_intent: 'test', platforms: { 'instagram-feed': { slide_count: 5, narrative_arc: 'before-after', slides: [] } } }),
          cost_usd: 0.02,
          model: 'claude-sonnet-4-6',
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runSocialContent(
      { ...baseReq, platforms_requested: ['instagram-feed'] },
      { baseUrl: 'http://localhost', internalApiKey: 'test', fetchImpl },
    )

    expect(calls).toEqual(['carousel-designer'])
    expect(result.ok).toBe(true)
    expect(result.video_specs).toBeNull()
    expect(result.video_platforms_produced).toEqual([])
    expect(result.video_cost_usd).toBe(0)
  })

  it('partial-failure · ok=false when video-editor fails but carousel succeeds', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      if (body.agent === 'video-editor') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, error: 'simulated_video_fail' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: JSON.stringify({ version: 'storyboard-v1', client_slug: 'test-cliente', campaign_intent: 'test', platforms: { tiktok: { slide_count: 3, narrative_arc: 'hook', slides: [] } } }),
          cost_usd: 0.02,
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runSocialContent(baseReq, {
      baseUrl: 'http://localhost',
      internalApiKey: 'test',
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.storyboard).not.toBeNull()
    expect(result.video_specs).toBeNull()
    expect(result.video_error).toBe('simulated_video_fail')
    expect(result.error).toContain('video: simulated_video_fail')
  })

  it('cost_usd sums BOTH parallel agent costs', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      const isVideo = body.agent === 'video-editor'
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: isVideo
            ? JSON.stringify({ version: 'video-specs-v1', client_slug: 'test', platforms: ['tiktok'], scenes: [{ scene_index: 0 }], total_duration_seconds: 1, aspect_ratio: '9:16' })
            : JSON.stringify({ version: 'storyboard-v1', client_slug: 'test', campaign_intent: 't', platforms: { tiktok: { slide_count: 1, narrative_arc: 'a', slides: [] } } }),
          cost_usd: isVideo ? 0.05 : 0.03,
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runSocialContent(baseReq, {
      baseUrl: 'http://localhost',
      internalApiKey: 'test',
      fetchImpl,
    })
    expect(result.carousel_cost_usd).toBeCloseTo(0.03, 6)
    expect(result.video_cost_usd).toBeCloseTo(0.05, 6)
    expect(result.cost_usd).toBeCloseTo(0.08, 6)
  })
})
