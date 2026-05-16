/**
 * @zero-risk/carousel-engine
 *
 * Public entry · the API route + smoke script import from here.
 *   import { renderCarousel, renderSlide, TEMPLATES, PLATFORM_SPECS } from '@zero-risk/carousel-engine'
 */

// ── Render pipeline ────────────────────────────────────────────────────
export { renderSlide, renderCarousel, TEMPLATES } from './render'
export type { RenderOptions } from './render'

// ── Templates (also importable individually for previews) ──────────────
export { InstagramFeed } from './templates/InstagramFeed'
export { InstagramReel } from './templates/InstagramReel'
export { TikTok } from './templates/TikTok'
export { FacebookFeed } from './templates/FacebookFeed'
export { TwitterCard } from './templates/TwitterCard'

// ── Fonts ──────────────────────────────────────────────────────────────
export { loadDefaultFonts, registerFont, getRegisteredFonts, clearFontCache } from './fonts'
export type { FontEntry, FontWeight, FontStyle } from './fonts'

// ── Types ──────────────────────────────────────────────────────────────
export type {
  BrandTokens,
  CarouselGenerateRequest,
  CarouselGenerateResponse,
  CarouselPlatform,
  PlatformSpec,
  RenderedSlide,
  SlideContent,
  TemplateProps,
  TemplateRenderer,
} from './types'
export { PLATFORM_SPECS } from './types'
