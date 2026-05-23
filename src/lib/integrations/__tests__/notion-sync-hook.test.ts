/**
 * notion-sync-hook · Sprint 6 Track C4 fire-and-forget unit tests.
 *
 * Hook should be canon "never throws" · fail closed con error string ·
 * fetches /api/notion/sync-report con auth · returns NotionSyncResult.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { syncToNotion } from "../notion-sync-hook"

describe("syncToNotion", () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = "test-internal-key"
    process.env.NEXT_PUBLIC_BASE_URL = "http://test.local"
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns attempted=false when INTERNAL_API_KEY unset", async () => {
    delete process.env.INTERNAL_API_KEY
    const result = await syncToNotion({
      type: "client",
      payload: { name: "Test" },
    })
    expect(result.attempted).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("INTERNAL_API_KEY missing")
  })

  it("posts to /api/notion/sync-report with auth header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, notion_page_id: "page_abc" }),
        { status: 200 },
      ),
    )
    const result = await syncToNotion({
      type: "client",
      client_id: "c1",
      payload: { name: "Acme" },
    })
    expect(result.attempted).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.notion_page_id).toBe("page_abc")
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test.local/api/notion/sync-report",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-internal-key",
        }),
      }),
    )
  })

  it("returns ok=false with error detail on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "x" }), { status: 502 }),
    )
    const result = await syncToNotion({
      type: "campaign",
      payload: {},
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("HTTP 502")
  })

  it("never throws · swallows fetch exceptions", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"))
    const result = await syncToNotion({
      type: "weekly",
      payload: {},
      context: "weekly-cron",
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("ECONNREFUSED")
  })

  it("falls back to page_id field when notion_page_id missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, page_id: "p123" }), {
        status: 200,
      }),
    )
    const result = await syncToNotion({
      type: "client",
      payload: {},
    })
    expect(result.notion_page_id).toBe("p123")
  })
})
