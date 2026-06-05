#!/usr/bin/env node
// =============================================================
// Discovery Output MCP Server (Railway · stdio · CJS)
//
// Spec · SPEC-lazo-agentico-discovery-scraping-brain-2026-06-05 · CC#3 follow-up.
// Canon · Lenovo + CC#4 confirmed "Opción 1 = tool call emit_discovery_output"
//         as the linchpin · this server is the canonical structured-output
//         surface for the Auto-Discovery agent.
//
// Single tool · `emit_discovery_output` · agent invokes with a structured
// JSON payload matching the canonical DiscoveryOutput shape. The agent SDK
// validates the args against the zod schema BEFORE calling this tool · so
// every tool_use block visible to the parent runner is GUARANTEED to be
// valid (per SDK contract). The runner captures the tool_use blocks from
// the assistant content stream · this server's reply is just an
// acknowledgement.
//
// Why MCP / stdio · matches the existing client-brain-server pattern ·
// the agent-sdk-runner already spawns MCP servers via Stdio transport ·
// no new infrastructure needed.
//
// Launched by agent-sdk-runner.ts only for agents in the discovery-output
// allow-list (see agent-mcp-registry.ts) · gated by
// SALA_DISCOVERY_BRAIN_PUSH_ENABLED so disabled = MCP not spawned.
//
// Inherits env vars from parent · uses none directly. CLIENT_ID may be
// optionally passed for diagnostic logging only.
// =============================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')

const CLIENT_ID = process.env.CLIENT_ID || ''

// ── zod schema · matches DiscoveryOutput TS interface byte-aligned ──
// Mirror of `src/lib/discovery-output/types.ts · DiscoveryOutput`.
// IMPORTANT · keep in sync · validateDiscoveryShape (TS) and this schema
// (JS) must accept the SAME shapes · tests cover round-trip equivalence.

const socialHandles = z
  .object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    tiktok: z.string().optional(),
    linkedin: z.string().optional(),
    youtube: z.string().optional(),
  })
  .strict()

const competitorSchema = z
  .object({
    name: z.string().min(1).describe('Canonical competitor name'),
    website: z.string().url().optional(),
    handles: socialHandles.optional(),
    why: z
      .string()
      .optional()
      .describe('1-2 sentence justification why this competitor is relevant'),
    competitor_type: z
      .enum(['direct', 'indirect', 'aspirational', 'alternative'])
      .optional()
      .describe('Competitor type · defaults to direct'),
    positioning: z
      .string()
      .optional()
      .describe('Competitor positioning summary · feeds value_proposition'),
  })
  .strict()

const icpSegmentSchema = z
  .object({
    audience_segment: z.string().min(1),
    segment_priority: z.number().int().min(1).optional(),
    job_titles: z.array(z.string()).optional(),
    company_size: z.string().optional(),
    industries: z.array(z.string()).optional(),
    geography: z.string().optional(),
    goals: z.array(z.string()).optional(),
    pain_points: z.array(z.string()).optional(),
    jobs_to_be_done: z.array(z.string()).optional(),
    objections: z.array(z.string()).optional(),
    buying_process: z.string().optional(),
    decision_criteria: z.array(z.string()).optional(),
    budget_range: z.string().optional(),
    preferred_channels: z.array(z.string()).optional(),
    content_preferences: z.string().optional(),
  })
  .strict()

const DISCOVERY_INPUT_SCHEMA = {
  client_id: z
    .string()
    .uuid()
    .describe(
      'UUID of the client · MUST match the client_id passed by the orchestrator',
    ),
  own_handles: socialHandles.describe(
    'Social handles of the agency CLIENT itself (not competitors)',
  ),
  competitors: z
    .array(competitorSchema)
    .min(0)
    .describe(
      '3-8 competitors discovered for this client · empty allowed but logged',
    ),
  icp: z
    .union([icpSegmentSchema, z.array(icpSegmentSchema).min(1)])
    .optional()
    .describe('1-3 ICP segments · single object OR array of segments'),
  competitive_landscape_summary: z
    .string()
    .optional()
    .describe(
      '1-2 paragraph summary of the competitive landscape · chunked verbatim into the brain',
    ),
}

// ── MCP server ──
const server = new McpServer({
  name: 'discovery-output',
  version: '1.0.0',
})

server.registerTool(
  'emit_discovery_output',
  {
    title: 'Emit Discovery Output',
    description:
      'Emit the FINAL structured Discovery output for this client · own_handles + competitors + icp + competitive landscape summary. Call this ONCE at the end of your investigation when you have gathered enough evidence (web search + web fetch of client + competitor pages). The args are validated against a strict schema · invalid shapes are rejected. Pass the client_id verbatim as received in the task context.',
    inputSchema: DISCOVERY_INPUT_SCHEMA,
  },
  async (args) => {
    const counts = {
      competitors: Array.isArray(args.competitors) ? args.competitors.length : 0,
      icp_segments: Array.isArray(args.icp) ? args.icp.length : args.icp ? 1 : 0,
      handles_filled: Object.values(args.own_handles ?? {}).filter(Boolean).length,
      has_summary: !!args.competitive_landscape_summary,
    }
    // Side-channel diagnostic only (parent reads tool_use from SDK stream ·
    // does NOT rely on stderr). Helps observability when running locally.
    process.stderr.write(
      `[discovery-output-server] emit_discovery_output received · client=${args.client_id} · ` +
        `competitors=${counts.competitors} · icp=${counts.icp_segments} · handles=${counts.handles_filled}\n`,
    )
    return {
      content: [
        {
          type: 'text',
          text:
            `OK · Discovery received for client ${args.client_id} · ` +
            `${counts.competitors} competitors · ${counts.icp_segments} ICP segments · ` +
            `${counts.handles_filled} own_handles · summary=${counts.has_summary ? 'yes' : 'no'}. ` +
            'You may now stop · the platform will persist this to the Client Brain + clients.config.',
        },
      ],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(
    `[discovery-output-server] Started for client=${CLIENT_ID || '(none)'}\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[discovery-output-server] Fatal: ${err.message}\n`)
  process.exit(1)
})
