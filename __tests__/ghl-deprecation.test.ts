/**
 * GHL endpoints deprecation · Sprint 3 Día 5 · SPLIT mode.
 *
 * 7 endpoints retornan 410 Gone (uniform deprecation) · `send-email`
 * preserva el soft pass-through shim de PR #57 (Sprint 3 D2 · Resend
 * wire-in) porque Resend está live en main y los n8n callers existentes
 * deben seguir funcionando.
 *
 * 8 cases · 7 verifican 410 + 1 smoke verifica que send-email NO es 410
 * (sí es la shim · tiene su propia cobertura en PR #57's tests).
 *
 * `logDeprecation` side-effect mockeado vía vi.hoisted · el suite no
 * toca disco.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const { logDeprecation } = vi.hoisted(() => ({
  logDeprecation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/deprecation/log", () => ({ logDeprecation }))

import { POST as AddTaskPOST } from "../src/app/api/ghl/add-task/route"
import { POST as CreateCalendarPOST } from "../src/app/api/ghl/create-calendar-event/route"
import { GET as ExpansionGET } from "../src/app/api/ghl/expansion-intent/route"
import { GET as PipelineGET } from "../src/app/api/ghl/pipeline-summary/route"
import { GET as ChampionGET } from "../src/app/api/ghl/primary-champion/route"
import { GET as RelationshipsGET } from "../src/app/api/ghl/relationships/route"
import { POST as SendEmailPOST } from "../src/app/api/ghl/send-email/route"
import { POST as TagPOST } from "../src/app/api/ghl/tag/route"

const SUNSET = "2026-07-31"

function buildRequest(url: string, method: "GET" | "POST"): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "user-agent": "vitest" },
    body: method === "POST" ? JSON.stringify({}) : undefined,
  })
}

async function assert410(
  res: Response,
  expectedEndpoint: string,
  expectedReplacement: string | null,
) {
  expect(res.status).toBe(410)
  expect(res.headers.get("X-Deprecated")).toBe("true")
  expect(res.headers.get("X-Sunset-Date")).toBe(SUNSET)
  expect(res.headers.get("X-Replacement")).toBe(expectedReplacement ?? "tbd")
  expect(res.headers.get("Deprecation")).toBe(`date="${SUNSET}"`)
  expect(res.headers.get("Sunset")).toBe(SUNSET)

  const body = (await res.json()) as {
    error: string
    message: string
    sunset_date: string
    replacement: string | null
    docs: string
  }
  expect(body.error).toBe("Gone")
  expect(body.message).toContain(expectedEndpoint)
  expect(body.message).toContain("Stack V4")
  expect(body.sunset_date).toBe(SUNSET)
  expect(body.replacement).toBe(expectedReplacement)
  expect(body.docs).toContain("2026-05-20-stack-v4-ghl-out-migration-master-plan")
}

beforeEach(() => {
  logDeprecation.mockClear()
})

describe("GHL endpoints · 410 Gone deprecation (7) + send-email shim split · Stack V4 canon 2026-05-20", () => {
  it("POST /api/ghl/add-task · 410 · replacement=null", async () => {
    const res = await AddTaskPOST(buildRequest("/api/ghl/add-task", "POST"))
    await assert410(res, "ghl/add-task", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
    expect(logDeprecation.mock.calls[0]?.[0].endpoint).toBe("ghl/add-task")
  })

  it("POST /api/ghl/create-calendar-event · 410 · replacement=/api/calendar/book", async () => {
    const res = await CreateCalendarPOST(
      buildRequest("/api/ghl/create-calendar-event", "POST"),
    )
    await assert410(res, "ghl/create-calendar-event", "/api/calendar/book")
    expect(logDeprecation).toHaveBeenCalledOnce()
  })

  it("GET /api/ghl/expansion-intent · 410 · replacement=null", async () => {
    const res = await ExpansionGET(buildRequest("/api/ghl/expansion-intent", "GET"))
    await assert410(res, "ghl/expansion-intent", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
  })

  it("GET /api/ghl/pipeline-summary · 410 · replacement=null", async () => {
    const res = await PipelineGET(buildRequest("/api/ghl/pipeline-summary", "GET"))
    await assert410(res, "ghl/pipeline-summary", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
  })

  it("GET /api/ghl/primary-champion · 410 · replacement=null", async () => {
    const res = await ChampionGET(buildRequest("/api/ghl/primary-champion", "GET"))
    await assert410(res, "ghl/primary-champion", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
  })

  it("GET /api/ghl/relationships · 410 · replacement=null", async () => {
    const res = await RelationshipsGET(
      buildRequest("/api/ghl/relationships", "GET"),
    )
    await assert410(res, "ghl/relationships", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
    expect(logDeprecation.mock.calls[0]?.[0].method).toBe("GET")
  })

  it("POST /api/ghl/tag · 410 · replacement=null", async () => {
    const res = await TagPOST(buildRequest("/api/ghl/tag", "POST"))
    await assert410(res, "ghl/tag", null)
    expect(logDeprecation).toHaveBeenCalledOnce()
  })

  // ── SPLIT case ─────────────────────────────────────────────────────
  // send-email keeps PR #57's soft pass-through shim (forward to Resend
  // when key is live · 401 when internal auth missing). This case
  // verifies the shim is preserved · NOT replaced with 410 Gone. Full
  // shim coverage lives in PR #57's test suite.
  it("POST /api/ghl/send-email · shim preserved · NOT 410 · X-Successor=/api/email/send", async () => {
    const res = await SendEmailPOST(
      buildRequest("/api/ghl/send-email", "POST"),
    )
    expect(res.status).not.toBe(410)
    // The shim returns 401 (no internal auth) or 200 (Resend success) ·
    // either way it surfaces the PR #57 deprecation header set ·
    // distinct from the X-Deprecated triplet used by the 7 410 routes.
    expect(res.headers.get("X-Successor")).toBe("/api/email/send")
    expect(res.headers.get("X-Deprecated")).toBe("true")
    // `logDeprecation` (Sprint D5 helper) is NOT called for send-email ·
    // the shim has its own ghl_email_log audit trail.
    expect(logDeprecation).not.toHaveBeenCalled()
  })
})
