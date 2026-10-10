/**
 * Shared helpers used across templates.
 *
 * Satori has a narrow CSS subset · no `grid`, no `position: absolute`
 * in most cases, no gradients beyond linear backgrounds, no svg masks.
 * These helpers paper over the brand-defaulting + text-fitting math so
 * each template only worries about layout.
 */

import { Children, cloneElement, createElement, type ReactElement } from 'react'
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

/**
 * Footer cue text: `undefined` → the template's default · `null`/blank → none · string → that text.
 */
export function resolverPie(content: SlideContent, porDefecto: string): string | null {
  if (content.pie === undefined) return porDefecto
  if (content.pie === null) return null
  return content.pie.trim() ? content.pie : null
}

/** Dark layer over the photo so the template text stays readable. */
export const CAPA_DE_CONTRASTE = 'rgba(0,0,0,0.5)'

/**
 * Background photo. Without `background_image_url` returns `root` UNCHANGED (same object: the render is
 * identical to the one before this feature). With it: the root gets `position: relative` and two absolute
 * layers (photo with objectFit cover + dark contrast layer) are inserted BEFORE its children.
 */
export function conFotoDeFondo(root: ReactElement, content: SlideContent, W: number, H: number): ReactElement {
  const url = content.background_image_url
  if (!url) return root
  const props = root.props as { style?: Record<string, unknown>; children?: unknown }
  const capas = [
    createElement('img', {
      key: 'fondo-foto',
      src: url,
      alt: '',
      width: W,
      height: H,
      style: { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' },
    }),
    createElement('div', {
      key: 'fondo-capa',
      style: { display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundColor: CAPA_DE_CONTRASTE },
    }),
  ]
  return cloneElement(root, { style: { ...(props.style ?? {}), position: 'relative' } }, ...capas, ...Children.toArray(props.children as never))
}
