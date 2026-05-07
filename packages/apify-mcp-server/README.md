# @zero-risk/apify-mcp-server

MCP server exposing Apify scrapers (`https://api.apify.com/v2/`) as Claude tools.

**Status:** Scaffold only · Block 11 of CC#1 sprint 2026-05-07.

## Tools (planned · 6)

| Tool | Args |
|---|---|
| `apify_meta_ads_search` | `{search_terms[], country, ad_active_status?}` |
| `apify_google_ads_search` | `{advertiser, country, time_range?}` |
| `apify_tiktok_ads_search` | `{country, industry?, period?}` |
| `apify_run_actor` | `{actor_id, input, wait_for_finish?}` |
| `apify_get_run_status` | `{run_id}` |
| `apify_get_dataset` | `{dataset_id, limit?}` |

Actor IDs:
- Meta Ads Library: `apify/facebook-ads-scraper`
- Google Ads Library: `apify/google-ads-scraper`
- TikTok Ads: `apify/tiktok-creative-center-scraper`

## Required env

```
APIFY_TOKEN=<from Vault credential 'apify-token'>
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
