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
  // Camino III 3rd reviewer alias · "client-success-lead" is the spec name
  // used in the orchestration playbook (zr-vault/wiki/playbooks/camino-iii-*).
  // The actual agent identity is `jefe-client-success`; keep the alias here
  // so middleware calls with the playbook name resolve to the real slug.
  'client-success-lead': 'jefe-client-success',
  client_success_lead: 'jefe-client-success',
  campaign_brief_agent: 'campaign-brief-agent',
  brand_strategist: 'brand-strategist',
  market_research: 'market-research',
  // CC#2 Path D fix · cascade-runner referenced `market-research-analyst` (no
  // MANIFEST-31 entry, no agents row, no registry slug) · the 'analyst' suffix
  // is a project-local variant of MANIFEST-31's `market-research`. Cross-variant
  // alias defenses · the cascade-runner.ts SEQUENCE now uses the underscored DB
  // canonical, but any external caller still using the hyphenated suffix form
  // resolves correctly via this entry.
  'market-research-analyst': 'market_research_analyst',
  market_research_analyst: 'market_research_analyst',
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
  // Camino III 3-of-N voting · canonical reviewer slugs
  // PRIMARY = editor-en-jefe · SECOND = brand-strategist · THIRD = client-success-lead
  // The workflow Phase Gate Evidence Collector + cascade orchestration
  // historically used `qa-reviewer-A` / `qa-reviewer-B` as positional labels.
  // Per Sprint 7 B8 canonization · these resolve to the actual reviewer slugs.
  // ----------------------------------------------------------------
  'qa-reviewer-A': 'editor-en-jefe',
  'qa-reviewer-a': 'editor-en-jefe',
  qa_reviewer_a: 'editor-en-jefe',
  'qa-reviewer-B': 'brand-strategist',
  'qa-reviewer-b': 'brand-strategist',
  qa_reviewer_b: 'brand-strategist',
  'qa-reviewer-C': 'jefe-client-success',
  'qa-reviewer-c': 'jefe-client-success',
  qa_reviewer_c: 'jefe-client-success',

  // ----------------------------------------------------------------
  // mc-bridge AGENT_ROLE_MAP ghost: ad-intelligence-agent
  // Not in MANIFEST-31; nearest capability = competitive-intelligence-agent
  // ----------------------------------------------------------------
  'ad-intelligence-agent': 'competitive-intelligence-agent',
  ad_intelligence_agent: 'competitive-intelligence-agent',

  // ----------------------------------------------------------------
  // Sprint 6 Track A1 · additional ghost variants found in live n8n
  // audit 2026-05-21 (zr-vault/raw/state/2026-05-21-58-workflows-live-deep-audit-manifest.md)
  // ----------------------------------------------------------------
  // `competitive_intelligence` (without `_agent` suffix) found in
  // "Zero Risk — Competitor Daily Monitor" workflow · resolve to MANIFEST-31.
  competitive_intelligence: 'competitive-intelligence-agent',
  'competitive-intelligence': 'competitive-intelligence-agent',

  // `social_adapter` found in "Social Multi-Platform Publisher" workflow ·
  // NOT in MANIFEST-31 · resolution decision filed at
  // zr-vault/wiki/decisions/2026-05-21-social-adapter-canon-resolution.md
  // social-media-strategist owns multi-platform content reformatting.
  social_adapter: 'social-media-strategist',
  'social-adapter': 'social-media-strategist',
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
