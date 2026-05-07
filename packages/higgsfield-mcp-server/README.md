# @zero-risk/higgsfield-mcp-server

MCP server exposing Higgsfield Lite (Seedance 2.0 video generation) as Claude tools.

**Status:** Scaffold only · Block 11 of CC#1 sprint 2026-05-07.

## Tools (planned · 4)

| Tool | Args |
|---|---|
| `higgsfield_generate_video` | `{prompt, aspect, duration_sec, style?}` |
| `higgsfield_get_status` | `{job_id}` |
| `higgsfield_list_styles` | `{}` |
| `higgsfield_image_to_video` | `{image_url, motion_prompt, duration_sec}` |

## Required env

```
HIGGSFIELD_API_KEY=<from Vault>
HIGGSFIELD_WEBHOOK_URL=<optional · destination for completion callbacks>
```

## Connect

```json
{
  "mcpServers": {
    "zr-higgsfield": {
      "command": "node",
      "args": ["<repo>/zero-risk-platform/packages/higgsfield-mcp-server/dist/index.js"],
      "env": { "HIGGSFIELD_API_KEY": "..." }
    }
  }
}
```
