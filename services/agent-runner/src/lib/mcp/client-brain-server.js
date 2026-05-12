#!/usr/bin/env node
// =============================================================
// Zero Risk V3 — MCP Client Brain Server (Railway copy)
// Stdio MCP server that exposes Client Brain RAG as tools
// for Managed Agents running via the Claude Agent SDK.
//
// Launched by agent-sdk-runner.ts with:
//   command: 'node'
//   args: [<services/agent-runner/cwd>/src/lib/mcp/client-brain-server.js']
//   env: { CLIENT_ID: '<uuid>' }
//
// Requires env vars (inherited from parent process):
//   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   CLIENT_ID (passed per-invocation)
//
// Sibling package.json with {"type":"commonjs"} forces CJS mode for this
// file even though the parent services/agent-runner/package.json declares
// the service as ESM ("type":"module"). This is intentional — keeps the
// file bit-identical to zero-risk-platform/src/lib/mcp/client-brain-server.js
// so a future shared package extraction is a trivial move.
// =============================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')

// ── Config ──────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const CLIENT_ID = process.env.CLIENT_ID || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  process.stderr.write(
    '[client-brain-server] ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n'
  )
  process.exit(1)
}

if (!CLIENT_ID) {
  process.stderr.write(
    '[client-brain-server] WARNING: No CLIENT_ID provided — tools will return empty results\n'
  )
}

// ── Supabase helpers (plain fetch, no SDK needed) ───────────

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

/**
 * Call a Supabase RPC function.
 * @param {string} fnName
 * @param {object} params
 * @returns {Promise<any>}
 */
async function rpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RPC ${fnName} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Generate an embedding vector via the Supabase Edge Function.
 * Falls back to a zero-vector if the function is unavailable
 * (allows guardrails-only usage without embeddings deployed).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-embedding`,
      {
        method: 'POST',
        headers: {
          ...HEADERS,
          // Edge functions use the Authorization header
        },
        body: JSON.stringify({ text }),
      }
    )
    if (!res.ok) {
      const errText = await res.text()
      process.stderr.write(
        `[client-brain-server] Embedding function error (${res.status}): ${errText}\n`
      )
      return null
    }
    const data = await res.json()
    return data.embedding || null
  } catch (err) {
    process.stderr.write(
      `[client-brain-server] Embedding function unavailable: ${err.message}\n`
    )
    return null
  }
}

// ── Brain query logic (mirrors client-brain.ts) ─────────────

const VALID_SECTIONS = [
  'brand_books',
  'icp_documents',
  'voc_library',
  'competitive_landscape',
  'historical_outputs',
]

/**
 * Semantic search across Client Brain sections.
 */
async function queryClientBrain(query, sections, matchCount) {
  if (!CLIENT_ID) return []

  const embedding = await generateEmbedding(query)
  if (!embedding) {
    process.stderr.write(
      '[client-brain-server] No embedding available — falling back to keyword context\n'
    )
    // Fallback: return guardrails-only (no semantic search)
    return []
  }

  const data = await rpc('query_client_brain', {
    p_client_id: CLIENT_ID,
    p_query_embedding: embedding,
    p_sections: sections || VALID_SECTIONS,
    p_match_count: matchCount || 10,
  })

  return (data || []).map((r) => ({
    source_table: r.source_table,
    source_id: r.source_id,
    label: r.label,
    content_text: r.content_text,
    similarity: r.similarity,
  }))
}

/**
 * Fetch pre-generation guardrails for the current client.
 */
async function getClientGuardrails() {
  if (!CLIENT_ID) return null

  const data = await rpc('get_client_guardrails', {
    p_client_id: CLIENT_ID,
  })

  if (!data || data.length === 0) return null

  const row = data[0]
  return {
    forbidden_words: row.forbidden_words || [],
    required_terminology: row.required_terminology || [],
    voice_description: row.voice_description || null,
    competitor_mentions_policy: row.competitor_mentions_policy || null,
    compliance_notes: row.compliance_notes || null,
  }
}

/**
 * Combined context builder: guardrails + semantic search.
 */
async function buildAgentContext(query, sections, matchCount) {
  const [guardrails, brainResults] = await Promise.all([
    getClientGuardrails(),
    queryClientBrain(query, sections, matchCount),
  ])

  const parts = []

  // Guardrails block
  if (guardrails) {
    const lines = ['<client_guardrails>']
    if (guardrails.voice_description)
      lines.push(`VOICE: ${guardrails.voice_description}`)
    if (guardrails.forbidden_words.length > 0)
      lines.push(
        `FORBIDDEN WORDS (never use these): ${guardrails.forbidden_words.join(', ')}`
      )
    if (guardrails.required_terminology.length > 0)
      lines.push(
        `REQUIRED TERMINOLOGY (use when relevant): ${guardrails.required_terminology.join(', ')}`
      )
    if (guardrails.competitor_mentions_policy)
      lines.push(`COMPETITOR POLICY: ${guardrails.competitor_mentions_policy}`)
    if (guardrails.compliance_notes)
      lines.push(`COMPLIANCE: ${guardrails.compliance_notes}`)
    lines.push('</client_guardrails>')
    parts.push(lines.join('\n'))
  }

  // Brain context block
  if (brainResults.length > 0) {
    const lines = ['<client_brain_context>']
    for (const r of brainResults) {
      lines.push(`[${r.label} | similarity: ${r.similarity.toFixed(2)}]`)
      lines.push(r.content_text)
      lines.push('')
    }
    lines.push('</client_brain_context>')
    parts.push(lines.join('\n'))
  }

  return parts.join('\n\n') || '(No client context available)'
}

// ── MCP Server setup ────────────────────────────────────────

const server = new McpServer({
  name: 'client-brain',
  version: '1.0.0',
})

// Tool 1: query_client_brain — semantic search across brain sections
server.registerTool(
  'query_client_brain',
  {
    title: 'Query Client Brain',
    description:
      'Semantic search across the Client Brain (brand books, ICP documents, VOC library, competitive landscape, historical outputs). Returns the most relevant context for a given query. Always call this before creating content to load client-specific constraints and knowledge.',
    inputSchema: {
      query: z
        .string()
        .describe('Natural language query to search the Client Brain'),
      sections: z
        .array(
          z.enum([
            'brand_books',
            'icp_documents',
            'voc_library',
            'competitive_landscape',
            'historical_outputs',
          ])
        )
        .optional()
        .describe(
          'Which Brain sections to search (default: all). Use specific sections when you know what you need.'
        ),
      match_count: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max results to return (default: 10, max: 20)'),
    },
  },
  async ({ query, sections, match_count }) => {
    try {
      const results = await queryClientBrain(query, sections, match_count)

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No matching context found in the Client Brain for this query.',
            },
          ],
        }
      }

      // Format results for the agent
      const formatted = results
        .map(
          (r) =>
            `[${r.label} | ${r.source_table} | similarity: ${r.similarity.toFixed(2)}]\n${r.content_text}`
        )
        .join('\n\n---\n\n')

      return {
        content: [{ type: 'text', text: formatted }],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error querying Client Brain: ${err.message}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// Tool 2: get_client_guardrails — fetch brand constraints
server.registerTool(
  'get_client_guardrails',
  {
    title: 'Get Client Guardrails',
    description:
      'Fetch pre-generation guardrails for the current client: forbidden words, required terminology, voice description, competitor policy, and compliance notes. Call this BEFORE generating any client-facing content.',
    inputSchema: {},
  },
  async () => {
    try {
      const guardrails = await getClientGuardrails()

      if (!guardrails) {
        return {
          content: [
            {
              type: 'text',
              text: 'No guardrails configured for this client yet.',
            },
          ],
        }
      }

      const lines = []
      if (guardrails.voice_description)
        lines.push(`Voice: ${guardrails.voice_description}`)
      if (guardrails.forbidden_words.length > 0)
        lines.push(
          `Forbidden Words: ${guardrails.forbidden_words.join(', ')}`
        )
      if (guardrails.required_terminology.length > 0)
        lines.push(
          `Required Terminology: ${guardrails.required_terminology.join(', ')}`
        )
      if (guardrails.competitor_mentions_policy)
        lines.push(
          `Competitor Policy: ${guardrails.competitor_mentions_policy}`
        )
      if (guardrails.compliance_notes)
        lines.push(`Compliance: ${guardrails.compliance_notes}`)

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n') || 'Guardrails exist but all fields are empty.',
          },
        ],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching guardrails: ${err.message}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// Tool 3: build_agent_context — combined guardrails + brain search
server.registerTool(
  'build_agent_context',
  {
    title: 'Build Full Agent Context',
    description:
      'One-shot tool that fetches guardrails AND runs a semantic search, returning the full pre-generation context block. Use this instead of calling query_client_brain and get_client_guardrails separately when you want everything at once.',
    inputSchema: {
      query: z
        .string()
        .describe('Natural language query describing what you are about to create'),
      sections: z
        .array(
          z.enum([
            'brand_books',
            'icp_documents',
            'voc_library',
            'competitive_landscape',
            'historical_outputs',
          ])
        )
        .optional()
        .describe('Which Brain sections to search (default: all)'),
      match_count: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max results to return (default: 10)'),
    },
  },
  async ({ query, sections, match_count }) => {
    try {
      const context = await buildAgentContext(query, sections, match_count)
      return {
        content: [{ type: 'text', text: context }],
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error building agent context: ${err.message}`,
          },
        ],
        isError: true,
      }
    }
  }
)

// ── Start server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(
    `[client-brain-server] Started for client=${CLIENT_ID || '(none)'}\n`
  )
}

main().catch((err) => {
  process.stderr.write(`[client-brain-server] Fatal: ${err.message}\n`)
  process.exit(1)
})
