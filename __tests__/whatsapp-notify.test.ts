/**
 * whatsapp-notify.test.ts · Sprint 5 wire-in · WhatsApp helper E2E.
 *
 * Validates ·
 *  1. notifyTemplate sin keys → 503 graceful · row inserted con status=failed
 *  2. notifyTemplate happy → row inserted con status=sent + provider_message_id
 *  3. notifyText sin keys → status=failed env_missing
 *  4. shouldNotifyClient · no champion → eligible=false reason=no_primary_champion
 *  5. shouldNotifyClient · champion sin phone → reason=champion_phone_missing
 *  6. shouldNotifyClient · champion con phone → eligible=true
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockInsertCapture = vi.fn()
const mockSelectQuery = {
  maybeSingleResult: null as { phone: string | null; name: string | null } | null,
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mockInsertCapture(row)
        return Promise.resolve({ data: null, error: null })
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: mockSelectQuery.maybeSingleResult,
                error: null,
              }),
          }),
        }),
      }),
    }),
  }),
}))

let originalFetch: typeof fetch
function setMockFetch(impl: (url: string) => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch
}

beforeEach(() => {
  mockInsertCapture.mockReset()
  mockSelectQuery.maybeSingleResult = null
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

describe("notifyTemplate · WhatsApp wire-in helper", () => {
  it("sin keys · row inserted con status=failed env_missing", async () => {
    vi.unstubAllEnvs()
    const { notifyTemplate } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await notifyTemplate({
      to_phone: "+593987654321",
      template_name: "campaign_published",
      variables: ["TestCampaign", "https://landing.test"],
      context: "nexus-publish",
    })
    expect(result.attempted).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.code).toBe("env_missing")
    expect(mockInsertCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "out",
        template_name: "campaign_published",
        status: "failed",
        error_code: "env_missing",
        caller: expect.stringContaining("notify-template:nexus-publish"),
      }),
    )
  })

  it("happy · row inserted con status=sent + provider_message_id", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "012345678901234")
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "XX-TEST-TOKEN-DO-NOT-USE")
    vi.stubEnv("META_APP_SECRET", "XX-TEST-SECRET-DO-NOT-USE-32-CHARS")
    setMockFetch(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.HAPPY1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const { notifyTemplate } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await notifyTemplate({
      to_phone: "+593987654321",
      template_name: "campaign_published",
      variables: ["TestCampaign", "https://landing.test"],
      context: "nexus-publish",
      client_id: "naufrago",
    })
    expect(result.ok).toBe(true)
    expect(result.provider_message_id).toBe("wamid.HAPPY1")
    expect(mockInsertCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        provider_message_id: "wamid.HAPPY1",
      }),
    )
  })
})

describe("notifyText · WhatsApp wire-in helper", () => {
  it("sin keys · status=failed", async () => {
    vi.unstubAllEnvs()
    const { notifyText } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await notifyText({
      to_phone: "+593987654321",
      text_body: "Test",
      context: "hitl-callback",
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe("env_missing")
    expect(mockInsertCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "out",
        status: "failed",
        body: "Test",
      }),
    )
  })
})

describe("shouldNotifyClient · client_champions lookup", () => {
  it("no champion → eligible=false reason=no_primary_champion", async () => {
    mockSelectQuery.maybeSingleResult = null
    const { shouldNotifyClient } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await shouldNotifyClient("naufrago")
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("no_primary_champion")
    expect(result.phone).toBeNull()
  })

  it("champion sin phone → reason=champion_phone_missing", async () => {
    mockSelectQuery.maybeSingleResult = { phone: null, name: "Emilio" }
    const { shouldNotifyClient } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await shouldNotifyClient("naufrago")
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("champion_phone_missing")
    expect(result.champion_name).toBe("Emilio")
  })

  it("champion con phone → eligible=true", async () => {
    mockSelectQuery.maybeSingleResult = {
      phone: "+593987654321",
      name: "Emilio",
    }
    const { shouldNotifyClient } = await import(
      "../src/lib/integrations/whatsapp-notify"
    )
    const result = await shouldNotifyClient("naufrago")
    expect(result.eligible).toBe(true)
    expect(result.phone).toBe("+593987654321")
    expect(result.reason).toBe("ok")
  })
})
