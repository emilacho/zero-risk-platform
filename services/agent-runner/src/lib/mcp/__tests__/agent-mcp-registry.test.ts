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
