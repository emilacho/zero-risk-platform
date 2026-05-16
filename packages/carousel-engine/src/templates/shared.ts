/**
 * Shared helpers used across templates.
 *
 * Satori has a narrow CSS subset · no `grid`, no `position: absolute`
 * in most cases, no gradients beyond linear backgrounds, no svg masks.
 * These helpers paper over the brand-defaulting + text-fitting math so
 * each template only worries about layout.
 */

import type { BrandTokens, SlideContent, TemplateProps } from '../types'

export interface ResolvedBrand {
  primary: string
  secondary: string
  accent: string
  textOnPrimary: string
  textOnSurface: string
  surface: string
  fontFamily: string
  headlineFamily: string
  logoUrl: string | null
  brandHandle: string
}

export function resolveBrand(brand: BrandTokens): ResolvedBrand {
  return {
    primary: brand.colors.primary || '#0a0a0f',
    secondary: brand.colors.secondary || brand.colors.primary || '#1a1a24',
    accent: brand.colors.accent || '#06b6d4',
    textOnPrimary: brand.colors.text_on_primary || '#ffffff',
    textOnSurface: brand.colors.text_on_surface || '#0a0a0f',
    surface: brand.colors.surface || '#ffffff',
    fontFamily: brand.fonts.family || 'Inter',
    headlineFamily: brand.fonts.headline_family || brand.fonts.family || 'Inter',
    logoUrl: brand.logo_url ?? null,
    brandHandle: brand.brand_handle ?? '',
  }
}

/**
 * Pick a headline size that fits a target width without overflow. Heuristic
 * · satori cannot measure text reliably so we estimate based on char count.
 * Returns a font-size in px.
 */
export function fitHeadlineSize(
  headline: string,
  options: { canvasWidth: number; minSize: number; maxSize: number; targetLines?: number },
): number {
  const { canvasWidth, minSize, maxSize, targetLines = 3 } = options
  const charsPerLine = Math.floor(canvasWidth / (maxSize * 0.55))
  const estLines = Math.max(1, Math.ceil(headline.length / charsPerLine))
  if (estLines <= targetLines) return maxSize
  const ratio = targetLines / estLines
  return Math.max(minSize, Math.round(maxSize * ratio))
}

export type { SlideContent, TemplateProps }
