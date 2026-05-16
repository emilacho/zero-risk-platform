/**
 * Identity sanity tests for the Gaps 4 + 5 cascade reviewers
 * (style-consistency-reviewer + delivery-coordinator).
 *
 * These agents are project-local extensions seeded by the migration
 *   supabase/migrations/202605161900_seed_style_consistency_reviewer_and_delivery_coordinator.sql
 * The source-of-truth for the identity body is the matching .md file under
 *   src/agents/identities/<slug>.md
 *
 * The migration embeds the .md body verbatim inside a $zr$...$zr$ dollar-quoted
 * literal. These tests don't try to verify byte-for-byte equality with the
 * migration (that would be fragile and easy to drift), but they DO verify:
 *
 *   1. The .md identity files exist on disk
 *   2. Each has the YAML frontmatter the agent runtime expects (name,
 *      description, color)
 *   3. The body is non-trivial (≥800 chars · production-quality bar)
 *   4. The required JSON output contract sections are present (so downstream
 *      JSON-shape consumers don't break silently if someone rewrites the
 *      identity)
 *
 * Reference · IDENTITY-RESTORE-3-FIXES governance rule (CLAUDE.md):
 *   placeholder body like "pending-identity" (16 chars) is treated as an
 *   explicit "awaiting provenance decision" sentinel · these tests guarantee
 *   neither cascade reviewer is shipping with a sentinel.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const IDENTITIES_DIR = resolve(__dirname, '..', 'src', 'agents', 'identities')

const CASCADE_REVIEWERS = [
  {
    slug: 'style-consistency-reviewer',
    expectedFrontmatterName: 'Style Consistency Reviewer',
    expectedSections: [
      '# Style Consistency Reviewer Agent',
      '## Role Definition',
      '## When you are invoked',
      '## Core Capabilities',
      '## Decision Framework',
      '## Output format',
      '## Critical Rules',
      '## Anti-patterns',
      '## Success Metrics',
      '## Handoff',
    ],
    expectedJsonKeys: [
      '"verdict"',
      '"severity"',
      '"axis_scores"',
      '"findings"',
      '"cascade_register"',
    ],
  },
  {
    slug: 'delivery-coordinator',
    expectedFrontmatterName: 'Delivery Coordinator',
    expectedSections: [
      '# Delivery Coordinator Agent',
      '## Role Definition',
      '## When you are invoked',
      '## Core Capabilities',
      '## Decision Framework',
      '## Output format',
      '## Critical Rules',
      '## Anti-patterns',
      '## Success Metrics',
      '## Handoff',
    ],
    expectedJsonKeys: [
      '"verdict"',
      '"checks"',
      '"brand_guardrails"',
      '"cta_clarity"',
      '"locale_sanity"',
      '"next_step"',
    ],
  },
] as const

describe('Gaps 4 + 5 · cascade reviewer identities on disk', () => {
  for (const r of CASCADE_REVIEWERS) {
    describe(`${r.slug}.md`, () => {
      const path = resolve(IDENTITIES_DIR, `${r.slug}.md`)

      it('exists on disk in src/agents/identities/', () => {
        expect(existsSync(path), `missing: ${path}`).toBe(true)
      })

      it('has YAML frontmatter with the expected agent name', () => {
        const body = readFileSync(path, 'utf8')
        expect(body.startsWith('---\n')).toBe(true)
        // Frontmatter `name:` field must match (line-anchored, before first `---` close).
        const fmEnd = body.indexOf('\n---', 4)
        expect(fmEnd).toBeGreaterThan(0)
        const fm = body.slice(0, fmEnd)
        expect(fm).toMatch(new RegExp(`^name:\\s*${r.expectedFrontmatterName}\\s*$`, 'm'))
        expect(fm).toMatch(/^description:\s+\S+/m)
        expect(fm).toMatch(/^color:\s+\S+/m)
      })

      it('body is production-quality (≥800 chars after frontmatter, not the "pending-identity" sentinel)', () => {
        const body = readFileSync(path, 'utf8')
        const fmEnd = body.indexOf('\n---', 4)
        const post = body.slice(fmEnd + 4).trim()
        expect(post.length, 'identity body too short to be production-quality').toBeGreaterThan(800)
        // Guard against the IDENTITY-RESTORE governance sentinel leaking in.
        expect(post).not.toBe('pending-identity')
        expect(post).not.toMatch(/^pending-identity\s*$/m)
      })

      it('contains every expected H1/H2 section', () => {
        const body = readFileSync(path, 'utf8')
        for (const section of r.expectedSections) {
          expect(body, `missing section "${section}"`).toContain(section)
        }
      })

      it('declares a strict JSON output contract with the expected keys', () => {
        const body = readFileSync(path, 'utf8')
        for (const key of r.expectedJsonKeys) {
          expect(body, `JSON contract missing key ${key}`).toContain(key)
        }
      })
    })
  }
})

describe('Gaps 4 + 5 · seed migration', () => {
  const migrationPath = resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '202605161900_seed_style_consistency_reviewer_and_delivery_coordinator.sql',
  )

  it('exists', () => {
    expect(existsSync(migrationPath), `missing migration: ${migrationPath}`).toBe(true)
  })

  it('inserts both new agents with explicit project-local provenance', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain("'style-consistency-reviewer'")
    expect(sql).toContain("'delivery-coordinator'")
    // Provenance tag is mandatory per IDENTITY-RESTORE-3-FIXES governance.
    expect(sql).toMatch(/project-local · CC#4 created 2026-05-16 · post Náufrago v1 review gap 4/)
    expect(sql).toMatch(/project-local · CC#4 created 2026-05-16 · post Náufrago v1 review gap 5/)
    // Idempotency guard — ON CONFLICT (name) DO NOTHING on every insert.
    const onConflictCount = (sql.match(/ON CONFLICT \(name\) DO NOTHING/g) || []).length
    expect(onConflictCount).toBeGreaterThanOrEqual(2)
    // Both agents use Opus per dispatch (depth analysis · final gate).
    expect(sql).toContain("'claude-opus-4-6'")
  })

  it('wraps both inserts in a transaction (BEGIN/COMMIT)', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
  })
})
