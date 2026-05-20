/**
 * sms-twilio.test.ts · Sprint #3 Día 3 · Twilio wrapper + endpoint tests.
 *
 * 5 canonical cases per dispatch ·
 *   1. happy · 200 · sid + segments + cost_estimate_usd returned
 *   2. invalid phone · 400 · E.164 validation rejects malformed `to`
 *   3. rate limit · 429 · Twilio 429 surfaced as `code: rate_limited`
 *   4. missing env · 503 · env vars unset · `not_configured` graceful
 *   5. auth fail · 401 · INTERNAL_API_KEY check rejects missing header
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockAuth = vi.fn()
vi.mock("@/lib/internal-auth", () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  originalFetch = globalThis.fetch
  // Test fixtures · intentionally NON-matching Twilio SID prefix to avoid
  // GitHub secret scanner false-positive. Wrapper never validates AC prefix.
  vi.stubEnv("TWILIO_ACCOUNT_SID", "XX-TEST-FAKE-SID-DO-NOT-USE-ROTATE")
  vi.stubEnv("TWILIO_AUTH_TOKEN", "XX-TEST-FAKE-TOKEN-DO-NOT-USE-ROTATE")
  vi.stubEnv("TWILIO_PHONE_NUMBER", "+15551234567")
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

const buildPost = (body: unknown) =>
  new Request("http://localhost:3000/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const okJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

// ─── Test 1 · happy path ────────────────────────────────────────────────

describe("POST /api/sms/send", () => {
  it("happy path · 200 · returns sid + segments + cost_estimate", async () => {
    setMockFetch(async (url) => {
      expect(String(url)).toContain("twilio.com")
      return okJsonResponse({
        sid: "SM1234567890abcdef",
        status: "queued",
      })
    })
    const { POST } = await import("../src/app/api/sms/send/route")
    const res = await POST(
      buildPost({ to: "+15559876543", body: "Hola desde Zero Risk" }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.sid).toBe("SM1234567890abcdef")
    expect(json.to).toBe("+15559876543")
    expect(json.from).toBe("+15551234567")
    expect(json.segments).toBe(1)
    expect(json.cost_estimate_usd).toBeCloseTo(0.0079, 4)
  })

  // ─── Test 2 · invalid phone ──────────────────────────────────────────

  it("invalid phone · 400 · E.164 validation rejects malformed `to`", async () => {
    const { POST } = await import("../src/app/api/sms/send/route")
    const res = await POST(
      buildPost({ to: "555-not-e164", body: "Hola" }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.code).toBe("invalid_phone")
  })

  // ─── Test 3 · rate limit ─────────────────────────────────────────────

  it("rate limit · 429 · Twilio 429 surfaced as code: rate_limited", async () => {
    setMockFetch(
      async () =>
        new Response(
          JSON.stringify({
            code: 20429,
            message: "Too Many Requests",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
    )
    const { POST } = await import("../src/app/api/sms/send/route")
    const res = await POST(
      buildPost({ to: "+15559876543", body: "Spam test" }),
    )
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.code).toBe("rate_limited")
  })

  // ─── Test 4 · missing env ────────────────────────────────────────────

  it("missing env · 503 · not_configured graceful (NOT 500)", async () => {
    vi.unstubAllEnvs()
    const { POST } = await import("../src/app/api/sms/send/route")
    const res = await POST(
      buildPost({ to: "+15559876543", body: "Sin env" }),
    )
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toBe("not_configured")
    expect(json.detail).toContain("TWILIO_ACCOUNT_SID")
    expect(json.detail).toContain("TWILIO_AUTH_TOKEN")
    expect(json.detail).toContain("TWILIO_PHONE_NUMBER")
  })

  // ─── Test 5 · auth fail ──────────────────────────────────────────────

  it("auth fail · 401 · INTERNAL_API_KEY check rejects missing header", async () => {
    mockAuth.mockReturnValue({
      ok: false,
      reason: "Missing x-api-key header",
    })
    const { POST } = await import("../src/app/api/sms/send/route")
    const res = await POST(
      buildPost({ to: "+15559876543", body: "Sin auth" }),
    )
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe("unauthorized")
  })
})

// ─── Bonus · wrapper unit tests (no endpoint surface) ───────────────────

describe("sendSms wrapper (unit)", () => {
  it("multi-segment body · returns segments > 1 + cost adjusted", async () => {
    setMockFetch(async () =>
      okJsonResponse({ sid: "SMmulti", status: "queued" }),
    )
    const { sendSms } = await import("../src/lib/sms/twilio")
    const longBody = "a".repeat(400) // 3 segments (400 / 153 = 2.6 → ceil 3)
    const result = await sendSms({ to: "+15559876543", body: longBody })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.segments).toBe(3)
      expect(result.cost_estimate_usd).toBeCloseTo(3 * 0.0079, 4)
    }
  })

  it("body > 1600 chars · invalid_body", async () => {
    const { sendSms } = await import("../src/lib/sms/twilio")
    const result = await sendSms({
      to: "+15559876543",
      body: "x".repeat(1700),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("invalid_body")
    }
  })

  it("invalid `from` E.164 · invalid_phone", async () => {
    const { sendSms } = await import("../src/lib/sms/twilio")
    const result = await sendSms({
      to: "+15559876543",
      body: "Hola",
      from: "not-e164",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("invalid_phone")
    }
  })
})
