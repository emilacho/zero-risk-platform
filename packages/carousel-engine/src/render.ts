/**
 * Render pipeline · JSX template → SVG (satori) → PNG buffer (@resvg/resvg-js).
 *
 * Used both by the API route (`/api/carousel/generate`) and the smoke
 * script. Pure function · no Supabase / network side-effects beyond the
 * font CDN fetch (which is cached after first call).
 */

import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { InstagramFeed } from './templates/InstagramFeed'
import { InstagramReel } from './templates/InstagramReel'
import { TikTok } from './templates/TikTok'
import { FacebookFeed } from './templates/FacebookFeed'
import { TwitterCard } from './templates/TwitterCard'
import { loadDefaultFonts, type FontEntry } from './fonts'
import {
  PLATFORM_SPECS,
  type BrandTokens,
  type CarouselPlatform,
  type RenderedSlide,
  type SlideContent,
  type TemplateRenderer,
} from './types'

// ── Template registry ──────────────────────────────────────────────────
export const TEMPLATES: Record<CarouselPlatform, TemplateRenderer> = {
  'instagram-feed': InstagramFeed,
  'instagram-reel': InstagramReel,
  'tiktok':         TikTok,
  'facebook-feed':  FacebookFeed,
  'twitter-card':   TwitterCard,
}

export interface RenderOptions {
  /** Pre-loaded fonts · skip default Inter loader. Useful for tests. */
  fonts?: FontEntry[]
  /** Override the resvg fit · default fitTo width based on platform. */
  resvgFitTo?: { mode: 'width' | 'height' | 'zoom'; value: number }
}

/**
 * Render a single slide JSX → PNG buffer.
 *
 * Calling sequence (Vercel cold start cost ~600ms · warm ~80ms):
 *   1. ensure fonts loaded
 *   2. satori(<Template ... />)        → SVG string
 *   3. new Resvg(svg).render().asPng() → PNG buffer
 */
export async function renderSlide(args: {
  platform: CarouselPlatform
  brand: BrandTokens
  content: SlideContent
  slide_index: number
  total_slides: number
  options?: RenderOptions
}): Promise<RenderedSlide> {
  const { platform, brand, content, slide_index, total_slides, options = {} } = args
  const spec = PLATFORM_SPECS[platform]
  if (!spec) throw new Error(`Unknown platform: ${platform}`)
  const Template = TEMPLATES[platform]
  if (!Template) throw new Error(`No template registered for platform: ${platform}`)

  const t0 = Date.now()

  const fonts = options.fonts ?? (await loadDefaultFonts())

  const svg = await satori(
    Template({ brand, content, slide_index, total_slides }) as React.ReactElement,
    {
      width: spec.width,
      height: spec.height,
      fonts: fonts.map((f) => ({
        name: f.name,
        data: f.data,
        weight: f.weight,
        style: f.style,
      })),
    },
  )

  const resvg = new Resvg(svg, {
    fitTo: options.resvgFitTo ?? { mode: 'width', value: spec.width },
    background: 'transparent',
  })
  const pngData = resvg.render()
  const png = Buffer.from(pngData.asPng())

  return {
    platform,
    slide_index,
    total_slides,
    width: spec.width,
    height: spec.height,
    png,
    durationMs: Date.now() - t0,
  }
}

/**
 * Render N slides in parallel. Each slide gets `slide_index` 1..N · the
 * caller doesn't have to pre-compute indices.
 */
export async function renderCarousel(args: {
  platform: CarouselPlatform
  brand: BrandTokens
  slides: SlideContent[]
  options?: RenderOptions
}): Promise<RenderedSlide[]> {
  const { platform, brand, slides, options } = args
  if (!slides.length) throw new Error('renderCarousel: at least one slide required')

  // Eagerly load fonts once so each renderSlide call doesn't re-fetch.
  const fonts = options?.fonts ?? (await loadDefaultFonts())

  const total = slides.length
  return Promise.all(
    slides.map((content, idx) =>
      renderSlide({
        platform,
        brand,
        content,
        slide_index: idx + 1,
        total_slides: total,
        options: { ...options, fonts },
      }),
    ),
  )
}
