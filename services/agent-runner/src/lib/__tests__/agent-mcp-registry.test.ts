/**
 * agent-mcp-registry · Sprint 6 Track C1 unit tests + Sprint 8D canon
 * default-deny refactor 2026-05-25 (CC#2 arquitectura cleanup).
 *
 * Verifies ·
 *   - Per-MCP allow-list canon · default-deny (apify · dataforseo · higgsfield · meta-ads)
 *   - Env presence required (env missing → MCP NOT registered even if slug allowed)
 *   - Client Brain auto-on with clientId · EXCEPT CLIENT_BRAIN_DENY slugs (Fix B1 · onboarding-specialist)
 *   - GHL NOT registered (Stack V4 canon · DEPRECATED)
 *   - Anonymous invocation (no slug) → only client-brain available
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildMcpServers, summarizeMcpActivation } from "../agent-mcp-registry"

const KEYS = [
  "APIFY_TOKEN",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
  "HIGGSFIELD_API_KEY",
  "META_ACCESS_TOKEN",
  "META_SYSTEM_USER_TOKEN",
  "META_FB_PAGE_ID",
  "META_IG_BUSINESS_ACCOUNT_ID",
  "META_AD_ACCOUNT_ID",
] as const

describe("buildMcpServers · default-deny + per-MCP allow-list canon", () => {
  const original: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k]
      else process.env[k] = original[k]
    }
  })

  // ── Empty / no env state ─────────────────────────────────────────────

  it("registers nothing when all env unset and no clientId", () => {
    const servers = buildMcpServers({ agentSlug: "competitive-intelligence-agent" })
    expect(Object.keys(servers)).toEqual([])
  })

  // ── Apify · APIFY_ALLOW = {competitive-intelligence-agent, market-research}

  it("apify · registered for competitive-intelligence-agent with APIFY_TOKEN set", () => {
    process.env.APIFY_TOKEN = "apify_test"
    const servers = buildMcpServers({ agentSlug: "competitive-intelligence-agent" })
    expect(servers.apify).toBeDefined()
    expect(servers.apify?.env.APIFY_TOKEN).toBe("apify_test")
  })

  it("apify · registered for market-research with APIFY_TOKEN set", () => {
    process.env.APIFY_TOKEN = "apify_test"
    const servers = buildMcpServers({ agentSlug: "market-research" })
    expect(servers.apify).toBeDefined()
  })

  it("apify · NOT registered for agent not in APIFY_ALLOW (default-deny)", () => {
    process.env.APIFY_TOKEN = "apify_test"
    const servers = buildMcpServers({ agentSlug: "brand-strategist" })
    expect(servers.apify).toBeUndefined()
  })

  it("apify · NOT registered when APIFY_TOKEN missing even if slug allowed", () => {
    const servers = buildMcpServers({ agentSlug: "competitive-intelligence-agent" })
    expect(servers.apify).toBeUndefined()
  })

  // ── DataForSEO · DATAFORSEO_ALLOW = {market-research, seo-specialist}

  it("dataforseo · registered only when BOTH login+password set (env gate)", () => {
    process.env.DATAFORSEO_LOGIN = "login"
    let servers = buildMcpServers({ agentSlug: "seo-specialist" })
    expect(servers.dataforseo).toBeUndefined()

    process.env.DATAFORSEO_PASSWORD = "pwd"
    servers = buildMcpServers({ agentSlug: "seo-specialist" })
    expect(servers.dataforseo).toBeDefined()
  })

  it("dataforseo · registered for market-research", () => {
    process.env.DATAFORSEO_LOGIN = "login"
    process.env.DATAFORSEO_PASSWORD = "pwd"
    const servers = buildMcpServers({ agentSlug: "market-research" })
    expect(servers.dataforseo).toBeDefined()
  })

  it("dataforseo · NOT registered for agent not in DATAFORSEO_ALLOW", () => {
    process.env.DATAFORSEO_LOGIN = "login"
    process.env.DATAFORSEO_PASSWORD = "pwd"
    const servers = buildMcpServers({ agentSlug: "competitive-intelligence-agent" })
    expect(servers.dataforseo).toBeUndefined()
  })

  // ── Higgsfield · PURGED per Stack V4 canon (Sprint 7.7 D · canonicalized
  //    2026-05-25 CC#2 Higgsfield purge). Replacement · Veo 3.1 spec-only.

  it("higgsfield · NEVER registered (Stack V4 canon PURGED · canonicalized 2026-05-25)", () => {
    process.env.HIGGSFIELD_API_KEY = "hf_should_be_ignored"
    // Even video-editor (former allow-list entry pre-2026-05-25) NOT registered
    const servers = buildMcpServers({ agentSlug: "video-editor" })
    expect(servers.higgsfield).toBeUndefined()
    // Editor-en-jefe also NOT registered (legacy reference cleanup)
    const servers2 = buildMcpServers({ agentSlug: "editor-en-jefe" })
    expect(servers2.higgsfield).toBeUndefined()
    delete process.env.HIGGSFIELD_API_KEY
  })

  // ── GHL · permanently NOT registered

  it("ghl · NEVER registered (Stack V4 canon DEPRECATED 2026-05-21)", () => {
    process.env.GHL_API_KEY = "ghl_should_be_ignored"
    const servers = buildMcpServers({ agentSlug: "account-manager" })
    expect(servers.ghl).toBeUndefined()
    expect(servers["ghl-mcp"]).toBeUndefined()
    delete process.env.GHL_API_KEY
  })

  // ── Default-deny effect · agents previously default-allowed now skip

  it("default-deny · onboarding-specialist gets no MCPs (was deny-list before · now no allow)", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    process.env.DATAFORSEO_LOGIN = "a"
    process.env.DATAFORSEO_PASSWORD = "b"
    const servers = buildMcpServers({ agentSlug: "onboarding-specialist" })
    expect(servers.apify).toBeUndefined()
    expect(servers.higgsfield).toBeUndefined()
    expect(servers.dataforseo).toBeUndefined()
  })

  it("default-deny · email-marketer gets no MCPs (no identity_md declaration)", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    const servers = buildMcpServers({ agentSlug: "email-marketer" })
    expect(servers.apify).toBeUndefined()
    expect(servers.higgsfield).toBeUndefined()
  })

  it("default-deny · community-manager gets no non-client-brain MCPs", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    const servers = buildMcpServers({ agentSlug: "community-manager" })
    expect(servers.higgsfield).toBeUndefined()
    expect(servers.apify).toBeUndefined()
  })

  // ── Client Brain · per-client always-on · NOT subject to allow-list

  it("client-brain · registered when clientId present regardless of agent slug", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srv_key"
    const servers = buildMcpServers({ agentSlug: "any-random-slug", clientId: "cli_123" })
    expect(servers["client-brain"]).toBeDefined()
    expect(servers["client-brain"]?.env.CLIENT_ID).toBe("cli_123")
  })

  it("client-brain · NOT registered without clientId", () => {
    const servers = buildMcpServers({ agentSlug: "brand-strategist" })
    expect(servers["client-brain"]).toBeUndefined()
  })

  it("client-brain · DENIED for onboarding-specialist even with clientId (Discovery Fix B1)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srv_key"
    const servers = buildMcpServers({ agentSlug: "onboarding-specialist", clientId: "cli_123" })
    // deprecated MCP tool surface dead-ends the agent → push-enrichment covers context
    expect(servers["client-brain"]).toBeUndefined()
  })

  it("client-brain · still registered for non-denied agents with clientId", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srv_key"
    const servers = buildMcpServers({ agentSlug: "competitive-intelligence-agent", clientId: "cli_123" })
    expect(servers["client-brain"]).toBeDefined()
    expect(servers["client-brain"]?.env.CLIENT_ID).toBe("cli_123")
  })

  // ── Meta Ads MCP · Sprint 7.7 Track B · allow-list gating (unchanged) ─────────

  it("meta-ads · NOT registered when META_ACCESS_TOKEN missing", () => {
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    expect(servers["meta-ads"]).toBeUndefined()
  })

  it("meta-ads · NOT registered without agent slug match (deny non-paid-media)", () => {
    process.env.META_ACCESS_TOKEN = "EAxxx"
    const servers = buildMcpServers({ agentSlug: "content-creator" })
    expect(servers["meta-ads"]).toBeUndefined()
  })

  it("meta-ads · registered for media-buyer with META_ACCESS_TOKEN", () => {
    process.env.META_ACCESS_TOKEN = "EAxxx"
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    expect(servers["meta-ads"]).toBeDefined()
    expect(servers["meta-ads"]?.command).toBe("node")
    expect(servers["meta-ads"]?.env.META_ACCESS_TOKEN).toBe("EAxxx")
  })

  it("meta-ads · registered for social-media-strategist", () => {
    process.env.META_ACCESS_TOKEN = "EAyyy"
    const servers = buildMcpServers({ agentSlug: "social-media-strategist" })
    expect(servers["meta-ads"]).toBeDefined()
  })

  it("meta-ads · NOT registered for paid-search-strategist (REMOVED 2026-05-25 · GAP REAL canon-realign)", () => {
    process.env.META_ACCESS_TOKEN = "EAzzz"
    const servers = buildMcpServers({ agentSlug: "paid-search-strategist" })
    // Post-Option-A removal · paid-search-strategist no longer in META_ADS_ALLOW
    // · slug never existed en managed_agents_registry · media-buyer covers
    // Google Ads + PPC canonical. See vault `2026-05-25-cc2-paid-search-strategist-naming-drift-audit.md`.
    expect(servers["meta-ads"]).toBeUndefined()
  })

  it("meta-ads · falls back to META_SYSTEM_USER_TOKEN (Brazo 3 pre-canon alias)", () => {
    process.env.META_SYSTEM_USER_TOKEN = "EAlegacy"
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    expect(servers["meta-ads"]).toBeDefined()
    expect(servers["meta-ads"]?.env.META_ACCESS_TOKEN).toBe("EAlegacy")
  })

  it("meta-ads · forwards optional META_FB_PAGE_ID + IG + AD_ACCOUNT_ID when set", () => {
    process.env.META_ACCESS_TOKEN = "EA"
    process.env.META_FB_PAGE_ID = "fb-page-123"
    process.env.META_IG_BUSINESS_ACCOUNT_ID = "ig-biz-456"
    process.env.META_AD_ACCOUNT_ID = "act_789"
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    expect(servers["meta-ads"]?.env.META_FB_PAGE_ID).toBe("fb-page-123")
    expect(servers["meta-ads"]?.env.META_IG_BUSINESS_ACCOUNT_ID).toBe("ig-biz-456")
    expect(servers["meta-ads"]?.env.META_AD_ACCOUNT_ID).toBe("act_789")
  })

  it("meta-ads · omits optional env vars when not set (no empty-string leak)", () => {
    process.env.META_ACCESS_TOKEN = "EA"
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    expect(servers["meta-ads"]?.env.META_FB_PAGE_ID).toBeUndefined()
    expect(servers["meta-ads"]?.env.META_IG_BUSINESS_ACCOUNT_ID).toBeUndefined()
    expect(servers["meta-ads"]?.env.META_AD_ACCOUNT_ID).toBeUndefined()
  })

  it("meta-ads · spawn command path resolves to node_modules/meta-ads-mcp/build/index.js", () => {
    process.env.META_ACCESS_TOKEN = "EA"
    const servers = buildMcpServers({ agentSlug: "media-buyer" })
    const args = servers["meta-ads"]?.args ?? []
    expect(args.length).toBe(1)
    expect(args[0]).toMatch(/node_modules[\\/]+meta-ads-mcp[\\/]+build[\\/]+index\.js$/)
  })

  it("meta-ads · NOT registered when agentSlug undefined (anonymous invocation)", () => {
    process.env.META_ACCESS_TOKEN = "EA"
    const servers = buildMcpServers({})
    expect(servers["meta-ads"]).toBeUndefined()
  })

  // ── Anonymous invocation · no slug → no agent-gated MCPs

  it("anonymous · no slug → no agent-gated MCPs even with env set", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    process.env.DATAFORSEO_LOGIN = "a"
    process.env.DATAFORSEO_PASSWORD = "b"
    process.env.META_ACCESS_TOKEN = "EA"
    const servers = buildMcpServers({})
    expect(servers.apify).toBeUndefined()
    expect(servers.dataforseo).toBeUndefined()
    expect(servers.higgsfield).toBeUndefined()
    expect(servers["meta-ads"]).toBeUndefined()
  })
})

describe("summarizeMcpActivation", () => {
  it("returns a comma-separated string of registered server keys", () => {
    const summary = summarizeMcpActivation({
      apify: { type: "stdio", command: "node", args: [], env: {} },
      higgsfield: { type: "stdio", command: "node", args: [], env: {} },
    })
    expect(summary).toContain("apify")
    expect(summary).toContain("higgsfield")
  })

  it("returns 'none' when empty map", () => {
    const summary = summarizeMcpActivation({})
    expect(summary).toMatch(/none/i)
  })
})
