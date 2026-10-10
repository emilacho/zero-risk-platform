/**
 * Carousel-engine public types.
 *
 * The render pipeline is:
 *   BrandTokens + SlideContent + Template → satori → SVG → resvg → PNG buffer
 *
 * The API route layer adds: PNG buffer → Supabase Storage → slide_url[].
 */

import type { ReactElement } from 'react'

// ── Platform ───────────────────────────────────────────────────────────
export type CarouselPlatform =
  | 'instagram-feed'   // 1080 x 1350 (4:5 portrait)
  | 'instagram-reel'   // 1080 x 1920 (9:16 portrait)
  | 'tiktok'           // 1080 x 1920 (9:16 portrait)
  | 'facebook-feed'    // 1200 x 630  (1.91:1 landscape)
  | 'twitter-card'     // 1200 x 675  (16:9 landscape)

export interface PlatformSpec {
  platform: CarouselPlatform
  width: number
  height: number
}

export const PLATFORM_SPECS: Record<CarouselPlatform, PlatformSpec> = {
  'instagram-feed': { platform: 'instagram-feed', width: 1080, height: 1350 },
  'instagram-reel': { platform: 'instagram-reel', width: 1080, height: 1920 },
  'tiktok':         { platform: 'tiktok',         width: 1080, height: 1920 },
  'facebook-feed':  { platform: 'facebook-feed',  width: 1200, height: 630 },
  'twitter-card':   { platform: 'twitter-card',   width: 1200, height: 675 },
}

// ── Brand tokens (per template inject) ─────────────────────────────────
export interface BrandTokens {
  /** Optional public URL · rendered top-left or as a centered logo per template. */
  logo_url?: string | null
  /** Color palette · `primary` is the dominant background or accent. */
  colors: {
    primary: string        // e.g. '#0a3d62'
    secondary?: string     // e.g. '#3c6382'
    accent?: string        // e.g. '#fa8231'
    text_on_primary?: string  // override default white-on-primary
    text_on_surface?: string  // body text color on surface bg
    surface?: string       // light surface for content cards
  }
  /** Font stacks · satori needs the actual TTF/OTF data, fonts/loader handles fetch. */
  fonts: {
    /** Family name to render with · must match a loaded font name (e.g. "Inter"). */
    family: string
    /** Optional secondary family for headlines. */
    headline_family?: string
  }
  /** Brand name shown in the footer/handle (e.g., "@zerorisk.ec"). */
  brand_handle?: string
}

// ── Slide content (per slide inject) ───────────────────────────────────
export interface SlideContent {
  headline: string
  /** Optional supporting body · markdown-light · only \n line breaks honored. */
  body?: string
  /** CTA shown bottom-aligned · skip for non-CTA slides. */
  cta?: string
  /** Optional eyebrow above headline (e.g., "PARTE 1", "CASO 02"). */
  eyebrow?: string
  /**
   * Optional background photo (https URL or `data:image/...` URI). Drawn full-bleed behind the
   * content with a dark contrast layer. Absent/null = the slide renders exactly as before.
   */
  background_image_url?: string | null
  /**
   * Footer cue text ("desliza →" and similar; only templates that have one: instagram-feed, instagram-reel).
   * `undefined` = the template's default text · `null` or '' = no footer cue · string = that text.
   */
  pie?: string | null
  /** true = do not draw the "n / N" slide indicator (a single story/status is not a carousel). Default false. */
  ocultar_indicador?: boolean
}

// ── Template input ─────────────────────────────────────────────────────
export interface TemplateProps {
  brand: BrandTokens
  content: SlideContent
  slide_index: number   // 1-based · "1 of 5"
  total_slides: number
}

// ── A template is a function returning a JSX element ───────────────────
export type TemplateRenderer = (props: TemplateProps) => ReactElement

// ── API contract · POST /api/carousel/generate ─────────────────────────
export interface CarouselGenerateRequest {
  /** Slug of the client folder · used in storage path (`client-websites/{slug}/...`). */
  client_slug: string
  /** Target platform · drives canvas size + template selection. */
  platform: CarouselPlatform
  /** Brand tokens · usually fetched from Client Brain by the caller. */
  brand: BrandTokens
  /** N slides · render order = array order. */
  slides: SlideContent[]
  /** Optional · use ISO date for path partition · defaults to today UTC. */
  date?: string
  /** Optional · use as carousel_id (idempotent) · defaults to derived hash. */
  carousel_id?: string
  /**
   * Optional · sub-path under `{slug}/carousels/{date}/` (e.g. `oficina/{encargo_id}`). Two carousels of the
   * same client on the same day with different `subcarpeta` never overwrite each other. Absent = today's path.
   */
  subcarpeta?: string
}

export interface CarouselGenerateResponse {
  carousel_id: string
  platform: CarouselPlatform
  width: number
  height: number
  /** One URL per slide · order matches input. */
  slide_urls: string[]
  /** First slide URL · convenience pointer. */
  thumbnail_url: string
  /** Per-slide render timing for cost tracking. */
  timings_ms: number[]
  /** Brand font families actually drawn (Inter always included). */
  fonts_usadas: string[]
  /** Brand font families that could NOT be loaded and fell back to Inter (never silent). */
  fonts_faltantes: string[]
  /** Echo of the sub-path used, when one was sent. */
  subcarpeta?: string
}

// ── Render result (engine-level · pre-upload) ──────────────────────────
export interface RenderedSlide {
  platform: CarouselPlatform
  slide_index: number
  total_slides: number
  width: number
  height: number
  png: Buffer
  durationMs: number
  fonts_usadas: string[]
  fonts_faltantes: string[]
}
