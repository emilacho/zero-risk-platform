#!/usr/bin/env node
/**
 * Smoke test para agent-alias-map.ts
 * Ejecutar con: node scripts/smoke-agent-alias-map.mjs
 *
 * No requiere test runner — usa assert nativo de Node.
 */

import assert from 'node:assert/strict'

// ----------------------------------------------------------------
// Inline the map here (mirrors agent-alias-map.ts) so this script
// runs without TypeScript compilation or module resolution.
// ----------------------------------------------------------------

const AGENT_ALIAS_MAP = {
  // snake_case → kebab-case
  content_creator: 'content-creator',
  content_creator_agent: 'content-creator',
  seo_specialist: 'seo-specialist',
  media_buyer: 'media-buyer',
  web_designer: 'web-designer',
  video_editor: 'video-editor',
  creative_director: 'creative-director',
  social_media_strategist: 'social-media-strategist',
  editor_en_jefe: 'editor-en-jefe',
  community_manager: 'community-manager',
  influencer_manager: 'influencer-manager',
  tracking_specialist: 'tracking-specialist',
  email_marketer: 'email-marketer',
  crm_architect: 'crm-architect',
  review_responder: 'review-responder',
  pr_earned_media_manager: 'pr-earned-media-manager',
  cro_specialist: 'cro-specialist',
  optimization_agent: 'optimization-agent',
  growth_hacker: 'growth-hacker',
  sales_enablement: 'sales-enablement',
  account_manager: 'account-manager',
  onboarding_specialist: 'onboarding-specialist',
  reporting_agent: 'reporting-agent',
  jefe_marketing: 'jefe-marketing',
  jefe_client_success: 'jefe-client-success',
  campaign_brief_agent: 'campaign-brief-agent',
  brand_strategist: 'brand-strategist',
  market_research: 'market-research',
  customer_research: 'customer-research',
  competitive_intelligence_agent: 'competitive-intelligence-agent',
  mops_director: 'mops-director',
  // Semantic
  ruflo_lead_qualifier: 'ruflo',
  copywriter: 'content-creator',
  landing_optimizer: 'cro-specialist',
  qbr_generator: 'reporting-agent',
  meta_agent: 'optimization-agent',
  // Consolidation
  'ad-intelligence-agent': 'competitive-intelligence-agent',
  ad_intelligence_agent: 'competitive-intelligence-agent',
}

const MANIFEST_31_SLUGS = new Set([
  'ruflo', 'jefe-marketing', 'campaign-brief-agent', 'brand-strategist',
  'market-research', 'customer-research', 'competitive-intelligence-agent',
  'mops-director', 'content-creator', 'seo-specialist', 'media-buyer',
  'web-designer', 'video-editor', 'creative-director', 'social-media-strategist',
  'editor-en-jefe', 'community-manager', 'influencer-manager', 'tracking-specialist',
  'email-marketer', 'crm-architect', 'review-responder', 'pr-earned-media-manager',
  'cro-specialist', 'optimization-agent', 'growth-hacker', 'sales-enablement',
  'jefe-client-success', 'account-manager', 'onboarding-specialist', 'reporting-agent',
])

function resolveAgentSlug(slug) {
  return AGENT_ALIAS_MAP[slug] ?? slug
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${e.message}`)
    failed++
  }
}

console.log('\nagent-alias-map smoke test\n')

console.log('resolveAgentSlug:')
test('canonical slugs pass through unchanged', () => {
  assert.equal(resolveAgentSlug('content-creator'), 'content-creator')
  assert.equal(resolveAgentSlug('jefe-marketing'), 'jefe-marketing')
  assert.equal(resolveAgentSlug('editor-en-jefe'), 'editor-en-jefe')
})
test('snake_case → kebab-case', () => {
  assert.equal(resolveAgentSlug('content_creator'), 'content-creator')
  assert.equal(resolveAgentSlug('content_creator_agent'), 'content-creator')
  assert.equal(resolveAgentSlug('competitive_intelligence_agent'), 'competitive-intelligence-agent')
  assert.equal(resolveAgentSlug('editor_en_jefe'), 'editor-en-jefe')
  assert.equal(resolveAgentSlug('social_media_strategist'), 'social-media-strategist')
  assert.equal(resolveAgentSlug('pr_earned_media_manager'), 'pr-earned-media-manager')
})
test('semantic aliases', () => {
  assert.equal(resolveAgentSlug('ruflo_lead_qualifier'), 'ruflo')
  assert.equal(resolveAgentSlug('copywriter'), 'content-creator')
  assert.equal(resolveAgentSlug('landing_optimizer'), 'cro-specialist')
  assert.equal(resolveAgentSlug('qbr_generator'), 'reporting-agent')
  assert.equal(resolveAgentSlug('meta_agent'), 'optimization-agent')
})
test('ad-intelligence consolidation', () => {
  assert.equal(resolveAgentSlug('ad-intelligence-agent'), 'competitive-intelligence-agent')
  assert.equal(resolveAgentSlug('ad_intelligence_agent'), 'competitive-intelligence-agent')
})
test('unknown slugs pass through', () => {
  assert.equal(resolveAgentSlug('some-future-agent'), 'some-future-agent')
  assert.equal(resolveAgentSlug('unknown_thing'), 'unknown_thing')
})

console.log('\nMANIFEST_31_SLUGS:')
test('exactly 31 entries', () => {
  assert.equal(MANIFEST_31_SLUGS.size, 31)
})
test('all slugs are kebab-case (no underscores)', () => {
  for (const slug of MANIFEST_31_SLUGS) {
    assert.ok(!slug.includes('_'), `"${slug}" contains underscore`)
  }
})

console.log('\nAGENT_ALIAS_MAP invariants:')
test('every alias value is a canonical MANIFEST-31 slug', () => {
  for (const [ghost, canonical] of Object.entries(AGENT_ALIAS_MAP)) {
    assert.ok(MANIFEST_31_SLUGS.has(canonical), `"${ghost}" → "${canonical}" not in MANIFEST`)
  }
})
test('no alias key equals its value (no loops)', () => {
  for (const [ghost, canonical] of Object.entries(AGENT_ALIAS_MAP)) {
    assert.notEqual(ghost, canonical)
  }
})
test('no alias key is already canonical (map stays clean)', () => {
  for (const ghost of Object.keys(AGENT_ALIAS_MAP)) {
    assert.ok(!MANIFEST_31_SLUGS.has(ghost), `"${ghost}" is canonical — should not be a key`)
  }
})

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
