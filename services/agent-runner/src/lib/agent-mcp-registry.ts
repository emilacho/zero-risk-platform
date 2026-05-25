/**
 * Agent MCP Registry · Sprint 6 Track C1 wire-in · extended Sprint 7.7 Track B
 * · canon default-deny refactor Sprint 8D 2026-05-25 (CC#2 arquitectura cleanup).
 *
 * Builds the canonical `mcpServers` map for `agent-sdk-runner.ts` based on
 * env-var presence + per-MCP allow-list (canon default-deny). Returns ONLY
 * MCPs that have keys live AND whose allow-list includes the calling agent.
 * NO-OP gracefully cuando env missing.
 *
 * Stack V4 canon · 3 MCPs operational + 1 archived ·
 *   - @zero-risk/apify-mcp-server     · APIFY_TOKEN     + APIFY_ALLOW slugs
 *   - @zero-risk/dataforseo-mcp-server · DATAFORSEO_LOGIN+PASSWORD + DATAFORSEO_ALLOW
 *   - meta-ads-mcp (Pipeboard · npm)  · META_ACCESS_TOKEN + META_ADS_ALLOW
 *   - @zero-risk/higgsfield-mcp-server · ARCHIVED (Sprint 7.7 D · canonicalized 2026-05-25)
 *     Replacement canonical · Veo 3.1 (spec-only · NO lib · differido per
 *     cliente YouTube tier). See `tech-stacks/veo-3-1.md`.
 *
 * GHL MCP · DEPRECATED per Stack V4 canon · NOT registered. See vault
 * decision `zr-vault/wiki/decisions/2026-05-21-ghl-mcp-deprecation-stack-v4.md`.
 *
 * Client Brain MCP · always wired when input.clientId present (canonical
 * existing pattern · NOT subject to allow-list · per-client design).
 *
 * Per-MCP allow-list canon (Sprint 8D 2026-05-25 CC#2) · ALL non-client-brain
 * MCPs default-deny · explicit allow-list per agent slug based on identity_md
 * declared tools. Saves token budget · reduces tool confusion · prevents
 * accidental use by agents whose identity doesn't expect the tool.
 *
 * Pattern adopted from meta-ads (Sprint 7.7 Track B) · canonicalized across
 * all 4 MCPs · replaces the prior deny-list + default-allow pattern.
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

/**
 * Per-MCP allow-list · canon default-deny (Sprint 8D arquitectura cleanup
 * 2026-05-25 CC#2 · refactor from default-allow + deny-list).
 *
 * Each MCP lists ONLY the agent slugs that declared usage in their
 * identity_md per audit `raw/qa/2026-05-25-cc2-arquitectura-cleanup.md`.
 * Agents NOT in the allow-list silently skip that MCP at runtime · saves
 * token budget · reduces tool confusion · prevents accidental use by
 * agents whose identity doesn't expect the tool.
 *
 * Add agents here if a future identity_md update declares the tool · do
 * NOT add speculatively. If a smoke breaks post-deploy because an agent
 * needs an undeclared MCP · either (a) add to the identity_md AND this
 * allow-list · or (b) only this allow-list with comment "runtime override".
 */
const APIFY_ALLOW: ReadonlySet<string> = new Set([
  'competitive-intelligence-agent',
  'market-research',
])
const DATAFORSEO_ALLOW: ReadonlySet<string> = new Set([
  'market-research',
  'seo-specialist',
])
// Higgsfield MCP · PURGED per Stack V4 canon · canonical replacement Veo 3.1
// (spec-only · NO lib · differido per cliente YouTube tier). The MCP package
// remains archived at `packages/higgsfield-mcp-server/` per Sprint 7.7 D
// cleanup precedent ("keep MCP archived") · no runtime registration.
// See vault decision `2026-05-25-cc2-higgsfield-purge-veo-update.md`.
const META_ADS_ALLOW: ReadonlySet<string> = new Set([
  'media-buyer',
  'social-media-strategist',
  'paid-search-strategist',
])

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
  const slug = ctx.agentSlug

  // Client Brain · per-client always-on · NOT subject to per-agent allow-list
  // (canonical existing pattern · every agent invocation with a clientId gets
  // RAG access · this is design intent · NOT switched to allow-list here).
  if (ctx.clientId) {
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

  // Apify · 2 tools (apify_run_actor · apify_get_dataset) · ad library scrape
  // primitives. Allow-list canon default-deny · agents NOT in APIFY_ALLOW skip.
  if (process.env.APIFY_TOKEN && slug && APIFY_ALLOW.has(slug)) {
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

  // DataForSEO · 2 tools (dfs_serp_google · dfs_keywords_for_keyword) · SERP +
  // keyword research primitives. Allow-list canon default-deny.
  if (
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    slug &&
    DATAFORSEO_ALLOW.has(slug)
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

  // Higgsfield MCP · INTENTIONALLY NOT REGISTERED · Stack V4 canon OUT (Sprint
  // 7.7 D audit · canonicalized 2026-05-25 CC#2 Higgsfield purge). Replacement
  // canonical · Veo 3.1 (spec-only · NO lib · differido per cliente YouTube
  // tier). See vault `00-meta/system-map/tech-stacks/veo-3-1.md`.

  // Meta Ads MCP (Pipeboard · meta-ads-mcp npm v1.1.0) · 20+ Meta Marketing API
  // tools (campaigns · ads · creatives · insights · audiences · ad library scrape).
  // Allow-list canon (canonical since Sprint 7.7 Track B · pattern adopted
  // for apify/dataforseo/higgsfield Sprint 8D arquitectura cleanup 2026-05-25).
  // Env gate · META_ACCESS_TOKEN (also accepts META_SYSTEM_USER_TOKEN per Brazo 3
  // pre-canon-alias window).
  if (slug && META_ADS_ALLOW.has(slug)) {
    const metaToken =
      process.env.META_ACCESS_TOKEN ?? process.env.META_SYSTEM_USER_TOKEN ?? ''
    if (metaToken) {
      servers['meta-ads'] = {
        type: 'stdio',
        command: 'node',
        args: [
          pathResolve(
            process.cwd(),
            'node_modules',
            'meta-ads-mcp',
            'build',
            'index.js',
          ),
        ],
        env: {
          META_ACCESS_TOKEN: metaToken,
          ...(process.env.META_FB_PAGE_ID
            ? { META_FB_PAGE_ID: process.env.META_FB_PAGE_ID }
            : {}),
          ...(process.env.META_IG_BUSINESS_ACCOUNT_ID
            ? { META_IG_BUSINESS_ACCOUNT_ID: process.env.META_IG_BUSINESS_ACCOUNT_ID }
            : {}),
          ...(process.env.META_AD_ACCOUNT_ID
            ? { META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID }
            : {}),
          PATH: process.env.PATH ?? '',
        },
      }
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
