/**
 * Social content runner · invokes carousel-designer + video-editor agents
 * in PARALLEL, each producing its own output for the same upstream
 * context. Sits alongside `cascade-runner.ts` rather than inside it
 * because social content is a fundamentally different output (multi-
 * platform carousels + video composition specs) than the website cascade
 * (single-site brand → research → creative → web → content → editor).
 *
 * As of 2026-05-16 the runner produces TWO artifacts:
 *   - storyboard.json   · carousel-designer output (slide-by-slide)
 *   - video-specs.json  · video-editor output (scene-by-scene · TikTok/Reels)
 *
 * Both consume the SAME upstream parsed outputs (brand_book +
 * visual_direction + copy + brand_assets) · they run in parallel via
 * Promise.all so the cascade duration is max(carousel, video) not sum.
 *
 * Future-state · when delivery-coordinator (PR #29) is merged + workflow-
 * wired, this runner can be invoked AS a step inside the broader cascade
 * or independently.
 */

import type { CascadeBrandAssets } from './cascade-types'

// ── Public types ──────────────────────────────────────────────────────

export type SocialPlatform =
  | 'instagram-feed'
  | 'instagram-reel'
  | 'tiktok'
  | 'facebook-feed'
  | 'twitter-card'

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'instagram-feed',
  'instagram-reel',
  'tiktok',
  'facebook-feed',
  'twitter-card',
] as const

/**
 * Platforms that the video-editor agent will produce specs for. Carousel-
 * designer handles all SOCIAL_PLATFORMS · video-editor focuses on the
 * vertical-video platforms (TikTok + Reels) primarily. instagram-feed +
 * facebook-feed are typically static carousels · twitter-card is image-
 * only on most embeds · video-editor skips those by default.
 */
export const VIDEO_EDITOR_PLATFORMS: readonly SocialPlatform[] = [
  'tiktok',
  'instagram-reel',
] as const

function platformsForVideoEditor(
  requested: SocialPlatform[],
): SocialPlatform[] {
  const set = new Set(VIDEO_EDITOR_PLATFORMS)
  return requested.filter((p) => set.has(p))
}

/** Cascade context the agents read from. Typically the parsed outputs
 *  of brand-strategist, creative-director, content-creator from the
 *  website cascade · but can also be uploaded directly by a caller
 *  that already has those decisions made. */
export interface SocialCascadeContext {
  brand_book: Record<string, unknown>
  visual_direction: Record<string, unknown>
  copy: Record<string, unknown>
}

export interface SocialContentRequest {
  client_id: string
  client_slug: string
  client_name: string
  /** Plain-text cliente brief · what this cascade is for. */
  brief: string
  /** Optional · 1-3 sentences naming the campaign · defaults to
   *  "general brand awareness" inside the agent. */
  campaign_intent?: string
  /** Upstream agent outputs · pass parsed JSON (not stringified). */
  context: SocialCascadeContext
  /** Subset of SOCIAL_PLATFORMS · agent only outputs requested ones. */
  platforms_requested: SocialPlatform[]
  /** Brand assets uploaded by cliente · forwarded to the agent so any
   *  hex codes / logo references stay consistent. */
  brand_assets?: CascadeBrandAssets
  caller?: string
}

export interface SocialSlide {
  slide_index: number
  role: string
  eyebrow: string | null
  headline: string
  body: string | null
  cta: string | null
}

export interface SocialPlatformStoryboard {
  slide_count: number
  narrative_arc: string
  register?: string
  slides: SocialSlide[]
}

export interface SocialStoryboard {
  version: string
  client_slug: string
  campaign_intent: string
  platforms: Partial<Record<SocialPlatform, SocialPlatformStoryboard>>
  shared_lexicon?: string[]
  cta_verb_family?: string
  open_questions?: string[]
}

/**
 * Video-editor output · scene-by-scene composition specs for vertical
 * video platforms. Mirrors the carousel-designer storyboard shape but
 * with time-based scenes instead of static slides.
 */
export interface SocialVideoScene {
  scene_index: number
  duration_seconds: number
  role: string
  motion_pattern: string
  primary_subject: string
  transition_in: string
  transition_out: string
  captions: Array<{ text: string; start_s: number; end_s: number; style?: string }>
  music_cue?: string
  ffmpeg_equivalent?: {
    input_assets?: string[]
    filter_complex_summary?: string
    duration?: string
  }
  veo3_prompt?: string
}

export interface SocialVideoSpecs {
  version: string
  client_slug: string
  platforms: SocialPlatform[]
  scenes: SocialVideoScene[]
  total_duration_seconds: number
  aspect_ratio: string
  platform_constraints?: Record<string, Record<string, unknown>>
  open_questions?: string[]
}

export interface SocialContentResult {
  ok: boolean
  client_id: string
  client_slug: string
  platforms_requested: SocialPlatform[]
  /** Platforms produced by carousel-designer (slide storyboards). */
  platforms_produced: SocialPlatform[]
  /** Platforms produced by video-editor (vertical-video subset). */
  video_platforms_produced: SocialPlatform[]
  storyboard: SocialStoryboard | null
  video_specs: SocialVideoSpecs | null
  /** Raw response from each agent · always captured for audit. */
  carousel_raw_response: string
  video_raw_response: string
  carousel_cost_usd: number
  video_cost_usd: number
  /** Combined cost across both parallel agents. */
  cost_usd: number
  /** Max duration across both parallel agents (Promise.all). */
  duration_ms: number
  carousel_duration_ms: number
  video_duration_ms: number
  carousel_model: string | null
  video_model: string | null
  carousel_session_id: string | null
  video_session_id: string | null
  /** Path the storyboard was persisted to in Supabase Storage (if any).
   *  Caller decides whether to actually write it · runner only returns
   *  the suggested path. */
  storage_path: string
  video_storage_path: string
  /** Set when carousel-designer failed (string error from agent run). */
  carousel_error?: string
  /** Set when video-editor failed (string error from agent run). */
  video_error?: string
  /** Combined human-readable summary of partial-failure state · undefined
   *  when both succeeded. */
  error?: string
}

export interface SocialContentRunnerDeps {
  baseUrl: string
  internalApiKey: string
  fetchImpl?: typeof fetch
}

// ── Helpers ───────────────────────────────────────────────────────────

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Build the task prompt sent to `/api/agents/run` for the
 * carousel-designer agent. Mirrors the cascade-runner's `buildTask`
 * pattern · embeds upstream parsed outputs as JSON context blocks.
 */
export function buildCarouselDesignerTask(req: SocialContentRequest): string {
  const cliente = `Cliente: ${req.client_name} (slug=${req.client_slug}, id=${req.client_id})`
  const brief = `Cliente brief (plain text):\n${req.brief}`
  const intent = req.campaign_intent
    ? `Campaign intent · ${req.campaign_intent}`
    : 'Campaign intent · general brand awareness (default · cliente did not specify)'
  const platforms = `Platforms requested: ${req.platforms_requested.join(', ')}`
  const brandAssets = req.brand_assets
    ? `Brand assets uploaded by cliente:\n${JSON.stringify(req.brand_assets)}`
    : '(no brand assets uploaded · use brand_book + visual_direction only)'

  return [
    cliente,
    brief,
    intent,
    platforms,
    brandAssets,
    contextBlock('brand_book', req.context.brand_book),
    contextBlock('visual_direction', req.context.visual_direction),
    contextBlock('copy', req.context.copy),
    'Task: produce slide-by-slide storyboards per requested platform. Return strict JSON per your output contract (version, client_slug, campaign_intent, platforms{...}, shared_lexicon, cta_verb_family, open_questions). NO prose outside the JSON. Only output platforms in `platforms_requested` · do not over-deliver.',
  ].join('\n\n')
}

/**
 * Build the task prompt sent to `/api/agents/run` for the
 * video-editor agent. Same upstream context as carousel-designer plus
 * vertical-video-platform filter.
 */
export function buildVideoEditorTask(req: SocialContentRequest): string {
  const cliente = `Cliente: ${req.client_name} (slug=${req.client_slug}, id=${req.client_id})`
  const brief = `Cliente brief (plain text):\n${req.brief}`
  const intent = req.campaign_intent
    ? `Campaign intent · ${req.campaign_intent}`
    : 'Campaign intent · general brand awareness (default · cliente did not specify)'
  const videoPlatforms = platformsForVideoEditor(req.platforms_requested)
  const platforms = `Vertical-video platforms requested: ${videoPlatforms.join(', ')} (out of ${req.platforms_requested.join(', ')})`
  const brandAssets = req.brand_assets
    ? `Brand assets uploaded by cliente:\n${JSON.stringify(req.brand_assets)}`
    : '(no brand assets uploaded · use brand_book + visual_direction only)'

  return [
    cliente,
    brief,
    intent,
    platforms,
    brandAssets,
    contextBlock('brand_book', req.context.brand_book),
    contextBlock('visual_direction', req.context.visual_direction),
    contextBlock('copy', req.context.copy),
    'Task: produce scene-by-scene VIDEO composition specs (NOT generated video · only specs · the host renders downstream). Vertical 9:16 · TikTok/Reels. Return strict JSON per your motion-designer-social-cascade output contract: version, client_slug, platforms, scenes (with scene_index, duration_seconds, role, motion_pattern, primary_subject, transition_in/out, captions, music_cue, ffmpeg_equivalent, veo3_prompt), total_duration_seconds, aspect_ratio, platform_constraints, open_questions. NO prose outside the JSON. Mirror the carousel narrative_arc when possible so the host can reuse assets across both deliverables.',
  ].join('\n\n')
}

function contextBlock(label: string, data: Record<string, unknown> | null | undefined): string {
  if (!data) return `[no ${label} context provided]`
  return `[${label} agent output]\n${JSON.stringify(data, null, 2)}`
}

/**
 * Parse the agent's raw text response into a SocialStoryboard.
 * Tolerant of `\`\`\`json` fences · uses the same first-{ to last-}
 * scan strategy as cascade-runner's parseAgentJson.
 */
export function parseStoryboard(raw: string): SocialStoryboard | null {
  if (!raw) return null
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end < start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.platforms || typeof parsed.platforms !== 'object') return null
    return parsed as unknown as SocialStoryboard
  } catch {
    return null
  }
}

/**
 * Parse the video-editor agent's raw response into a SocialVideoSpecs.
 * Validates the `scenes` array presence (the discriminator between
 * carousel and video output shapes).
 */
export function parseVideoSpecs(raw: string): SocialVideoSpecs | null {
  if (!raw) return null
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end < start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.scenes)) return null
    return parsed as unknown as SocialVideoSpecs
  } catch {
    return null
  }
}

// ── Single-agent invocation helpers ──────────────────────────────────

interface AgentRunResponse {
  success?: boolean
  response?: string
  cost_usd?: number
  model?: string
  session_id?: string | null
  error?: string
}

async function invokeAgent(
  agentSlug: string,
  task: string,
  request: SocialContentRequest,
  deps: SocialContentRunnerDeps,
  contextExtra: Record<string, unknown> = {},
): Promise<{ data: AgentRunResponse; httpStatus: number; httpOk: boolean }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const body = {
    agent: agentSlug,
    task,
    client_id: request.client_id,
    caller: request.caller ?? 'social-content-runner',
    context: {
      brief: request.brief,
      campaign_intent: request.campaign_intent ?? 'general brand awareness',
      platforms_requested: request.platforms_requested,
      brand_assets: request.brand_assets ?? null,
      cascade_context: request.context,
      ...contextExtra,
    },
  }
  const res = await fetchImpl(`${deps.baseUrl}/api/agents/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': deps.internalApiKey,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as AgentRunResponse
  return { data, httpStatus: res.status, httpOk: res.ok }
}

/**
 * Drive carousel-designer + video-editor in PARALLEL via Promise.all.
 * Each agent has its own failure mode · runner returns partial-success
 * if one fails (`carousel_error` / `video_error` set per-agent) so the
 * host can still ship whichever artifact landed.
 *
 * `ok` is true only when carousel succeeded AND at least one vertical-
 * video platform was requested AND video-editor also succeeded. If the
 * caller did not request any vertical-video platform (no `tiktok` and
 * no `instagram-reel`), video-editor is skipped entirely and `ok`
 * tracks carousel alone.
 */
export async function runSocialContent(
  request: SocialContentRequest,
  deps: SocialContentRunnerDeps,
): Promise<SocialContentResult> {
  const startedAt = Date.now()
  const date = todayUtcDate()
  const storage_path = `client-websites/${request.client_slug}/social/${date}/storyboard.json`
  const video_storage_path = `client-websites/${request.client_slug}/social/${date}/video-specs.json`

  const wantsVideo = platformsForVideoEditor(request.platforms_requested).length > 0

  // ── Build promises · Promise.all keeps duration = max(a, b) ──────
  const carouselP = invokeAgent(
    'carousel-designer',
    buildCarouselDesignerTask(request),
    request,
    deps,
  ).then((r) => ({ ...r, _startedAt: Date.now() }))

  const videoP = wantsVideo
    ? invokeAgent(
        'video-editor',
        buildVideoEditorTask(request),
        request,
        deps,
        {
          video_platforms_requested: platformsForVideoEditor(
            request.platforms_requested,
          ),
        },
      ).then((r) => ({ ...r, _startedAt: Date.now() }))
    : Promise.resolve(null)

  let carouselR: Awaited<typeof carouselP>
  let videoR: Awaited<typeof videoP> = null
  let carousel_error: string | undefined
  let video_error: string | undefined
  let carouselStarted = startedAt
  let videoStarted = startedAt

  try {
    carouselR = await carouselP
  } catch (err) {
    carousel_error = err instanceof Error ? err.message : String(err)
    carouselR = {
      data: { success: false, response: '', cost_usd: 0, model: undefined, session_id: null },
      httpStatus: 0,
      httpOk: false,
      _startedAt: Date.now(),
    } as unknown as Awaited<typeof carouselP>
  }
  if (wantsVideo) {
    try {
      videoR = await videoP
      videoStarted = videoR?._startedAt ?? startedAt
    } catch (err) {
      video_error = err instanceof Error ? err.message : String(err)
      videoR = {
        data: { success: false, response: '', cost_usd: 0, model: undefined, session_id: null },
        httpStatus: 0,
        httpOk: false,
        _startedAt: Date.now(),
      } as unknown as Awaited<typeof videoP>
    }
  }
  void carouselStarted
  void videoStarted

  const carouselDuration = Date.now() - startedAt
  const videoDuration = wantsVideo ? Date.now() - startedAt : 0
  const duration_ms = Math.max(carouselDuration, videoDuration)

  // Carousel post-processing
  const carouselData = carouselR.data
  if (!carousel_error && (!carouselR.httpOk || carouselData.success === false)) {
    carousel_error = carouselData.error ?? `HTTP ${carouselR.httpStatus}`
  }
  const carousel_raw_response = carouselData.response ?? ''
  const storyboard = carousel_error ? null : parseStoryboard(carousel_raw_response)
  const platforms_produced = storyboard
    ? (Object.keys(storyboard.platforms) as SocialPlatform[])
    : []

  // Video post-processing
  let video_raw_response = ''
  let video_specs: SocialVideoSpecs | null = null
  let video_platforms_produced: SocialPlatform[] = []
  let videoCost = 0
  let videoModel: string | null = null
  let videoSession: string | null = null
  if (wantsVideo && videoR) {
    const videoData = videoR.data
    if (!video_error && (!videoR.httpOk || videoData.success === false)) {
      video_error = videoData.error ?? `HTTP ${videoR.httpStatus}`
    }
    video_raw_response = videoData.response ?? ''
    video_specs = video_error ? null : parseVideoSpecs(video_raw_response)
    video_platforms_produced =
      video_specs && Array.isArray(video_specs.platforms)
        ? video_specs.platforms.filter((p): p is SocialPlatform =>
            (SOCIAL_PLATFORMS as readonly string[]).includes(p),
          )
        : []
    videoCost = videoData.cost_usd ?? 0
    videoModel = videoData.model ?? null
    videoSession = videoData.session_id ?? null
  }

  const carouselCost = carouselData.cost_usd ?? 0
  const cost_usd = carouselCost + videoCost
  const carouselOk = !carousel_error && storyboard !== null && platforms_produced.length > 0
  const videoOk = !wantsVideo || (!video_error && video_specs !== null && video_platforms_produced.length > 0)
  const ok = carouselOk && videoOk

  let combinedError: string | undefined
  if (!ok) {
    const parts = []
    if (carousel_error) parts.push(`carousel: ${carousel_error}`)
    if (video_error) parts.push(`video: ${video_error}`)
    combinedError = parts.length > 0 ? parts.join(' · ') : 'partial output (one or both agents returned malformed JSON)'
  }

  return {
    ok,
    client_id: request.client_id,
    client_slug: request.client_slug,
    platforms_requested: request.platforms_requested,
    platforms_produced,
    video_platforms_produced,
    storyboard,
    video_specs,
    carousel_raw_response,
    video_raw_response,
    carousel_cost_usd: carouselCost,
    video_cost_usd: videoCost,
    cost_usd,
    duration_ms,
    carousel_duration_ms: carouselDuration,
    video_duration_ms: videoDuration,
    carousel_model: carouselData.model ?? null,
    video_model: videoModel,
    carousel_session_id: carouselData.session_id ?? null,
    video_session_id: videoSession,
    storage_path,
    video_storage_path,
    carousel_error,
    video_error,
    error: combinedError,
  }
}
