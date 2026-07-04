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
  // 'paid-search-strategist' REMOVED 2026-05-25 CC#2 Sprint 9 entry (Option A
  // post-audit GAP REAL verdict) · slug never existed en managed_agents_registry
  // · stale entry desde Sprint 7.7 Track B speculative design · media-buyer
  // already covers Google Ads + PPC canonical via identity_md. See vault
  // `raw/qa/2026-05-25-cc2-paid-search-strategist-naming-drift-audit.md`.
])

/**
 * Discovery Output MCP allow-list · SPEC lazo agentico 2026-06-05 follow-up.
 *
 * The Auto-Discovery surface · `onboarding-specialist` invokes
 * `emit_discovery_output` to ship the structured output (own_handles +
 * competitors + icp + summary). Other agents do NOT need this tool · keeping
 * the allow-list narrow follows the Sprint 8D default-deny canon.
 *
 * Adding new agents · only when their identity_md declares Discovery emission
 * as a canonical responsibility. Currently · 1 agent (Phase 1 piloto surface).
 */
export const DISCOVERY_OUTPUT_ALLOW: ReadonlySet<string> = new Set([
  'onboarding-specialist',
])

/**
 * Brand Book · las 3 lentes que emiten su sección estructurada vía
 * `emit_brand_section` (SPEC brand-book colaborativo · CC#4 2026-06-30).
 */
export const BRAND_SECTION_ALLOW: ReadonlySet<string> = new Set([
  'brand-strategist',
  'editor-en-jefe',
  'jefe-client-success',
  // F1.2 (CC#4 2026-07-04) · scorer SOMBRA de groundedness · sin rol en Lazo A ·
  // necesita emit_fidelity_scores + el gate de forced-emit para puntuar como el judge.
  'gpt-5.5-advisor',
])

/**
 * Client Brain MCP deny-list · Discovery Fix B1 (2026-06-28 · CC#4).
 *
 * The `client-brain` MCP server is DEPRECATED (see client-brain-server.js
 * header · 2026-05-22 Sprint 7.5 A7) · canonical context delivery is
 * push-enrichment (brain-enrichment.ts injects chunks into the system prompt
 * BEFORE the first turn · 100% of clientId invocations). The MCP tools are a
 * secondary fallback whose descriptions nudge the agent to "call before
 * generating content".
 *
 * For `onboarding-specialist` this backfired · the deprecated tools are
 * surfaced (descriptions tell the agent to call them) but NOT in `allowedTools`
 * (deriveAllowedTools only whitelists discovery-output) · so under
 * permissionMode='default' the SDK GATES them · the agent attempts the read,
 * is blocked, and stalls asking "approve Client Brain access?" — never
 * reaching `emit_discovery_output`. Result · 0 competitors, silent degradation
 * (exec 39732 · raw/findings/2026-06-28-discovery-fase2-fix-b-...).
 *
 * Denying the mount for this agent removes the dead-end tool surface · the
 * agent relies on push-enrichment for context + web tools for discovery + emits
 * autonomously. Scoped to onboarding-specialist · other agents keep RAG access.
 */
const CLIENT_BRAIN_DENY: ReadonlySet<string> = new Set([
  'onboarding-specialist',
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

  // Client Brain · per-client RAG · on for every agent with a clientId EXCEPT
  // those in CLIENT_BRAIN_DENY (Discovery Fix B1 · onboarding-specialist relies
  // on push-enrichment · the deprecated MCP tool surface dead-ends it · see set
  // comment above). Other agents keep RAG access · design intent unchanged.
  if (ctx.clientId && !(slug && CLIENT_BRAIN_DENY.has(slug))) {
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

  // Discovery Output MCP · SPEC lazo agentico 2026-06-05 · single tool
  // `emit_discovery_output` (zod-validated structured output for Auto-Discovery).
  // Gated by SALA_DISCOVERY_BRAIN_PUSH_ENABLED so disabled = MCP not spawned ·
  // matches the platform-side default-OFF gate (parse + persist hook). The
  // agent SDK validates tool args against the schema BEFORE calling the tool ·
  // so every tool_use block surfaced to the runner is guaranteed canonical.
  if (
    slug &&
    DISCOVERY_OUTPUT_ALLOW.has(slug) &&
    process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED === 'true'
  ) {
    servers['discovery-output'] = {
      type: 'stdio',
      command: 'node',
      args: [pathResolve(process.cwd(), 'src/lib/mcp/discovery-output-server.js')],
      env: {
        ...(ctx.clientId ? { CLIENT_ID: ctx.clientId } : {}),
        PATH: process.env.PATH ?? '',
      },
    }
  }

  // Brand Section MCP · las 3 lentes emiten su sección estructurada vía
  // `emit_brand_section` (fix narración-vs-estructurado · CC#4 2026-06-30).
  // Mismo gate que discovery (reusa el toggle de la capa de síntesis).
  if (
    slug &&
    BRAND_SECTION_ALLOW.has(slug) &&
    process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED === 'true'
  ) {
    servers['brand-section'] = {
      type: 'stdio',
      command: 'node',
      args: [pathResolve(process.cwd(), 'src/lib/mcp/brand-section-server.js')],
      env: {
        ...(ctx.clientId ? { CLIENT_ID: ctx.clientId } : {}),
        PATH: process.env.PATH ?? '',
      },
    }
  }

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
