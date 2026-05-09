#!/usr/bin/env node
/**
 * @zero-risk/higgsfield-mcp-server · MCP entrypoint (scaffold).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { HiggsfieldClient } from './client.js'
import * as higgsfieldListStyles from './tools/higgsfield-list-styles.js'
import * as higgsfieldGenerateVideo from './tools/higgsfield-generate-video.js'

const API_KEY = process.env.HIGGSFIELD_API_KEY ?? ''
const WEBHOOK_URL = process.env.HIGGSFIELD_WEBHOOK_URL
if (!API_KEY) {
  console.error('[higgs-mcp] Missing HIGGSFIELD_API_KEY env')
  process.exit(1)
}

const client = new HiggsfieldClient({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL })

const HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  [higgsfieldListStyles.name]: (args) => higgsfieldListStyles.handler(client, args),
  [higgsfieldGenerateVideo.name]: (args) => higgsfieldGenerateVideo.handler(client, args),
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  { name: 'higgsfield_generate_video', description: 'Generate a video from a text prompt (Seedance 2.0)', inputSchema: shape(['prompt', 'aspect', 'duration_sec'], { prompt: 'string', aspect: 'string', duration_sec: 'number', style: 'string' }) },
  { name: 'higgsfield_get_status', description: 'Get job status and (when ready) result URL', inputSchema: shape(['job_id'], { job_id: 'string' }) },
  { name: 'higgsfield_list_styles', description: 'List available generation styles', inputSchema: { type: 'object', properties: {} } },
  { name: 'higgsfield_image_to_video', description: 'Animate an image with a motion prompt', inputSchema: shape(['image_url', 'motion_prompt', 'duration_sec'], { image_url: 'string', motion_prompt: 'string', duration_sec: 'number' }) },
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
  { name: 'zero-risk-higgsfield', version: '0.1.0' },
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
console.error('[higgs-mcp] connected · scaffold-mode')
