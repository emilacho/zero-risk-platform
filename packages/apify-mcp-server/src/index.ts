#!/usr/bin/env node
/**
 * @zero-risk/apify-mcp-server · MCP entrypoint (scaffold).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ApifyClient } from './client.js'
import * as apifyGetDataset from './tools/apify-get-dataset.js'
import * as apifyRunActor from './tools/apify-run-actor.js'
import * as apifyGetRunStatus from './tools/apify-get-run-status.js'
import * as apifyScrapeCompetitorProfile from './tools/apify-scrape-competitor-profile.js'

// El env real del proyecto es `APIFY_API_TOKEN` · aceptamos `APIFY_TOKEN` como alias
// legacy (el scaffold original lo leía · mismatch detectado 2026-07-19).
const TOKEN = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? ''
if (!TOKEN) {
  console.error('[apify-mcp] Missing APIFY_API_TOKEN (o APIFY_TOKEN) env')
  process.exit(1)
}

const client = new ApifyClient({ token: TOKEN })

const HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  [apifyGetDataset.name]: (args) => apifyGetDataset.handler(client, args),
  [apifyRunActor.name]: (args) => apifyRunActor.handler(client, args),
  [apifyGetRunStatus.name]: (args) => apifyGetRunStatus.handler(client, args),
  [apifyScrapeCompetitorProfile.name]: (args) =>
    apifyScrapeCompetitorProfile.handler(client, args),
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  { name: 'apify_meta_ads_search', description: 'Search Meta Ads Library via apify/facebook-ads-scraper', inputSchema: shape(['search_terms', 'country'], { search_terms: 'string[]', country: 'string', ad_active_status: 'string' }) },
  { name: 'apify_google_ads_search', description: 'Search Google Ads Library via apify/google-ads-scraper', inputSchema: shape(['advertiser', 'country'], { advertiser: 'string', country: 'string', time_range: 'string' }) },
  { name: 'apify_tiktok_ads_search', description: 'Search TikTok Creative Center via apify/tiktok-creative-center-scraper', inputSchema: shape(['country'], { country: 'string', industry: 'string', period: 'string' }) },
  { name: 'apify_run_actor', description: 'Run an arbitrary Apify actor and optionally wait for completion', inputSchema: shape(['actor_id', 'input'], { actor_id: 'string', input: 'object', wait_for_finish: 'boolean' }) },
  { name: 'apify_get_run_status', description: 'Get the status of an actor run', inputSchema: shape(['run_id'], { run_id: 'string' }) },
  { name: 'apify_get_dataset', description: 'Fetch items from a dataset', inputSchema: shape(['dataset_id'], { dataset_id: 'string', limit: 'number' }) },
  { name: 'apify_scrape_competitor_profile', description: 'Scrape a competitor profile (Instagram/web) → normalized competitor with real apify_scrape provenance + deep_scan_data', inputSchema: shape(['name'], { name: 'string', handle: 'string', website: 'string', platform: 'string', actor_id: 'string', competitor_type: 'string' }) },
]

function shape(required: string[], props: Record<string, string>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, type] of Object.entries(props)) {
    if (type.endsWith('[]')) properties[key] = { type: 'array', items: { type: type.slice(0, -2) } }
    else properties[key] = { type }
  }
  return { type: 'object', required, properties }
}

const server = new Server(
  { name: 'zero-risk-apify', version: '0.1.0' },
  { capabilities: { tools: {} } },
)
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name)
  if (!tool) throw new Error(`Unknown tool: ${request.params.name}`)
  const realHandler = HANDLERS[tool.name]
  if (realHandler) {
    try {
      const result = await realHandler(request.params.arguments)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              tool: tool.name,
            }),
          },
        ],
        isError: true,
      }
    }
  }
  return {
    content: [
      { type: 'text', text: JSON.stringify({ status: 'not_implemented', tool: tool.name, scaffold_version: '0.1.0' }) },
    ],
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[apify-mcp] connected · scaffold-mode')
