# Ola 2 Deployment Guide — Creative + SEO + Paid Media P0s

**7 workflows + 2 internal API routes + 15 Supabase tables. Estimated time: 2-3 hours (includes credential setup).**

**⚠️ BLOCKED on FASE B signups.** Unlike Ola 1 (self-contained orchestration), Ola 2 requires external service credentials that Emilio hasn't yet configured. This guide documents what's pre-staged + what's blocked + how to unblock.

---

## What's pre-staged (Session 27c autonomous)

### SQL migration
- **`sql/ola_2_creative_seo_paid.sql`** (15 new tables across Clusters 2, 3, 4)
  - Cluster 2 (Creative): `rsa_headline_library`, `landing_experiments`, `content_repurposing_queue`, `creative_performance_insights`, `ad_creative_refreshes`
  - Cluster 3 (SEO & GEO): `cannibalization_audits`, `content_refresh_queue`, `backlink_opportunities`, `topical_authority_maps`, `indexation_log`
  - Cluster 4 (Paid): `attribution_audits`, `incrementality_tests`, `message_match_audits`, `cro_experiments`, `ad_performance_snapshots`

### API routes pre-built (7 — both internal + external with env-gated activation)

**Internal (work immediately, no external credentials needed):**
1. **`/api/analytics/active-campaigns`** (GET) — enumerate active campaigns (reads `campaigns` table + `ad_performance_snapshots` fallback)
2. **`/api/tracking/attribution-audits`** (POST, GET) — write cross-platform attribution discrepancies
3. **`/api/seo/cannibalization-store`** (POST, GET) — persist cannibalization audits from GSC scans

**External proxies (code complete, activate when env vars set):**
4. **`/api/meta-ads/campaigns`** (GET) — proxy to Meta Graph API v21 for campaign listing. Returns 503 if `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` not set.
5. **`/api/meta-ads/spend-data`** (GET) — proxy for insights endpoint (spend, impressions, clicks, conversions, ROAS normalized). Used by Attribution Validator.
6. **`/api/meta-ads/apply-optimization`** (POST) — executes optimizations on Meta (pause/resume/update_budget/kill_creative) with dry_run safety default + audit logging to `ad_creative_refreshes`.
7. **`/api/ga4/conversion-data`** (GET) — proxy to Google Analytics Data API v1beta using service-account JWT flow (no library deps, self-contained). Normalizes rows by source/medium/campaign.

All external routes return **503 with clear `missing` field listing missing env vars** if credentials not configured — so they never 500 unexpectedly and the error message tells Emilio exactly what to set.

### Workflow URL alignment
Updated 4 Cluster 4 workflows to use V3 HITL paths (`/api/hitl/approvals/create` instead of legacy `/api/hitl/queue`), matching Ola 1 conventions.

---

## What's BLOCKED (requires FASE B signups + env var setup)

### Required external service credentials

| Service | Env var | Blocks these workflows |
|---|---|---|
| Meta Ads Business API | `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` | Creative Fatigue Auto-Refresh, Meta Ads v2, TikTok+LinkedIn, Attribution Validator, Incrementality Test Runner |
| Google Ads API | `GOOGLE_ADS_DEVELOPER_TOKEN` + OAuth refresh token + `GOOGLE_ADS_CUSTOMER_ID` | Google PMax, Attribution Validator |
| TikTok Business API | `TIKTOK_ACCESS_TOKEN` | TikTok+LinkedIn Manager, Attribution Validator |
| LinkedIn Marketing API | `LINKEDIN_ACCESS_TOKEN` | TikTok+LinkedIn Manager |
| GA4 | `GA4_SERVICE_ACCOUNT_KEY` (JSON blob) | Attribution Validator |
| Google Search Console | `GSC_SERVICE_ACCOUNT_KEY` (JSON blob) | Cannibalization Audit Weekly |
| DataForSEO | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Topical Authority Builder, SEO Rank-to-#1 v2, Backlink Scanner |
| Apify | `APIFY_TOKEN` | GEO Content Freshness, Backlink Scanner, SEO Rank-to-#1 v2 |
| PostHog Personal API | `POSTHOG_PERSONAL_API_KEY` | Landing A/B Deployer, CRO Optimizer v2 |
| Vercel API | `VERCEL_API_TOKEN` | Landing A/B Deployer |

All listed in SESSION_25_HANDOFF FASE B (signups) + FASE E (credentials). Complete those first.

### API routes NOT YET BUILT (6 remaining for full Ola 2)

After Session 27c's autonomous build, **5 of the 11 previously-listed routes are now pre-built** (see section above). Remaining:

| Route | External API | Referenced by |
|---|---|---|
| `/api/google-ads/pmax-campaigns` | Google Ads API (requires OAuth2 refresh token flow) | Google PMax |
| `/api/google-ads/asset-group-health` | Google Ads API | Google PMax |
| `/api/google-ads/campaign-performance` | Google Ads API | Google PMax |
| `/api/google-ads/spend-data` | Google Ads API | Attribution Validator |
| `/api/tiktok-ads/spend-data` | TikTok Business API v1.3 | Attribution Validator |
| `/api/seo/content-refresh-enqueue` | (internal) writes to content_refresh_queue | GEO Content Freshness |

**Pattern for these**: follow the same template as the 5 pre-built proxy routes. Google Ads requires a 2-step OAuth: the refresh token + developer token + customer_id → exchange for access token → call GAQL endpoint. TikTok is simpler (access token directly).

**Priority if building incrementally**:
1. `/api/seo/content-refresh-enqueue` (internal, 20 min) — unblocks GEO Content Freshness
2. `/api/google-ads/campaign-performance` (external, 1h) — unblocks basic Google Ads reporting
3. Remaining Google Ads + TikTok when needed

---

## Deployment sequence (when credentials ready)

### Step 1 — Apply SQL migration (5 min)

```powershell
Get-Content "C:\Users\emila\Documents\Claude\Projects\Agentic Business Agency\zero-risk-platform\sql\ola_2_creative_seo_paid.sql" | Set-Clipboard
```

Paste in Supabase SQL Editor → Run. Verify 15 new tables:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (
  'rsa_headline_library','landing_experiments','content_repurposing_queue','creative_performance_insights',
  'cannibalization_audits','content_refresh_queue','backlink_opportunities','topical_authority_maps','indexation_log',
  'attribution_audits','incrementality_tests','message_match_audits','ad_creative_refreshes','cro_experiments','ad_performance_snapshots'
);
-- Should return: 15
```

### Step 2 — Complete FASE B signups (1-2 hours)

Per `docs/07-sesiones/SESSION_25_HANDOFF.md` FASE B:
- B2 DataForSEO (~$50 prepay) → get `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`
- B3 Apify (Free tier) → get `APIFY_TOKEN`
- B4 Notion Plus → get `NOTION_API_KEY` + `NOTION_PARENT_PAGE_ID` (for QBR gen, not strictly Ola 2)
- Meta for Developers → create App + System User Token → `META_ACCESS_TOKEN`
- Google Ads API → OAuth refresh token flow → `GOOGLE_ADS_DEVELOPER_TOKEN` + OAuth creds
- TikTok Business → API access → `TIKTOK_ACCESS_TOKEN`
- Google Cloud service accounts → GA4 + GSC JSON blobs
- (Optional Cluster 2) Vercel API token for A/B deployer

Add each env var to **both** Vercel + n8n.

### Step 3 — Build remaining 11 API routes (2-3 hours, incremental)

For each blocked route, create `src/app/api/<path>/route.ts` following the Ola 1 pattern:
1. `checkInternalKey()` guard
2. Parse body/query params
3. Call external API with the env var token (use built-in `fetch` with 30s timeout)
4. Normalize response shape to what the workflow expects
5. Return JSON

Reference: look at Ola 1's `evidence/validate/route.ts` or `agent-outcomes/write/route.ts` for the template.

**Recommended order** (by unblock value):
1. `/api/meta-ads/campaigns` + `/api/meta-ads/apply-optimization` → unblocks Creative Fatigue Auto-Refresh (killer feature, uses GPT Image 1.5 which is already LIVE)
2. `/api/seo/cannibalization-store` + GSC OAuth → unblocks Cannibalization Audit (P0 guardrail)
3. `/api/meta-ads/spend-data` + `/api/ga4/conversion-data` → unblocks Attribution Validator
4. Remaining Google Ads + TikTok routes

### Step 4 — Import workflows + activate (per Ola 1 protocol)

For each workflow in `n8n-workflows/proposed-sesion27b/0{2,3,4}-*/`:
1. Import JSON
2. Configure credentials (env vars from step 2)
3. Smoke test with small/test client
4. Activate

**Activation order (by dependency)**:
1. `attribution-audits` standalone writes (no external deps — test with `/api/tracking/attribution-audits`)
2. `cannibalization-audit-weekly` (requires GSC)
3. `meta-ads-full-stack-optimizer-v2` (requires Meta Ads)
4. `creative-fatigue-auto-refresh` (requires Meta + OpenAI)
5. `cross-platform-attribution-validator` (requires Meta + Google + TikTok + GA4)
6. `google-ads-performance-max-optimizer` (requires Google Ads)
7. `geo-content-freshness-cron` (requires Apify)
8. `flagship-seo-rank-to-one-v2` (requires DataForSEO + Apify)

---

## Value unlocked by Ola 2

Even partial Ola 2 (e.g., just Meta Ads workflows) delivers measurable business value:

- **Creative Fatigue Auto-Refresh** (P0): detects ads losing CTR, regenerates with GPT Image 1.5, swapes automatically. Direct ROAS protection.
- **Cannibalization Audit** (P0): prevents the silent #1 SEO ranking killer in mature sites.
- **Attribution Validator** (P0): catches tracking drift before it misleads optimization algorithms.
- **Meta Ads v2**: tier-aware optimization (beta/scaling/efficient/mature) + diminishing returns modeling.
- **SEO Rank-to-#1 v2**: orchestrated multi-agent SEO pipeline with hallucination validation.

---

## Current blocker summary

**Emilio action required**: complete FASE B signups (est. 1-2 hours) before any meaningful Ola 2 activation possible.

**Claude action required** (future session): build the 11 remaining API routes (est. 2-3 hours once credentials are online).

**Recommendation**: commit this pre-stage + move to Ola 1 activation first (it's fully unblocked). Return to Ola 2 after FASE B done.

---

Generated: Session 27c (autonomous pre-stage). Ola 2 infrastructure ready; deployment gated on FASE B.
