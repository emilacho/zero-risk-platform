/**
 * notion-sync-report.test.ts · Sprint 4 D5 · Reporting Track.
 *
 * 8 cases · happy path · NotConfigured · invalid type · invalid payload
 * · UpstreamError · unauthorized · invalid json · missing db env.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const { checkInternalKey } = vi.hoisted(() => ({
  checkInternalKey: vi.fn().mockReturnValue({ ok: true }),
}))
vi.mock("@/lib/internal-auth", () => ({ checkInternalKey }))

const { createPage, getReportDatabaseId } = vi.hoisted(() => ({
  createPage: vi.fn(),
  getReportDatabaseId: vi.fn(),
}))
vi.mock("@/lib/notion/client", () => ({
  createPage,
  getReportDatabaseId,
}))

import { POST } from "../src/app/api/notion/sync-report/route"

function buildReq(body: unknown, rawText?: string): Request {
  return new Request("http://localhost:3000/api/notion/sync-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawText ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  checkInternalKey.mockReturnValue({ ok: true })
  createPage.mockReset()
  getReportDatabaseId.mockReset()
})

describe("POST /api/notion/sync-report · Sprint 4 D5", () => {
  it("happy path · campaign · 200 + page_id", async () => {
    getReportDatabaseId.mockReturnValue("db-camp-123")
    createPage.mockResolvedValue({
      ok: true,
      data: { id: "page-abc", url: "https://notion.so/page-abc" },
    })

    const res = await POST(
      buildReq({
        type: "campaign",
        payload: { Name: { title: [{ text: { content: "Test" } }] } },
      }),
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      ok: boolean
      type: string
      page_id: string
      url: string
    }
    expect(j.ok).toBe(true)
    expect(j.type).toBe("campaign")
    expect(j.page_id).toBe("page-abc")
    expect(j.url).toBe("https://notion.so/page-abc")
    expect(createPage).toHaveBeenCalledWith("db-camp-123", expect.any(Object))
  })

  it("missing target database env · 503 service_unconfigured", async () => {
    getReportDatabaseId.mockReturnValue(null)

    const res = await POST(
      buildReq({ type: "weekly", payload: { Date: "2026-05-20" } }),
    )
    expect(res.status).toBe(503)
    const j = (await res.json()) as { error: string; detail: string }
    expect(j.error).toBe("service_unconfigured")
    expect(j.detail).toContain("NOTION_DATABASE_WEEKLYS")
    expect(createPage).not.toHaveBeenCalled()
  })

  it("NOTION_TOKEN missing · createPage returns NotConfigured · 503", async () => {
    getReportDatabaseId.mockReturnValue("db-client-456")
    createPage.mockResolvedValue({
      ok: false,
      code: "NotConfigured",
      detail: "NOTION_TOKEN env missing · skipping Notion sync",
    })

    const res = await POST(
      buildReq({ type: "client", payload: { Name: "Test client" } }),
    )
    expect(res.status).toBe(503)
    const j = (await res.json()) as { error: string; detail: string }
    expect(j.error).toBe("service_unconfigured")
    expect(j.detail).toContain("NOTION_TOKEN")
  })

  it("invalid type · 400 validation_failed", async () => {
    const res = await POST(
      buildReq({ type: "invalid_type", payload: {} }),
    )
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string; detail: string }
    expect(j.error).toBe("validation_failed")
    expect(j.detail).toContain("type must be one of")
    expect(getReportDatabaseId).not.toHaveBeenCalled()
  })

  it("invalid payload (string instead of object) · 400", async () => {
    const res = await POST(
      buildReq({ type: "campaign", payload: "not an object" }),
    )
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string; detail: string }
    expect(j.error).toBe("validation_failed")
    expect(j.detail).toContain("payload")
  })

  it("upstream Notion API error · 502", async () => {
    getReportDatabaseId.mockReturnValue("db-camp-123")
    createPage.mockResolvedValue({
      ok: false,
      code: "UpstreamError",
      detail: "Notion API: rate_limited",
    })

    const res = await POST(
      buildReq({ type: "campaign", payload: { Name: "X" } }),
    )
    expect(res.status).toBe(502)
    const j = (await res.json()) as { error: string; detail: string }
    expect(j.error).toBe("upstream_error")
    expect(j.detail).toBe("Notion API: rate_limited")
  })

  it("unauthorized · 401", async () => {
    checkInternalKey.mockReturnValue({ ok: false, reason: "missing x-internal-key" })

    const res = await POST(
      buildReq({ type: "campaign", payload: {} }),
    )
    expect(res.status).toBe(401)
    const j = (await res.json()) as { error: string }
    expect(j.error).toBe("unauthorized")
    expect(getReportDatabaseId).not.toHaveBeenCalled()
  })

  it("invalid json body · 400 invalid_json", async () => {
    const res = await POST(buildReq(null, "{not valid json"))
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toBe("invalid_json")
  })
})
