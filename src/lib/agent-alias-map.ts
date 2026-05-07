/**
 * agent-alias-map.ts
 *
 * Maps legacy / ghost agent slugs → canonical MANIFEST-31 slugs.
 * Consumed by /api/agents/run and agent-sdk-runner.ts BEFORE any DB lookup,
 * so n8n workflows using old names resolve silently without 404.
 *
 * Sources of ghost slugs:
 *  - snake_case variants of kebab-case MANIFEST slugs (most common)
 *  - semantic aliases from old n8n templates (copywriter, landing_optimizer, etc.)
 *  - mc-bridge AGENT_ROLE_MAP had 2 unmapped entries corrected here
 *
 * DO NOT add entries for slugs that already match MANIFEST-31 exactly.
 * When a new canonical agent is added to MANIFEST, add its ghost variants here too.
 */

export const AGENT_ALIAS_MAP: Readonly<Record<string, string>> = {
  // ----------------------------------------------------------------
  // snake_case → kebab-case (MANIFEST-31 full set)
  // ----------------------------------------------------------------
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

  // ----------------------------------------------------------------
  // Semantic / role-based legacy aliases from n8n templates
  // ----------------------------------------------------------------
  // "ruflo_lead_qualifier" is a task-scoped label for RUFLO used in
  // classify-lead and lead-pipeline routes; canonical owner is ruflo.
  ruflo_lead_qualifier: 'ruflo',

  // Copywriter = content production role → content-creator
  copywriter: 'content-creator',

  // Landing page optimizer = conversion rate optimization
  landing_optimizer: 'cro-specialist',

  // QBR generator = periodic reporting artifact → reporting-agent
  qbr_generator: 'reporting-agent',

  // meta_agent used in old n8n wf as "optimize everything" → optimization-agent
  meta_agent: 'optimization-agent',

  // GEO (Generative Engine Optimization · AI-search content) is a specialty
  // within SEO; the cron workflow "GEO Content Freshness" used this slug.
  // Mapped to seo-specialist whose mandate already covers AI-search surfaces.
  'seo-geo-optimization': 'seo-specialist',
  seo_geo_optimization: 'seo-specialist',

  // ----------------------------------------------------------------
  // mc-bridge AGENT_ROLE_MAP ghost: ad-intelligence-agent
  // Not in MANIFEST-31; nearest capability = competitive-intelligence-agent
  // ----------------------------------------------------------------
  'ad-intelligence-agent': 'competitive-intelligence-agent',
  ad_intelligence_agent: 'competitive-intelligence-agent',
}

/**
 * Canonical set of all 31 agent slugs defined in MANIFEST.md.
 * Used for post-resolution validation; warns on unknown slugs at runtime.
 */
export const MANIFEST_31_SLUGS: ReadonlySet<string> = new Set([
  'ruflo',
  'jefe-marketing',
  'campaign-brief-agent',
  'brand-strategist',
  'market-research',
  'customer-research',
  'competitive-intelligence-agent',
  'mops-director',
  'content-creator',
  'seo-specialist',
  'media-buyer',
  'web-designer',
  'video-editor',
  'creative-director',
  'social-media-strategist',
  'editor-en-jefe',
  'community-manager',
  'influencer-manager',
  'tracking-specialist',
  'email-marketer',
  'crm-architect',
  'review-responder',
  'pr-earned-media-manager',
  'cro-specialist',
  'optimization-agent',
  'growth-hacker',
  'sales-enablement',
  'jefe-client-success',
  'account-manager',
  'onboarding-specialist',
  'reporting-agent',
])

/**
 * Resolves a ghost/legacy slug to its canonical MANIFEST-31 equivalent.
 * Returns the input unchanged if no alias is registered (pass-through).
 */
export function resolveAgentSlug(slug: string): string {
  return AGENT_ALIAS_MAP[slug] ?? slug
}

/**
 * Returns true if the slug is a canonical MANIFEST-31 slug.
 * Use AFTER resolveAgentSlug for post-resolution validation.
 */
export function isCanonicalSlug(slug: string): boolean {
  return MANIFEST_31_SLUGS.has(slug)
}
