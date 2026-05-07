#!/usr/bin/env node
/**
 * @zero-risk/ghl-mcp-server · MCP entrypoint (scaffold).
 *
 * Tools are listed but their handlers throw `not_implemented` until the
 * implementation sprint wires them to the real GoHighLevel API.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { GHLClient } from './client.js'
import * as ghlSearchContacts from './tools/ghl-search-contacts.js'

const PRIVATE_KEY = process.env.GHL_PRIVATE_KEY ?? ''
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? ''

if (!PRIVATE_KEY || !LOCATION_ID) {
  console.error('[ghl-mcp] Missing GHL_PRIVATE_KEY or GHL_LOCATION_ID env')
  process.exit(1)
}

const client = new GHLClient({ privateKey: PRIVATE_KEY, locationId: LOCATION_ID })

// Map of tools that have real handlers. Tools listed in TOOLS but absent
// from HANDLERS still respond with status=not_implemented during the
// per-tool implementation sprint.
const HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  [ghlSearchContacts.name]: (args) => ghlSearchContacts.handler(client, args),
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  { name: 'ghl_create_contact', description: 'Create a contact in GoHighLevel', inputSchema: shape(['firstName'], { firstName: 'string', lastName: 'string', email: 'string', phone: 'string', tags: 'string[]' }) },
  { name: 'ghl_search_contacts', description: 'Search contacts by query string', inputSchema: shape(['query'], { query: 'string', limit: 'number' }) },
  { name: 'ghl_update_contact', description: 'Update a contact by id', inputSchema: shape(['contactId', 'fields'], { contactId: 'string', fields: 'object' }) },
  { name: 'ghl_add_tag', description: 'Add tags to a contact', inputSchema: shape(['contactId', 'tags'], { contactId: 'string', tags: 'string[]' }) },
  { name: 'ghl_send_whatsapp', description: 'Send a WhatsApp message via GHL conversation', inputSchema: shape(['contactId', 'message'], { contactId: 'string', message: 'string' }) },
  { name: 'ghl_send_email', description: 'Send an email via GHL conversation', inputSchema: shape(['contactId', 'subject', 'htmlBody'], { contactId: 'string', subject: 'string', htmlBody: 'string', replyToEmail: 'string' }) },
  { name: 'ghl_get_conversation', description: 'Fetch a conversation thread', inputSchema: shape(['conversationId'], { conversationId: 'string' }) },
  { name: 'ghl_create_opportunity', description: 'Create a pipeline opportunity', inputSchema: shape(['pipelineId', 'contactId', 'name'], { pipelineId: 'string', contactId: 'string', name: 'string', monetaryValue: 'number', status: 'string' }) },
  { name: 'ghl_move_opportunity', description: 'Move an opportunity to a new stage', inputSchema: shape(['opportunityId', 'newStageId'], { opportunityId: 'string', newStageId: 'string' }) },
  { name: 'ghl_list_pipelines', description: 'List all pipelines and their stages', inputSchema: { type: 'object', properties: {} } },
  { name: 'ghl_book_appointment', description: 'Book a calendar appointment', inputSchema: shape(['calendarId', 'contactId', 'slotIso', 'duration_min'], { calendarId: 'string', contactId: 'string', slotIso: 'string', duration_min: 'number' }) },
  { name: 'ghl_get_available_slots', description: 'Get available calendar slots', inputSchema: shape(['calendarId', 'dateRange'], { calendarId: 'string', dateRange: 'object' }) },
  { name: 'ghl_get_form_submissions', description: 'Get form submissions since a date', inputSchema: shape(['formId', 'since'], { formId: 'string', since: 'string' }) },
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
  { name: 'zero-risk-ghl', version: '0.1.0' },
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
      {
        type: 'text',
        text: JSON.stringify({ status: 'not_implemented', tool: tool.name, scaffold_version: '0.1.0' }),
      },
    ],
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[ghl-mcp] connected · scaffold-mode (handlers stubbed)')
