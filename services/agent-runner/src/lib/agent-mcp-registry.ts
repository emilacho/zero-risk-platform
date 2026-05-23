/**
 * Agent MCP Registry · Sprint 6 Track C1 wire-in.
 *
 * Builds the canonical `mcpServers` map for `agent-sdk-runner.ts` based on
 * env-var presence + (optional) agent slug gating. Returns ONLY MCPs that
 * have keys live · NO-OP gracefully cuando env missing.
 *
 * Stack V4 canon · 3 MCPs propios operational ·
 *   - @zero-risk/apify-mcp-server     · APIFY_TOKEN
 *   - @zero-risk/dataforseo-mcp-server · DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 *   - @zero-risk/higgsfield-mcp-server · HIGGSFIELD_API_KEY (+ optional HIGGSFIELD_WEBHOOK_URL)
 *
 * GHL MCP · DEPRECATED per Stack V4 canon · NOT registered. See vault
 * decision `zr-vault/wiki/decisions/2026-05-21-ghl-mcp-deprecation-stack-v4.md`.
 *
 * Client Brain MCP · always wired when input.clientId present (canonical
 * existing pattern · NOT changed by this Sprint 6 wire).
 *
 * Per-agent gating · soft scoping via canonical mapping (which agent should
 * see which MCP tools). Out-of-scope agents simply don't get the MCP server
 * registered. Saves token budget + reduces tool-confusion.
 */
import { resolve as pathResolve } from 'node:path'

/** Resolves the absolute path to a package's `dist/index.js` entrypoint */
function resolveMcpEntrypoint(packageName: string): string {
  // packages live at <repo>/packages/<pkg>/dist/index.js · service-agent-runner
  // runs from <repo>/services/agent-runner so resolve relative.
  return pathResolve(
    process.cwd(),
    '..',
    '..',
    'packages',
    packageName,
    'dist',
    'index.js',
  )
}

/** Optional per-agent slug → MCP scope map (deny-list pattern · default allow) */
const AGENT_MCP_DENY: Record<string, Set<string>> = {
  // Auth/onboarding agents NO need Apify/DataForSEO/Higgsfield · save token budget
  'onboarding-specialist': new Set(['apify', 'dataforseo', 'higgsfield']),
  // pure-text writer agents NO need video MCP
  'email-marketer': new Set(['higgsfield']),
  'account-manager': new Set(['apify', 'dataforseo', 'higgsfield']),
  'community-manager': new Set(['higgsfield']),
}

export interface AgentMcpContext {
  agentSlug?: string
  clientId?: string
}

export interface McpServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Build the canonical mcpServers map for the SDK Options.
 * Returns ONLY MCPs available (env present + not denied for this agent).
 */
export function buildMcpServers(
  ctx: AgentMcpContext,
): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {}
  const denied = ctx.agentSlug ? (AGENT_MCP_DENY[ctx.agentSlug] ?? new Set()) : new Set<string>()

  // Client Brain · only when clientId present (canonical existing pattern)
  if (ctx.clientId && !denied.has('client-brain')) {
    servers['client-brain'] = {
      type: 'stdio',
      command: 'node',
      args: [pathResolve(process.cwd(), 'src/lib/mcp/client-brain-server.js')],
      env: {
        CLIENT_ID: ctx.clientId,
        SUPABASE_URL:
          process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        PATH: process.env.PATH ?? '',
      },
    }
  }

  // Apify · 6 tools (Meta/Google/TikTok ad libraries · landing scrape)
  if (process.env.APIFY_TOKEN && !denied.has('apify')) {
    servers.apify = {
      type: 'stdio',
      command: 'node',
      args: [resolveMcpEntrypoint('apify-mcp-server')],
      env: {
        APIFY_TOKEN: process.env.APIFY_TOKEN,
        PATH: process.env.PATH ?? '',
      },
    }
  }

  // DataForSEO · 12 tools (SERP · keywords · backlinks · competitors)
  if (
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    !denied.has('dataforseo')
  ) {
    servers.dataforseo = {
      type: 'stdio',
      command: 'node',
      args: [resolveMcpEntrypoint('dataforseo-mcp-server')],
      env: {
        DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
        DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
        PATH: process.env.PATH ?? '',
      },
    }
  }

  // Higgsfield · 4 tools (video gen · Seedance 2.0 + Lite tier)
  if (process.env.HIGGSFIELD_API_KEY && !denied.has('higgsfield')) {
    servers.higgsfield = {
      type: 'stdio',
      command: 'node',
      args: [resolveMcpEntrypoint('higgsfield-mcp-server')],
      env: {
        HIGGSFIELD_API_KEY: process.env.HIGGSFIELD_API_KEY,
        ...(process.env.HIGGSFIELD_WEBHOOK_URL
          ? { HIGGSFIELD_WEBHOOK_URL: process.env.HIGGSFIELD_WEBHOOK_URL }
          : {}),
        PATH: process.env.PATH ?? '',
      },
    }
  }

  // GHL MCP · INTENTIONALLY NOT REGISTERED · Stack V4 deprecated · see
  // vault decision `2026-05-21-ghl-mcp-deprecation-stack-v4.md`.

  return servers
}

/**
 * Returns a summary string of which MCPs were activated for this context.
 * Useful for agent log lines · "[mcp] activated: client-brain, apify"
 */
export function summarizeMcpActivation(
  servers: Record<string, McpServerConfig>,
): string {
  const names = Object.keys(servers)
  if (names.length === 0) return 'none'
  return names.sort().join(', ')
}
