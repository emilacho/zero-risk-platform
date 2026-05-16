-- BACKFILL-35-IDENTITIES · CC#2 · 2026-05-16 · Emilio approved
--
-- Backfills `agents.identity_content` for 35 rows that were sitting at the
-- 'pending-identity' (16-char) sentinel placeholder. Per the CLAUDE.md
-- `agents.identity_content` WRITE protocol (canonized 2026-05-16 in PR #27),
-- the sync was performed via `scripts/backfill-35-placeholder-identities.mjs`
-- using the cascade canonical → registry → deferred. Each write carries a
-- provenance tag in `identity_source` so the source-of-truth chain is
-- auditable.
--
-- This SQL file is a DOCUMENTATION RECORD of what the script applied. The
-- canonical re-run path is `node scripts/backfill-35-placeholder-identities.mjs`
-- (idempotent · re-fetches from upstream + registry). This file is NOT meant
-- to be executed as a migration; the data was already applied via service-role
-- REST. It exists so re-importers and future audits can see the mapping.

/*
==========================================================================
SUMMARY (executed 2026-05-16 by scripts/backfill-35-placeholder-identities.mjs)
==========================================================================

Cascade outcome · 35 rows total · 0 errors

A · CANONICAL (24/24) · source = msitarzewski/agency-agents@main
    Path pattern · <prefix-hyphen>/<prefix-hyphen>-<rest-hyphen>.md
    identity_source = 'canonical:msitarzewski/agency-agents@main:<path> · backfill-35-placeholder-identities · 2026-05-16 Emilio approved'

      slug                                          chars   canonical path
      ────────────────────────────────────────────  ──────  ──────────────────────────────────────────────────────
      marketing_ai_citation_strategist               9348   marketing/marketing-ai-citation-strategist.md
      marketing_carousel_growth_engine              14782   marketing/marketing-carousel-growth-engine.md
      marketing_growth_hacker                        3040   marketing/marketing-growth-hacker.md
      marketing_instagram_curator                    6561   marketing/marketing-instagram-curator.md
      marketing_seo_specialist                      17932   marketing/marketing-seo-specialist.md
      marketing_short_video_editing_coach           30777   marketing/marketing-short-video-editing-coach.md
      marketing_social_media_strategist              7412   marketing/marketing-social-media-strategist.md
      marketing_twitter_engager                      7758   marketing/marketing-twitter-engager.md
      marketing_video_optimization_specialist        6219   marketing/marketing-video-optimization-specialist.md
      paid_media_auditor                             5532   paid-media/paid-media-auditor.md
      paid_media_creative_strategist                 5137   paid-media/paid-media-creative-strategist.md
      paid_media_paid_social_strategist              5422   paid-media/paid-media-paid-social-strategist.md
      paid_media_ppc_strategist                      4972   paid-media/paid-media-ppc-strategist.md
      paid_media_programmatic_buyer                  5261   paid-media/paid-media-programmatic-buyer.md
      paid_media_search_query_analyst                4920   paid-media/paid-media-search-query-analyst.md
      paid_media_tracking_specialist                 5303   paid-media/paid-media-tracking-specialist.md
      sales_account_strategist                      14804   sales/sales-account-strategist.md
      sales_coach                                   20933   sales/sales-coach.md
      sales_deal_strategist                         13622   sales/sales-deal-strategist.md
      sales_discovery_coach                         13423   sales/sales-discovery-coach.md
      sales_engineer                                13894   sales/sales-engineer.md
      sales_outbound_strategist                     10704   sales/sales-outbound-strategist.md
      sales_pipeline_analyst                        18731   sales/sales-pipeline-analyst.md
      sales_proposal_strategist                     14231   sales/sales-proposal-strategist.md

B · REGISTRY-SOURCED (7/7) · source = managed_agents_registry.identity_md
    Agents table uses underscore slug · registry uses hyphenated · alias map (agent-alias-map.ts:17) bridges
    identity_source = 'registry:managed_agents_registry:<hyphenated-slug> · backfill-35-placeholder-identities · 2026-05-16 Emilio approved'

      slug (agents)                  chars   registry slug
      ────────────────────────────   ──────  ──────────────────────────
      account_manager                 6720   account-manager
      brand_strategist                5082   brand-strategist
      community_manager               4070   community-manager
      editor_en_jefe                  4453   editor-en-jefe
      jefe_client_success             4736   jefe-client-success
      onboarding_specialist           5941   onboarding-specialist
      reporting_agent                 5606   reporting-agent

C · DEFERRED (4/4) · content stays 'pending-identity' (16 chars) · source-tag only updated
    No canonical exact match · no registry.identity_md · no local src/agents/identities/{slug}.md
    Semantic candidates exist in canonical repo (see .tmp-backfill-35/_tree.txt for full audit) but
    DO NOT autopopulate per CLAUDE.md protocol · awaiting project-local authoring decision.
    identity_source = 'deferred:no-canonical-no-registry-no-local · backfill-35-placeholder-identities audit 2026-05-16 · awaiting project-local authoring decision per CLAUDE.md governance section'

      slug                              semantic candidate (audit) · NOT applied
      ───────────────────────────────   ────────────────────────────────────────
      customer_research_agent           product/product-trend-researcher.md (10482 chars)
      influencer_partnerships_manager   marketing/marketing-social-media-strategist.md (7414 chars)
      market_research_analyst           product/product-trend-researcher.md (10482 chars)
      video_editor_motion_designer      marketing/marketing-short-video-editing-coach.md (30779 chars)

==========================================================================

Post-fix verify (executed via REST query):
  SELECT count(*) FROM agents WHERE identity_content = 'pending-identity';
  → 4 (matches the deferred set above)

  SELECT name, length(identity_content) FROM agents WHERE name IN (
    'marketing_seo_specialist', 'paid_media_creative_strategist', 'sales_coach',
    'brand_strategist', 'editor_en_jefe'
  );
  →
    brand_strategist                  5082
    editor_en_jefe                    4453
    marketing_seo_specialist         17932
    paid_media_creative_strategist    5137
    sales_coach                      20933

Forensic refs · Slack #equipo C0B2QCDMV7Y · this dispatch.
*/

-- No DDL/DML in this file · data applied via service-role REST. Keep as
-- documentation. To replay the same writes, run the script:
--   node scripts/backfill-35-placeholder-identities.mjs

SELECT 'backfill-35-placeholder-identities · documentation-only · run scripts/backfill-35-placeholder-identities.mjs to replay' AS migration_note;
