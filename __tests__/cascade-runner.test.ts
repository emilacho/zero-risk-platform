/**
 * cascade-runner.test.ts · Gap 3 contract tests
 *
 * Verifies the sequential cascade behavior:
 *   1. agents fire in SEQUENCE order (not parallel)
 *   2. agent N's parsed output becomes context for agent N+1
 *   3. cliente brand_assets are passed verbatim (Gap 1 wiring)
 *   4. parser handles ```json fenced + bare JSON shapes
 *   5. per-step failures are captured without breaking the chain
 *   6. total_cost_usd sums per-agent costs
 */
import { describe, it, expect, vi } from "vitest"
import { runCascade } from "../src/lib/cascade-runner"
import type { CascadeRunRequest } from "../src/lib/cascade-types"

const baseReq: CascadeRunRequest = {
  client_id: "c-1",
  client_slug: "test-cliente",
  client_name: "Test Cliente",
  scrape_summary: "IG: 1200 followers · 12 posts · bio: 'fresh food coastal'",
  brand_assets: {
    logo_url: "https://example.com/logo.png",
    brand_colors: [{ hex: "#0D5C6B" }, { hex: "#D4A853" }],
    brand_fonts: ["Inter", "Playfair Display"],
  },
  caller: "test",
}

function mockOk(payload: Record<string, unknown>): typeof fetch {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch
  return fetchImpl
}

describe("runCascade · Gap 3", () => {
  it("fires the 6 agents in SEQUENCE order", async () => {
    const calls: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { agent: string }
      calls.push(body.agent)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: `{"step":"${body.agent}"}`,
          cost_usd: 0.01,
          model: "claude-sonnet-4-6",
          session_id: `s-${body.agent}`,
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })

    expect(calls).toEqual([
      "brand-strategist",
      "market-research-analyst",
      "creative-director",
      "web-designer",
      "content-creator",
      "editor-en-jefe",
    ])
    expect(result.agents).toHaveLength(6)
    expect(result.ok).toBe(true)
  })

  it("chains agent N's parsed output as context for agent N+1", async () => {
    const tasksByAgent: Record<string, string> = {}
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        agent: string
        task: string
      }
      tasksByAgent[body.agent] = body.task
      // each agent returns a parsed-able JSON with a distinctive key
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: `{"signal_from_${body.agent}": true}`,
          cost_usd: 0.01,
          model: "claude-sonnet-4-6",
        }),
      } as Response
    }) as unknown as typeof fetch

    await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })

    // brand-strategist task does NOT contain any prior agent signal
    expect(tasksByAgent["brand-strategist"]).not.toContain("signal_from_")
    // market-research-analyst SHOULD contain brand-strategist's signal
    expect(tasksByAgent["market-research-analyst"]).toContain(
      "signal_from_brand-strategist",
    )
    // creative-director SHOULD contain both brand + research signals
    expect(tasksByAgent["creative-director"]).toContain("signal_from_brand-strategist")
    expect(tasksByAgent["creative-director"]).toContain(
      "signal_from_market-research-analyst",
    )
    // content-creator SHOULD contain all 4 prior signals
    expect(tasksByAgent["content-creator"]).toContain("signal_from_creative-director")
    expect(tasksByAgent["content-creator"]).toContain("signal_from_web-designer")
  })

  it("passes cliente brand_assets verbatim to creative-director (Gap 1)", async () => {
    let creativeTask = ""
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        agent: string
        task: string
      }
      if (body.agent === "creative-director") creativeTask = body.task
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: '{"ok":true}',
          cost_usd: 0.01,
          model: "claude-sonnet-4-6",
        }),
      } as Response
    }) as unknown as typeof fetch

    await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })

    expect(creativeTask).toContain("https://example.com/logo.png")
    expect(creativeTask).toContain("#0D5C6B")
    expect(creativeTask).toContain("Playfair Display")
    expect(creativeTask).toContain("do NOT")
  })

  it("parses both fenced ```json blocks and bare JSON", async () => {
    let cycle = 0
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      cycle++
      const body = JSON.parse(String(init?.body)) as { agent: string }
      // alternate: even=fenced, odd=bare
      const raw =
        cycle % 2 === 0
          ? `\`\`\`json\n{"agent":"${body.agent}","fenced":true}\n\`\`\``
          : `Some prose before {"agent":"${body.agent}","fenced":false} trailing.`
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: raw,
          cost_usd: 0.01,
          model: "claude-sonnet-4-6",
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })

    expect(result.agents.every((a) => a.parsed && a.parsed.agent === a.slug)).toBe(
      true,
    )
  })

  it("captures per-step failure without breaking the chain", async () => {
    let cycle = 0
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      cycle++
      const body = JSON.parse(String(init?.body)) as { agent: string }
      if (body.agent === "creative-director") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "simulated_creative_fail" }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          response: `{"agent":"${body.agent}"}`,
          cost_usd: 0.01,
          model: "claude-sonnet-4-6",
        }),
      } as Response
    }) as unknown as typeof fetch

    const result = await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    expect(result.agents).toHaveLength(6) // still ran all 6
    const creative = result.agents.find((a) => a.slug === "creative-director")
    expect(creative?.status).toBe("failed")
    expect(creative?.error).toBe("simulated_creative_fail")
    // downstream agents still fired (status completed) despite creative fail
    const web = result.agents.find((a) => a.slug === "web-designer")
    expect(web?.status).toBe("completed")
    void cycle
  })

  it("total_cost_usd sums per-agent costs", async () => {
    const fetchImpl = mockOk({
      success: true,
      response: '{"ok":true}',
      cost_usd: 0.05,
      model: "claude-sonnet-4-6",
    })
    const result = await runCascade(baseReq, {
      baseUrl: "http://localhost",
      internalApiKey: "test-key",
      fetchImpl,
    })
    expect(result.total_cost_usd).toBeCloseTo(0.3, 6) // 6 × 0.05
  })
})
