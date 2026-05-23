/**
 * agent-mcp-registry · Sprint 6 Track C1 unit tests · MCP wire-in canon.
 *
 * Verifies ·
 *   - Apify/DataForSEO/Higgsfield registered conditionally on env presence
 *   - GHL NOT registered (Stack V4 canon · DEPRECATED)
 *   - Client Brain registered cuando clientId present
 *   - Per-agent deny-list gates correctly
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

describe("buildMcpServers", () => {
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

  it("registers nothing when all env unset and no clientId", () => {
    const servers = buildMcpServers({ agentSlug: "marketing-strategist" })
    expect(Object.keys(servers)).toEqual([])
  })

  it("registers apify when APIFY_TOKEN set", () => {
    process.env.APIFY_TOKEN = "apify_test"
    const servers = buildMcpServers({ agentSlug: "marketing-strategist" })
    expect(servers.apify).toBeDefined()
  })

  it("registers dataforseo only when BOTH login+password set", () => {
    process.env.DATAFORSEO_LOGIN = "login"
    let servers = buildMcpServers({ agentSlug: "marketing-strategist" })
    expect(servers.dataforseo).toBeUndefined()

    process.env.DATAFORSEO_PASSWORD = "pwd"
    servers = buildMcpServers({ agentSlug: "marketing-strategist" })
    expect(servers.dataforseo).toBeDefined()
  })

  it("registers higgsfield when HIGGSFIELD_API_KEY set", () => {
    process.env.HIGGSFIELD_API_KEY = "hf_test"
    const servers = buildMcpServers({ agentSlug: "editor-en-jefe" })
    expect(servers.higgsfield).toBeDefined()
  })

  it("NEVER registers ghl (Stack V4 canon · DEPRECATED 2026-05-21)", () => {
    process.env.GHL_API_KEY = "ghl_should_be_ignored"
    const servers = buildMcpServers({ agentSlug: "account-manager" })
    expect(servers.ghl).toBeUndefined()
    expect(servers["ghl-mcp"]).toBeUndefined()
    delete process.env.GHL_API_KEY
  })

  it("denies all MCPs for onboarding-specialist (per AGENT_MCP_DENY)", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    process.env.DATAFORSEO_LOGIN = "a"
    process.env.DATAFORSEO_PASSWORD = "b"
    const servers = buildMcpServers({ agentSlug: "onboarding-specialist" })
    expect(servers.apify).toBeUndefined()
    expect(servers.higgsfield).toBeUndefined()
    expect(servers.dataforseo).toBeUndefined()
  })

  it("denies higgsfield only for email-marketer", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    const servers = buildMcpServers({ agentSlug: "email-marketer" })
    expect(servers.apify).toBeDefined()
    expect(servers.higgsfield).toBeUndefined()
  })

  it("denies all MCPs for community-manager except non-higgsfield ones (the deny rule lists higgsfield)", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    const servers = buildMcpServers({ agentSlug: "community-manager" })
    expect(servers.higgsfield).toBeUndefined()
    expect(servers.apify).toBeDefined()
  })

  it("allows MCPs for slugs not in deny-list", () => {
    process.env.APIFY_TOKEN = "x"
    process.env.HIGGSFIELD_API_KEY = "y"
    const servers = buildMcpServers({ agentSlug: "editor-en-jefe" })
    expect(servers.apify).toBeDefined()
    expect(servers.higgsfield).toBeDefined()
  })

  // ── Meta Ads MCP · Sprint 7.7 Track B · allow-list gating ─────────────────

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

  it("meta-ads · registered for paid-search-strategist", () => {
    process.env.META_ACCESS_TOKEN = "EAzzz"
    const servers = buildMcpServers({ agentSlug: "paid-search-strategist" })
    expect(servers["meta-ads"]).toBeDefined()
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
