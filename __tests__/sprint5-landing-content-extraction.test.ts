/**
 * Sprint 5 Track B · content-extraction lib · pure function tests.
 */
import { describe, it, expect } from 'vitest'
import {
  generateSlug,
  isValidSlug,
  extractLandingContent,
} from '@/lib/landings/content-extraction'

describe('Sprint 5 · generateSlug', () => {
  it('produces lowercase kebab-case with suffix', () => {
    const slug = generateSlug('Náufrago Surf Escape', 'abc123def456')
    expect(slug).toMatch(/^naufrago-surf-escape-[a-z0-9]{1,6}$/)
    expect(isValidSlug(slug)).toBe(true)
  })

  it('strips diacritics', () => {
    const slug = generateSlug('Pérez Müller', 'campaign-001-x')
    expect(slug).not.toContain('é')
    expect(slug).not.toContain('ü')
    expect(slug).toMatch(/^perez-muller-/)
  })

  it('falls back to "client" when name is empty after clean', () => {
    const slug = generateSlug('!!!@@@', 'cmp-uuid-abc123')
    expect(slug).toMatch(/^client-[a-z0-9]{1,6}$/)
  })

  it('caps total length at 64', () => {
    const longName = 'a'.repeat(100)
    const slug = generateSlug(longName, 'campaign-xyz-456')
    expect(slug.length).toBeLessThanOrEqual(64)
  })

  it('produces different slugs for different campaign IDs', () => {
    const a = generateSlug('Client X', 'aaa111')
    const b = generateSlug('Client X', 'bbb222')
    expect(a).not.toBe(b)
  })

  it('passes the DB slug regex', () => {
    const slugs = [
      generateSlug('Test', 'abc123'),
      generateSlug('Brand Name 99', 'xyz789'),
      generateSlug('A', 'q1w2e3'),
    ]
    for (const slug of slugs) {
      expect(isValidSlug(slug)).toBe(true)
    }
  })
})

describe('Sprint 5 · extractLandingContent', () => {
  const minimalOutputs = {}

  it('returns safe defaults when outputs is empty', () => {
    const result = extractLandingContent(minimalOutputs, { client_name: 'TestCo' })
    expect(result.hero_headline).toContain('TestCo')
    expect(result.cta_text).toBe('Comenzar')
    expect(result.cta_url).toBe('#')
    expect(Array.isArray(result.sections)).toBe(true)
    expect(result.sections.length).toBeGreaterThan(0) // always has cta_band
  })

  it('extracts headline from content-creator stage', () => {
    const result = extractLandingContent(
      { 'content-creator': { headline: 'Custom Headline · Test', cta_label: 'Click Here' } },
      { client_name: 'TestCo' },
    )
    expect(result.hero_headline).toBe('Custom Headline · Test')
    expect(result.cta_text).toBe('Click Here')
  })

  it('builds feature_grid section from differentiators (>= 2 items)', () => {
    const result = extractLandingContent(
      {
        'competitive-strategist': {
          differentiators: ['Fast', 'Reliable', 'Cheap'],
        },
      },
      { client_name: 'TestCo' },
    )
    const grid = result.sections.find((s) => s.type === 'feature_grid')
    expect(grid).toBeDefined()
    expect(grid!.items).toHaveLength(3)
    expect(grid!.items![0].title).toBe('Fast')
  })

  it('skips feature_grid when differentiators < 2', () => {
    const result = extractLandingContent(
      { 'competitive-strategist': { differentiators: ['OnlyOne'] } },
      { client_name: 'TestCo' },
    )
    const grid = result.sections.find((s) => s.type === 'feature_grid')
    expect(grid).toBeUndefined()
  })

  it('builds testimonial section from editor-en-jefe stage', () => {
    const result = extractLandingContent(
      {
        'editor-en-jefe': {
          testimonials: [
            { quote: 'Amazing service', author: 'Jane Doe', role: 'CEO' },
            { quote: 'Second', author: 'Bob' },
          ],
        },
      },
      { client_name: 'TestCo' },
    )
    const test = result.sections.find((s) => s.type === 'testimonial')
    expect(test).toBeDefined()
    expect(test!.quote).toBe('Amazing service')
    expect(test!.author).toBe('Jane Doe')
  })

  it('builds text_block section when body_copy present', () => {
    const result = extractLandingContent(
      { 'content-creator': { body_copy: 'Lorem ipsum dolor sit amet.' } },
      { client_name: 'TestCo' },
    )
    const text = result.sections.find((s) => s.type === 'text_block')
    expect(text).toBeDefined()
    expect(text!.body).toBe('Lorem ipsum dolor sit amet.')
  })

  it('always appends cta_band as closing section', () => {
    const result = extractLandingContent(minimalOutputs, { client_name: 'TestCo' })
    const last = result.sections[result.sections.length - 1]
    expect(last.type).toBe('cta_band')
    expect(last.cta_text).toBe('Comenzar')
  })

  it('extracts hero_image_url from editor or content-creator', () => {
    const result = extractLandingContent(
      {
        'editor-en-jefe': { hero_image_url: 'https://example.test/hero.jpg' },
      },
      { client_name: 'TestCo' },
    )
    expect(result.hero_image_url).toBe('https://example.test/hero.jpg')
  })

  it('full integration · all stages → full landing', () => {
    const result = extractLandingContent(
      {
        'content-creator': {
          headline: 'Aprende surf en Mompiche',
          subhead: 'Retiros 3 días · todos los niveles',
          cta_label: 'Reservá',
          cta_url: 'https://tally.so/r/x',
          body_copy: 'Mompiche es la mejor ola del Pacífico.',
        },
        'competitive-strategist': {
          differentiators: ['Instructor ISA certificado', 'Cabaña a 80m de la rompiente', 'Equipamiento premium incluido'],
        },
        'editor-en-jefe': {
          hero_image_url: 'https://example.test/mompiche.jpg',
          testimonials: [{ quote: 'Lo mejor de Ecuador', author: 'M.C.', role: 'student' }],
        },
      },
      { client_name: 'Náufrago Surf', vertical: 'surf' },
    )

    expect(result.hero_headline).toBe('Aprende surf en Mompiche')
    expect(result.hero_subhead).toBe('Retiros 3 días · todos los niveles')
    expect(result.cta_text).toBe('Reservá')
    expect(result.cta_url).toBe('https://tally.so/r/x')
    expect(result.hero_image_url).toBe('https://example.test/mompiche.jpg')
    expect(result.sections.length).toBe(4) // feature_grid + testimonial + text_block + cta_band
  })
})
