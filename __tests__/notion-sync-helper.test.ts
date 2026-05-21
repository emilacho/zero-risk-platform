/**
 * notion-sync-helper.test.ts · Sprint 5 wire-in.
 *
 * Covers `syncReport` + `syncReportSafe` · the direct lib invocation
 * surface used by OnboardingOrchestrator post-Phase-1 + NEXUS Phase 7
 * close + the weekly cron.
 *
 * 6 cases ·
 *   1. happy path · createPage ok → status=synced + ok=true
 *   2. database id missing → status=unconfigured + ok=false (no createPage call)
 *   3. createPage NotConfigured → status=unconfigured
 *   4. createPage UpstreamError → status=upstream_error
 *   5. createPage InvalidInput → status=invalid_input
 *   6. syncReportSafe swallows unexpected throw → status=upstream_error
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const { createPage, getReportDatabaseId } = vi.hoisted(() => ({
  createPage: vi.fn(),
  getReportDatabaseId: vi.fn(),
}))
vi.mock("@/lib/notion/client", () => ({ createPage, getReportDatabaseId }))

import {
  syncReport,
  syncReportSafe,
} from "../src/lib/notion/sync-helper"

beforeEach(() => {
  createPage.mockReset()
  getReportDatabaseId.mockReset()
})

describe("notion sync-helper · syncReport", () => {
  it("happy path · createPage ok → synced", async () => {
    getReportDatabaseId.mockReturnValue("db-camp-123")
    createPage.mockResolvedValue({
      ok: true,
      data: { id: "page-abc", url: "https://notion.so/page-abc" },
    })

    const r = await syncReport("campaign", { Name: "Test" })
    expect(r.ok).toBe(true)
    expect(r.status).toBe("synced")
    expect(r.page_id).toBe("page-abc")
    expect(r.url).toBe("https://notion.so/page-abc")
    expect(createPage).toHaveBeenCalledWith("db-camp-123", { Name: "Test" })
  })

  it("database id missing → unconfigured · NO createPage call", async () => {
    getReportDatabaseId.mockReturnValue(null)

    const r = await syncReport("client", { Name: "X" })
    expect(r.ok).toBe(false)
    expect(r.status).toBe("unconfigured")
    expect(r.detail).toContain("NOTION_DATABASE_CLIENTS")
    expect(createPage).not.toHaveBeenCalled()
  })

  it("createPage NotConfigured → unconfigured", async () => {
    getReportDatabaseId.mockReturnValue("db-weekly")
    createPage.mockResolvedValue({
      ok: false,
      code: "NotConfigured",
      detail: "NOTION_TOKEN env missing",
    })

    const r = await syncReport("weekly", { Date: "2026-05-20" })
    expect(r.status).toBe("unconfigured")
    expect(r.detail).toContain("NOTION_TOKEN")
  })

  it("createPage UpstreamError → upstream_error", async () => {
    getReportDatabaseId.mockReturnValue("db-camp")
    createPage.mockResolvedValue({
      ok: false,
      code: "UpstreamError",
      detail: "rate_limited",
    })

    const r = await syncReport("campaign", { Name: "Y" })
    expect(r.status).toBe("upstream_error")
    expect(r.detail).toBe("rate_limited")
  })

  it("createPage InvalidInput → invalid_input", async () => {
    getReportDatabaseId.mockReturnValue("db-camp")
    createPage.mockResolvedValue({
      ok: false,
      code: "InvalidInput",
      detail: "properties shape invalid",
    })

    const r = await syncReport("campaign", { Name: "Z" })
    expect(r.status).toBe("invalid_input")
  })
})

describe("notion sync-helper · syncReportSafe", () => {
  it("swallows unexpected throw · returns upstream_error", async () => {
    getReportDatabaseId.mockImplementation(() => {
      throw new Error("getReportDatabaseId blew up")
    })

    const r = await syncReportSafe("campaign", { Name: "X" }, "[test]")
    expect(r.ok).toBe(false)
    expect(r.status).toBe("upstream_error")
    expect(r.detail).toContain("blew up")
  })
})
