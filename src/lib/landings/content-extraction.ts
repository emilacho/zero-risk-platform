/**
 * src/lib/landings/content-extraction.ts · Sprint 5 Track B · CC#2
 *
 * Pure functions to derive landing page content from NEXUS cascade outputs
 * (Phase 5 BUILD / Phase 6 LAUNCH stages). Used by ·
 *
 *   - `/api/cascade/landing-from-outputs` route (Vercel · DB INSERT only)
 *   - n8n `landing-generator` sidecar workflow (calls the route)
 *   - unit tests (this lib is pure · NO side effects)
 *
 * Per cascade canon (CLAUDE.md 2026-05-16) · NO agent calls here · only data
 * shape transformations.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/

/**
 * Generate a deterministic slug from client name + a unique suffix.
 *
 * - Lowercase + replace non-alnum with hyphens + trim leading/trailing hyphens
 * - Append last 6 chars of uniqSuffix (campaign UUID or similar) for uniqueness
 * - Cap total length at 64 (matches DB constraint)
 *
 * If clientName cleans to empty (e.g. all special chars), fall back to "client".
 */
export function generateSlug(clientName: string, uniqSuffix: string): string {
  const base = clientName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const cleanBase = base || 'client'
  const suffix = uniqSuffix.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase()
  const combined = `${cleanBase}-${suffix}`
  return combined.slice(0, 64).replace(/-+$/, '')
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

export interface LandingContent {
  hero_headline: string
  hero_subhead: string | null
  hero_image_url: string | null
  cta_text: string
  cta_url: string
  sections: LandingSection[]
  meta_description: string | null
}

export interface LandingSection {
  type: 'feature_grid' | 'testimonial' | 'text_block' | 'cta_band'
  title?: string
  headline?: string
  body?: string
  quote?: string
  author?: string
  role?: string
  cta_text?: string
  cta_url?: string
  items?: Array<{ icon?: string; title?: string; body?: string }>
}

/**
 * Extract landing content from a NEXUS cascade outputs map.
 *
 * Expected input shape · outputs is keyed by agent stage. Recognized keys ·
 *   - `content-creator` · { headline, subhead, body_copy, cta_label, cta_url }
 *   - `competitive-strategist` · { differentiators: string[] }
 *   - `editor-en-jefe` · { hero_image_url, testimonials: [{quote, author, role}] }
 *   - `nexus-phase-5-build` · campaign output blob (fallback)
 *
 * Falls back to safe defaults when fields missing · never throws · returns
 * a renderable LandingContent always.
 */
export function extractLandingContent(
  outputs: Record<string, unknown>,
  ctx: { client_name: string; vertical?: string | null } = { client_name: 'Cliente' },
): LandingContent {
  const safe = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const contentCreator = isRecord(outputs['content-creator']) ? outputs['content-creator'] : {}
  const editor = isRecord(outputs['editor-en-jefe']) ? outputs['editor-en-jefe'] : {}
  const strategist = isRecord(outputs['competitive-strategist']) ? outputs['competitive-strategist'] : {}
  const phase5 = isRecord(outputs['nexus-phase-5-build']) ? outputs['nexus-phase-5-build'] : {}

  const headline =
    safe(contentCreator.headline) ??
    safe(phase5.headline) ??
    safe(phase5.title) ??
    `${ctx.client_name} · ${ctx.vertical ?? 'campaign'}`

  const subhead =
    safe(contentCreator.subhead) ??
    safe(contentCreator.tagline) ??
    safe(phase5.subhead) ??
    null

  const heroImageUrl =
    safe(editor.hero_image_url) ??
    safe(contentCreator.hero_image_url) ??
    safe(phase5.hero_image_url) ??
    null

  const ctaText = safe(contentCreator.cta_label) ?? safe(phase5.cta_text) ?? 'Comenzar'
  const ctaUrl = safe(contentCreator.cta_url) ?? safe(phase5.cta_url) ?? '#'
  const metaDesc = safe(contentCreator.meta_description) ?? subhead ?? headline

  // Build sections · feature_grid from differentiators · testimonial from editor · text_block from body_copy · cta_band closing
  const sections: LandingSection[] = []

  const differentiators = Array.isArray(strategist.differentiators)
    ? (strategist.differentiators as unknown[]).filter((d): d is string => typeof d === 'string').slice(0, 6)
    : []
  if (differentiators.length >= 2) {
    sections.push({
      type: 'feature_grid',
      title: '¿Por qué nosotros?',
      items: differentiators.map((d) => ({ title: d, body: '' })),
    })
  }

  const testimonials = Array.isArray(editor.testimonials)
    ? (editor.testimonials as unknown[]).filter((t) => isRecord(t)).slice(0, 1)
    : []
  if (testimonials.length > 0) {
    const t = testimonials[0] as Record<string, unknown>
    sections.push({
      type: 'testimonial',
      quote: safe(t.quote) ?? '',
      author: safe(t.author) ?? '',
      role: safe(t.role) ?? '',
    })
  }

  const bodyCopy = safe(contentCreator.body_copy) ?? safe(phase5.body) ?? null
  if (bodyCopy) {
    sections.push({
      type: 'text_block',
      title: safe(contentCreator.body_title) ?? safe(phase5.body_title) ?? null ?? undefined,
      body: bodyCopy,
    })
  }

  sections.push({
    type: 'cta_band',
    headline: safe(contentCreator.cta_headline) ?? `Comenzá con ${ctx.client_name}`,
    cta_text: ctaText,
    cta_url: ctaUrl,
  })

  return {
    hero_headline: headline,
    hero_subhead: subhead,
    hero_image_url: heroImageUrl,
    cta_text: ctaText,
    cta_url: ctaUrl,
    sections,
    meta_description: metaDesc,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
