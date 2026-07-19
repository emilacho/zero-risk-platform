# @zero-risk/apify-mcp-server

MCP server exposing Apify scrapers (`https://api.apify.com/v2/`) as Claude tools.

**Status:** Ciclo CANDADO #1 (2026-07-19) · las funciones que el flujo de verificación
necesita están implementadas. Los 3 ad-search siguen como stubs (on-demand).

## Tools

| Tool | Estado | Args |
|---|---|---|
| `apify_run_actor` | ✅ | `{actor_id, input, wait_for_finish?, timeout_ms?}` |
| `apify_get_dataset` | ✅ | `{dataset_id, limit?, offset?}` |
| `apify_get_run_status` | ✅ | `{run_id}` → `{status, dataset_id, is_terminal, ok, ...}` |
| `apify_scrape_competitor_profile` | ✅ | `{name, handle?/website?, platform?, actor_id?, competitor_type?, timeout_ms?}` |
| `apify_meta_ads_search` | ⏳ stub | `{search_terms[], country, ad_active_status?}` |
| `apify_google_ads_search` | ⏳ stub | `{advertiser, country, time_range?}` |
| `apify_tiktok_ads_search` | ⏳ stub | `{country, industry?, period?}` |

`apify_scrape_competitor_profile` corre sobre los primitivos (`run_actor` + `get_dataset`
vía `client.runActorAndCollect`) y devuelve un competidor normalizado con procedencia REAL
`apify_scrape` + `deep_scan_data` (followers/bio/etc.) · feed-compatible con
`persistDiscoveryToBrain` (el wiring lo pasa al writer del CEREBRO). Un run vacío NO emite
`apify_scrape` (§148 · sin scrape no hay tag).

Actor IDs:
- Meta Ads Library: `apify/facebook-ads-scraper` · Google Ads: `apify/google-ads-scraper`
- TikTok Ads: `apify/tiktok-creative-center-scraper`
- Competitor IG profile: `apify/instagram-profile-scraper` (default · env `APIFY_IG_PROFILE_ACTOR`)
- Competitor web: `apify/website-content-crawler` (default · env `APIFY_WEB_ACTOR`)

## Required env

```
APIFY_API_TOKEN=<from Vault credential 'apify-token'>   # APIFY_TOKEN aceptado como alias legacy
```

## Connect

```json
{
  "mcpServers": {
    "zr-apify": {
      "command": "node",
      "args": ["<repo>/zero-risk-platform/packages/apify-mcp-server/dist/index.js"],
      "env": { "APIFY_TOKEN": "..." }
    }
  }
}
```
