#!/usr/bin/env node
/**
 * @zero-risk/dataforseo-mcp-server · MCP entrypoint (scaffold).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { DFSClient } from './client.js'
import * as dfsKeywordsForKeyword from './tools/dfs-keywords-for-keyword.js'

const LOGIN = process.env.DATAFORSEO_LOGIN ?? ''
const PASSWORD = process.env.DATAFORSEO_PASSWORD ?? ''
if (!LOGIN || !PASSWORD) {
  console.error('[dfs-mcp] Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD env')
  process.exit(1)
}

const client = new DFSClient({ login: LOGIN, password: PASSWORD })

const HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  [dfsKeywordsForKeyword.name]: (args) => dfsKeywordsForKeyword.handler(client, args),
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  { name: 'dfs_serp_google', description: 'Google SERP (organic) for a keyword', inputSchema: shape(['keyword', 'location', 'language'], { keyword: 'string', location: 'string', language: 'string', depth: 'number' }) },
  { name: 'dfs_serp_bing', description: 'Bing SERP for a keyword', inputSchema: shape(['keyword', 'location', 'language'], { keyword: 'string', location: 'string', language: 'string' }) },
  { name: 'dfs_serp_youtube', description: 'YouTube SERP for a keyword', inputSchema: shape(['keyword', 'language'], { keyword: 'string', language: 'string' }) },
  { name: 'dfs_keywords_for_keyword', description: 'Keyword ideas + monthly volume for a seed', inputSchema: shape(['keyword', 'location', 'language'], { keyword: 'string', location: 'string', language: 'string' }) },
  { name: 'dfs_keywords_for_site', description: 'Keywords a target domain ranks for', inputSchema: shape(['target', 'location', 'language'], { target: 'string', location: 'string', language: 'string' }) },
  { name: 'dfs_search_volume', description: 'Monthly search volume for a list of keywords', inputSchema: shape(['keywords', 'location'], { keywords: 'string[]', location: 'string' }) },
  { name: 'dfs_keyword_difficulty', description: 'KD score for a list of keywords', inputSchema: shape(['keywords', 'location'], { keywords: 'string[]', location: 'string' }) },
  { name: 'dfs_competitors_domain', description: 'Domains that compete with a target', inputSchema: shape(['target', 'location'], { target: 'string', location: 'string' }) },
  { name: 'dfs_competitors_intersections', description: 'Keyword overlap across N domains', inputSchema: shape(['targets'], { targets: 'string[]' }) },
  { name: 'dfs_backlinks_summary', description: 'Backlinks summary for a target', inputSchema: shape(['target'], { target: 'string' }) },
  { name: 'dfs_referring_domains', description: 'Referring domains for a target', inputSchema: shape(['target'], { target: 'string', limit: 'number' }) },
  { name: 'dfs_content_analysis', description: 'On-page content analysis vs target keyword', inputSchema: shape(['keyword', 'content_url'], { keyword: 'string', content_url: 'string' }) },
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
  { name: 'zero-risk-dataforseo', version: '0.1.0' },
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
console.error('[dfs-mcp] connected · scaffold-mode')
