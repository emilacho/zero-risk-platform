/**
 * Social content runner · invokes the carousel-designer agent and
 * (optionally) chains into the carousel-engine renderer.
 *
 * Sits alongside `cascade-runner.ts` rather than inside it because
 * social content is a fundamentally different output (multi-platform
 * carousel storyboard) than the website cascade (single-site brand →
 * research → creative → web → content → editor). Future-state: when
 * delivery-coordinator (PR #29) is merged + workflow-wired, this
 * runner can be invoked AS a step inside the broader cascade or
 * independently.
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

/** Cascade context the agent reads from. Typically the parsed outputs
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

export interface SocialContentResult {
  ok: boolean
  client_id: string
  client_slug: string
  platforms_requested: SocialPlatform[]
  platforms_produced: SocialPlatform[]
  storyboard: SocialStoryboard | null
  /** Raw response from the agent · always captured for audit. */
  raw_response: string
  cost_usd: number
  duration_ms: number
  model: string | null
  session_id: string | null
  /** Path the storyboard was persisted to in Supabase Storage (if any).
   *  Caller decides whether to actually write it · runner only returns
   *  the suggested path. */
  storage_path: string
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
 * Drive the carousel-designer agent end-to-end. Single agent call (no
 * chain) · returns the parsed storyboard ready for downstream rendering
 * or human review.
 */
export async function runSocialContent(
  request: SocialContentRequest,
  deps: SocialContentRunnerDeps,
): Promise<SocialContentResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const startedAt = Date.now()
  const date = todayUtcDate()
  const storage_path = `client-websites/${request.client_slug}/social/${date}/storyboard.json`

  const body = {
    agent: 'carousel-designer',
    task: buildCarouselDesignerTask(request),
    client_id: request.client_id,
    caller: request.caller ?? 'social-content-runner',
    context: {
      brief: request.brief,
      campaign_intent: request.campaign_intent ?? 'general brand awareness',
      platforms_requested: request.platforms_requested,
      brand_assets: request.brand_assets ?? null,
      cascade_context: request.context,
    },
  }

  try {
    const res = await fetchImpl(`${deps.baseUrl}/api/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': deps.internalApiKey,
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      success?: boolean
      response?: string
      cost_usd?: number
      model?: string
      session_id?: string | null
      error?: string
    }
    const duration_ms = Date.now() - startedAt

    if (!res.ok || data.success === false) {
      return {
        ok: false,
        client_id: request.client_id,
        client_slug: request.client_slug,
        platforms_requested: request.platforms_requested,
        platforms_produced: [],
        storyboard: null,
        raw_response: data.response ?? '',
        cost_usd: data.cost_usd ?? 0,
        duration_ms,
        model: data.model ?? null,
        session_id: data.session_id ?? null,
        storage_path,
        error: data.error ?? `HTTP ${res.status}`,
      }
    }

    const raw = data.response ?? ''
    const storyboard = parseStoryboard(raw)
    const platforms_produced = storyboard
      ? (Object.keys(storyboard.platforms) as SocialPlatform[])
      : []

    return {
      ok: storyboard !== null && platforms_produced.length > 0,
      client_id: request.client_id,
      client_slug: request.client_slug,
      platforms_requested: request.platforms_requested,
      platforms_produced,
      storyboard,
      raw_response: raw,
      cost_usd: data.cost_usd ?? 0,
      duration_ms,
      model: data.model ?? null,
      session_id: data.session_id ?? null,
      storage_path,
    }
  } catch (err) {
    return {
      ok: false,
      client_id: request.client_id,
      client_slug: request.client_slug,
      platforms_requested: request.platforms_requested,
      platforms_produced: [],
      storyboard: null,
      raw_response: '',
      cost_usd: 0,
      duration_ms: Date.now() - startedAt,
      model: null,
      session_id: null,
      storage_path,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
