# @zero-risk/dataforseo-mcp-server

MCP server exposing DataForSEO (`https://api.dataforseo.com/`) as Claude tools.

**Status:** Scaffold only · Block 11 of CC#1 sprint 2026-05-07.

**Pricing:** pay-per-use (~$0.0006/SERP call) · client estimates cost per call.

## Tools (planned · 12)

| Tool | Args |
|---|---|
| `dfs_serp_google` | `{keyword, location, language, depth?}` |
| `dfs_serp_bing` | `{keyword, location, language}` |
| `dfs_serp_youtube` | `{keyword, language}` |
| `dfs_keywords_for_keyword` | `{keyword, location, language}` |
| `dfs_keywords_for_site` | `{target, location, language}` |
| `dfs_search_volume` | `{keywords[], location}` |
| `dfs_keyword_difficulty` | `{keywords[], location}` |
| `dfs_competitors_domain` | `{target, location}` |
| `dfs_competitors_intersections` | `{targets[]}` |
| `dfs_backlinks_summary` | `{target}` |
| `dfs_referring_domains` | `{target, limit?}` |
| `dfs_content_analysis` | `{keyword, content_url}` |

## Required env

```
DATAFORSEO_LOGIN=<from Vault>
DATAFORSEO_PASSWORD=<from Vault>
```

Auth uses HTTP Basic with `login:password` base64-encoded in the `Authorization` header.

## Connect

```json
{
  "mcpServers": {
    "zr-dataforseo": {
      "command": "node",
      "args": ["<repo>/zero-risk-platform/packages/dataforseo-mcp-server/dist/index.js"],
      "env": { "DATAFORSEO_LOGIN": "...", "DATAFORSEO_PASSWORD": "..." }
    }
  }
}
```
