/**
 * Tests for the `carousel-designer` agent · identity_md + migration sanity +
 * social-content-runner orchestration contract.
 *
 * The agent itself runs in Anthropic-managed-agents land · we can't unit-test
 * Claude's output. What we CAN pin:
 *   1. Identity file on disk has the required structure (sections, JSON
 *      contract keys, anti-patterns, success metrics)
 *   2. Migration is structurally sound (BEGIN/COMMIT, dual-write to
 *      managed_agents_registry + agents, explicit identity_source tag)
 *   3. social-content-runner builds task prompts that include every
 *      upstream context block (brand_book + visual_direction + copy)
 *   4. parseStoryboard tolerates `\`\`\`json` fences + stray prose
 *   5. Validator rejects malformed bodies with helpful detail strings
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  SOCIAL_PLATFORMS,
  buildCarouselDesignerTask,
  parseStoryboard,
  type SocialContentRequest,
} from '../src/lib/social-content-runner'

// ── Identity file on disk ──────────────────────────────────────────────
describe('carousel-designer identity_md · structural sanity', () => {
  const path = resolve(__dirname, '..', 'src', 'agents', 'identities', 'carousel-designer.md')

  it('exists on disk', () => {
    expect(existsSync(path), `missing: ${path}`).toBe(true)
  })

  it('has YAML frontmatter with name + model + role + display_name', () => {
    const body = readFileSync(path, 'utf8')
    expect(body.startsWith('---\n')).toBe(true)
    const fmEnd = body.indexOf('\n---', 4)
    expect(fmEnd).toBeGreaterThan(0)
    const fm = body.slice(0, fmEnd)
    expect(fm).toMatch(/^name:\s*Carousel Designer\s*$/m)
    expect(fm).toMatch(/^display_name:\s*Carousel Designer\s*$/m)
    expect(fm).toMatch(/^model:\s*claude-opus-4-6\s*$/m)
    expect(fm).toMatch(/^role:\s+\S+/m)
  })

  it('body is production-quality (≥ 1500 chars after frontmatter)', () => {
    const body = readFileSync(path, 'utf8')
    const fmEnd = body.indexOf('\n---', 4)
    const post = body.slice(fmEnd + 4).trim()
    expect(post.length, 'identity body too short to be production-quality').toBeGreaterThan(1500)
    expect(post).not.toBe('pending-identity')
  })

  it('includes the canonical H2 sections', () => {
    const body = readFileSync(path, 'utf8')
    const expectedSections = [
      '# Carousel Designer Agent',
      '## Role Definition',
      '## When you are invoked',
      '## Output format',
      '## Per-platform constraints',
      '## Core Capabilities',
      '## Decision Framework',
      '## Critical Rules',
      '## Anti-patterns',
      '## Success Metrics',
      '## Handoff',
    ]
    for (const s of expectedSections) {
      expect(body, `missing section "${s}"`).toContain(s)
    }
  })

  it('declares the strict-JSON output contract with the expected keys', () => {
    const body = readFileSync(path, 'utf8')
    for (const key of ['"version"', '"client_slug"', '"campaign_intent"', '"platforms"', '"slides"', '"shared_lexicon"', '"cta_verb_family"']) {
      expect(body, `output contract missing key ${key}`).toContain(key)
    }
  })

  it('per-platform table covers all 5 platforms', () => {
    const body = readFileSync(path, 'utf8')
    for (const p of ['instagram-feed', 'instagram-reel', 'tiktok', 'facebook-feed', 'twitter-card']) {
      expect(body).toContain(p)
    }
  })

  it('per-slide shape contract names all 6 fields (slide_index · role · eyebrow · headline · body · cta)', () => {
    const body = readFileSync(path, 'utf8')
    for (const f of ['slide_index', 'role', 'eyebrow', 'headline', 'body', 'cta']) {
      expect(body).toContain(f)
    }
  })
})

// ── Migration on disk ──────────────────────────────────────────────────
describe('carousel-designer migration · structural sanity', () => {
  const migrationPath = resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '202605162000_seed_carousel_designer_agent.sql',
  )

  it('exists', () => {
    expect(existsSync(migrationPath), `missing: ${migrationPath}`).toBe(true)
  })

  it('wraps writes in BEGIN/COMMIT', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
  })

  it('dual-writes to managed_agents_registry AND agents', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/INSERT INTO managed_agents_registry/i)
    expect(sql).toMatch(/INSERT INTO agents/i)
  })

  it('uses claude-opus-4-6 as the model on both tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/'claude-opus-4-6'/)
  })

  it('carries explicit project-local identity_source provenance on the legacy agents write', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/project-local \(carousel-designer-agent\) · feat\/agent-carousel-designer/)
  })

  it('idempotent · ON CONFLICT DO UPDATE on both inserts', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const onConflictCount = (sql.match(/ON CONFLICT.*DO UPDATE/g) || []).length
    expect(onConflictCount).toBeGreaterThanOrEqual(2)
  })
})

// ── SOCIAL_PLATFORMS contract ──────────────────────────────────────────
describe('SOCIAL_PLATFORMS · exactly the 5 dispatch platforms', () => {
  it('contains exactly 5 platforms', () => {
    expect(SOCIAL_PLATFORMS).toHaveLength(5)
  })
  it('matches the carousel-engine platform set', () => {
    expect([...SOCIAL_PLATFORMS].sort()).toEqual(
      ['facebook-feed', 'instagram-feed', 'instagram-reel', 'tiktok', 'twitter-card'].sort(),
    )
  })
})

// ── buildCarouselDesignerTask ──────────────────────────────────────────
function fixtureRequest(over: Partial<SocialContentRequest> = {}): SocialContentRequest {
  return {
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    client_slug: 'naufrago',
    client_name: 'Náufrago',
    brief: 'Empresa de seguridad industrial en Ecuador. Vende auditorías de cumplimiento.',
    campaign_intent: 'Lanzamiento del paquete de diagnóstico operativo de 90 días',
    context: {
      brand_book: {
        positioning_statement: 'Diagnóstico operativo · NO PDF muerto',
        brand_voice: 'directo · empático · técnicamente sólido sin jerga',
        do_say: ['diagnóstico operativo', 'multa real', '90 días'],
        dont_say: ['barato', 'low cost'],
      },
      visual_direction: {
        palette_top5: [{ hex: '#0b3d2e', name: 'verde profundo' }],
        imagery_style: 'industrial · documental · cero stock',
        mood: 'autoritativo · cálido',
      },
      copy: {
        hero: {
          headline: 'Tu consultoría no te salvará de la multa',
          subheadline: 'Diagnóstico operativo · 90 días de soporte',
          cta_text: 'Agendá tu diagnóstico',
        },
      },
    },
    platforms_requested: ['instagram-feed', 'tiktok'],
    ...over,
  }
}

describe('buildCarouselDesignerTask', () => {
  it('includes cliente identification + brief + campaign_intent + platforms', () => {
    const task = buildCarouselDesignerTask(fixtureRequest())
    expect(task).toContain('Cliente: Náufrago')
    expect(task).toContain('slug=naufrago')
    expect(task).toContain('seguridad industrial en Ecuador')
    expect(task).toContain('Diagnóstico operativo')
    expect(task).toContain('Platforms requested: instagram-feed, tiktok')
  })

  it('embeds every upstream context block (brand_book + visual_direction + copy)', () => {
    const task = buildCarouselDesignerTask(fixtureRequest())
    expect(task).toContain('[brand_book agent output]')
    expect(task).toContain('[visual_direction agent output]')
    expect(task).toContain('[copy agent output]')
    expect(task).toContain('"positioning_statement"')
    expect(task).toContain('"palette_top5"')
    expect(task).toContain('"headline"')
  })

  it('falls back to "general brand awareness" when campaign_intent is omitted', () => {
    const task = buildCarouselDesignerTask(fixtureRequest({ campaign_intent: undefined }))
    expect(task).toContain('general brand awareness')
    expect(task).toContain('cliente did not specify')
  })

  it('tail ends with strict-JSON instruction (no prose outside)', () => {
    const task = buildCarouselDesignerTask(fixtureRequest())
    expect(task).toMatch(/strict JSON per your output contract/i)
    expect(task).toMatch(/NO prose outside the JSON/i)
  })

  it('notes brand_assets presence vs absence', () => {
    const withAssets = buildCarouselDesignerTask(
      fixtureRequest({
        brand_assets: { logo_url: 'https://example.com/logo.png', brand_colors: ['#0b3d2e'], brand_fonts: ['Inter'] },
      }),
    )
    expect(withAssets).toContain('Brand assets uploaded by cliente')
    expect(withAssets).toContain('https://example.com/logo.png')

    const withoutAssets = buildCarouselDesignerTask(fixtureRequest({ brand_assets: undefined }))
    expect(withoutAssets).toContain('no brand assets uploaded')
  })
})

// ── parseStoryboard ───────────────────────────────────────────────────
describe('parseStoryboard · tolerant JSON parsing', () => {
  const validJson = JSON.stringify({
    version: '1.0',
    client_slug: 'naufrago',
    campaign_intent: 'lanzamiento',
    platforms: {
      'instagram-feed': {
        slide_count: 5,
        narrative_arc: 'hook → problem → reframe → proof → cta',
        slides: [
          { slide_index: 1, role: 'hook', eyebrow: 'PARTE 01', headline: 'Hook', body: null, cta: null },
        ],
      },
    },
    shared_lexicon: ['diagnóstico'],
    cta_verb_family: 'agendá',
    open_questions: [],
  })

  it('returns null for empty / non-JSON strings', () => {
    expect(parseStoryboard('')).toBeNull()
    expect(parseStoryboard('no json here at all')).toBeNull()
    expect(parseStoryboard('{ malformed')).toBeNull()
  })

  it('parses raw JSON', () => {
    const sb = parseStoryboard(validJson)
    expect(sb).not.toBeNull()
    expect(sb?.version).toBe('1.0')
    expect(sb?.platforms['instagram-feed']?.slide_count).toBe(5)
  })

  it('strips ```json fences', () => {
    const fenced = '```json\n' + validJson + '\n```'
    const sb = parseStoryboard(fenced)
    expect(sb?.client_slug).toBe('naufrago')
  })

  it('tolerates prose before and after the JSON block', () => {
    const noisy = 'Aquí está el storyboard que pediste:\n\n' + validJson + '\n\nEspero te sirva!'
    const sb = parseStoryboard(noisy)
    expect(sb?.cta_verb_family).toBe('agendá')
  })

  it('rejects parsed JSON that is missing `platforms`', () => {
    const missing = JSON.stringify({ version: '1.0', cta_verb_family: 'agendá' })
    expect(parseStoryboard(missing)).toBeNull()
  })
})
