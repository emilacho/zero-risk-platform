/**
 * whatsapp-meta-graph.test.ts · Sprint 4 · WhatsApp wrapper + 3 endpoints.
 *
 * 8+ canonical cases per dispatch ·
 *  1. POST /api/whatsapp/send · happy template · 200 + provider_message_id
 *  2. POST /api/whatsapp/send · happy text · 200 + provider_message_id
 *  3. POST /api/whatsapp/send · invalid phone E.164 · 400
 *  4. POST /api/whatsapp/send · sin keys · 503
 *  5. POST /api/whatsapp/send · Meta 429 rate limit · 429
 *  6. POST /api/whatsapp/send · auth fail · 401
 *  7. POST /api/whatsapp/webhook · valid HMAC · 200 + processed
 *  8. POST /api/whatsapp/webhook · invalid HMAC · 401
 *  9. GET  /api/whatsapp/webhook · verify-token challenge · 200 echo challenge
 * 10. GET  /api/whatsapp/templates · happy · 200 + list
 * 11. GET  /api/whatsapp/templates · sin keys · 503
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"

const mockAuth = vi.fn()
vi.mock("@/lib/internal-auth", () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockInsertCapture = vi.fn()
const mockUpdateCapture = vi.fn()
const mockMaybeSingleResult = {
  data: null as { id: string } | null,
  error: null as null | { message: string },
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mockInsertCapture(table, row)
        return Promise.resolve({ data: null, error: null })
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(mockMaybeSingleResult),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          mockUpdateCapture(table, patch, col, val)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    }),
  }),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

const VALID_PHONE_ID = "012345678901234"
const VALID_TOKEN = "EAATESTFAKEXX-DO-NOT-USE-ROTATE"
const VALID_APP_SECRET = "test-fake-app-secret-32-chars-aaa"

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockInsertCapture.mockReset()
  mockUpdateCapture.mockReset()
  mockMaybeSingleResult.data = null
  originalFetch = globalThis.fetch
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", VALID_PHONE_ID)
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", VALID_TOKEN)
  vi.stubEnv("META_APP_SECRET", VALID_APP_SECRET)
  vi.stubEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", "98765432109876")
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "verify-token-fake")
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

const buildPost = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const buildGet = (path: string) =>
  new Request(`http://localhost:3000${path}`, { method: "GET" })

const okJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

// ============================================================================
// POST /api/whatsapp/send
// ============================================================================

describe("POST /api/whatsapp/send", () => {
  it("happy template · 200 + provider_message_id", async () => {
    setMockFetch(async (url) => {
      expect(String(url)).toContain("graph.facebook.com/v21.0")
      expect(String(url)).toContain(VALID_PHONE_ID)
      return okJsonResponse({
        messages: [{ id: "wamid.HBgLNTM..." }],
      })
    })
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "+593987654321",
        template_name: "welcome_es",
        variables: ["Emilio"],
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.provider_message_id).toBe("wamid.HBgLNTM...")
    expect(json.kind).toBe("template")
    expect(mockInsertCapture).toHaveBeenCalledWith(
      "whatsapp_messages",
      expect.objectContaining({
        direction: "out",
        template_name: "welcome_es",
        status: "sent",
        provider_message_id: "wamid.HBgLNTM...",
      }),
    )
  })

  it("happy text reply · 200 + provider_message_id", async () => {
    setMockFetch(async () =>
      okJsonResponse({ messages: [{ id: "wamid.TEXT123" }] }),
    )
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "+593987654321",
        text_body: "Hola · respondemos dentro del reply window 24h",
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.kind).toBe("text")
  })

  it("invalid phone E.164 · 400", async () => {
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "987-not-e164",
        template_name: "welcome_es",
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.code).toBe("invalid_phone")
  })

  it("sin keys · 503 not_configured", async () => {
    vi.unstubAllEnvs()
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "+593987654321",
        template_name: "welcome_es",
      }),
    )
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe("not_configured")
    expect(json.detail).toContain("WHATSAPP_PHONE_NUMBER_ID")
  })

  it("Meta 429 rate limited · 429", async () => {
    setMockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 4, message: "Application request limit reached" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
    )
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "+593987654321",
        template_name: "welcome_es",
      }),
    )
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe("rate_limited")
  })

  it("auth fail · 401", async () => {
    mockAuth.mockReturnValue({ ok: false, reason: "missing key" })
    const { POST } = await import("../src/app/api/whatsapp/send/route")
    const res = await POST(
      buildPost("/api/whatsapp/send", {
        to: "+593987654321",
        template_name: "welcome_es",
      }),
    )
    expect(res.status).toBe(401)
  })
})

// ============================================================================
// POST /api/whatsapp/webhook
// ============================================================================

describe("POST /api/whatsapp/webhook", () => {
  function signPayload(body: string): string {
    const h = createHmac("sha256", VALID_APP_SECRET)
    h.update(body)
    return `sha256=${h.digest("hex")}`
  }

  it("valid HMAC · 200 + processed inbound message", async () => {
    const payload = {
      entry: [
        {
          id: "wabaid",
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "593987654321",
                    id: "wamid.INBOUND1",
                    text: { body: "Hola me interesa" },
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const rawBody = JSON.stringify(payload)
    const sig = signPayload(rawBody)

    const req = new Request("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
      },
      body: rawBody,
    })

    const { POST } = await import("../src/app/api/whatsapp/webhook/route")
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.processed_count).toBe(1)
    expect(mockInsertCapture).toHaveBeenCalledWith(
      "whatsapp_messages",
      expect.objectContaining({
        direction: "in",
        body: "Hola me interesa",
        provider_message_id: "wamid.INBOUND1",
        status: "received",
      }),
    )
  })

  it("invalid HMAC · 401", async () => {
    const rawBody = JSON.stringify({ entry: [] })
    const req = new Request("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      body: rawBody,
    })
    const { POST } = await import("../src/app/api/whatsapp/webhook/route")
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe("invalid_signature")
  })

  it("status update · UPDATEs existing row by WAMID", async () => {
    mockMaybeSingleResult.data = { id: "row-uuid-existing" }
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    recipient_id: "593987654321",
                    id: "wamid.OUT1",
                    status: "delivered",
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const rawBody = JSON.stringify(payload)
    const req = new Request("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": signPayload(rawBody) },
      body: rawBody,
    })
    const { POST } = await import("../src/app/api/whatsapp/webhook/route")
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockUpdateCapture).toHaveBeenCalledWith(
      "whatsapp_messages",
      expect.objectContaining({ status: "delivered" }),
      "id",
      "row-uuid-existing",
    )
  })
})

// ============================================================================
// GET /api/whatsapp/webhook · verify-token challenge
// ============================================================================

describe("GET /api/whatsapp/webhook", () => {
  it("verify-token challenge · 200 echoes challenge", async () => {
    const { GET } = await import("../src/app/api/whatsapp/webhook/route")
    const res = await GET(
      buildGet(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-fake&hub.challenge=challenge-xyz-123",
      ),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe("challenge-xyz-123")
  })

  it("wrong verify_token · 403", async () => {
    const { GET } = await import("../src/app/api/whatsapp/webhook/route")
    const res = await GET(
      buildGet(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=xyz",
      ),
    )
    expect(res.status).toBe(403)
  })
})

// ============================================================================
// GET /api/whatsapp/templates
// ============================================================================

describe("GET /api/whatsapp/templates", () => {
  it("happy · 200 + list templates", async () => {
    setMockFetch(async (url) => {
      expect(String(url)).toContain("/message_templates")
      return okJsonResponse({
        data: [
          {
            name: "welcome_es",
            language: "es",
            status: "APPROVED",
            category: "UTILITY",
          },
          {
            name: "booking_reminder",
            language: "es",
            status: "APPROVED",
            category: "UTILITY",
          },
        ],
      })
    })
    const { GET } = await import("../src/app/api/whatsapp/templates/route")
    const res = await GET(buildGet("/api/whatsapp/templates"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(2)
    expect(json.templates[0].name).toBe("welcome_es")
  })

  it("sin keys · 503", async () => {
    vi.unstubAllEnvs()
    const { GET } = await import("../src/app/api/whatsapp/templates/route")
    const res = await GET(buildGet("/api/whatsapp/templates"))
    expect(res.status).toBe(503)
  })
})
