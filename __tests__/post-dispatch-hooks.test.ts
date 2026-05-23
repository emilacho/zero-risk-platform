/**
 * post-dispatch-hooks.test.ts · Sprint 5 wire-in E2E.
 *
 * Validates fire-and-forget hooks · journey orchestrator dispatch.ts call
 * pattern · NEVER blocks dispatch + NEVER throws upstream.
 *
 *  1. PRODUCE journey · stage='launch' · cliente con phone → notifyTemplate fires
 *  2. PRODUCE journey · stage='launch' · NO champion → hook NO-OP graceful
 *  3. PRODUCE journey · stage NO 'launch' → hook skip
 *  4. NOT PRODUCE journey · hook skip
 *  5. PRODUCE journey · stage='production' · params.social_caption + network → scheduleSocialContent fires
 *  6. PRODUCE journey · stage='production' · NO social_caption → skip
 *  7. PRODUCE journey · stage='production' · invalid network → skip
 *  8. Hook NEVER throws (DB error swallowed)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockInsertWhatsApp = vi.fn()
const mockInsertSocial = vi.fn()
const mockChampionLookup = { phone: null as string | null, name: null as string | null }

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === "whatsapp_messages") {
          mockInsertWhatsApp(row)
          return Promise.resolve({ data: null, error: null })
        }
        if (table === "social_posts") {
          return {
            select: () => ({
              single: () => {
                mockInsertSocial(row)
                return Promise.resolve({
                  data: {
                    id: "social-uuid",
                    status: "pending_approval",
                    scheduled_at: new Date(Date.now() + 60 * 60_000).toISOString(),
                  },
                  error: null,
                })
              },
            }),
          }
        }
        return Promise.resolve({ data: null, error: null })
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: mockChampionLookup.phone
                  ? { phone: mockChampionLookup.phone, name: mockChampionLookup.name }
                  : null,
                error: null,
              }),
          }),
        }),
      }),
    }),
  }),
}))

let originalFetch: typeof fetch
beforeEach(() => {
  mockInsertWhatsApp.mockReset()
  mockInsertSocial.mockReset()
  mockChampionLookup.phone = null
  mockChampionLookup.name = null
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

describe("firePostDispatchHooks · WhatsApp hook on PRODUCE launch", () => {
  it("PRODUCE + stage=launch + cliente phone wireado · notifyTemplate fires", async () => {
    mockChampionLookup.phone = "+593987654321"
    mockChampionLookup.name = "Emilio"
    // env unset · expect 503 graceful · row failed
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "launch",
      client_id: "naufrago",
      journey_id: "jid-1",
      params: {
        campaign_name: "Lanzamiento Náufrago",
        landing_url: "https://naufrago.example",
      },
    })
    expect(mockInsertWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "out",
        template_name: "campaign_published",
        status: "failed", // sin keys · graceful 503
        error_code: "env_missing",
      }),
    )
  })

  it("PRODUCE + launch + NO champion · hook NO-OP graceful (zero inserts)", async () => {
    mockChampionLookup.phone = null
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "launch",
      client_id: "no-champion-client",
      journey_id: "jid-2",
      params: {},
    })
    expect(mockInsertWhatsApp).not.toHaveBeenCalled()
  })

  it("PRODUCE + stage NOT launch · hook skip", async () => {
    mockChampionLookup.phone = "+593987654321"
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "production",
      client_id: "naufrago",
      journey_id: "jid-3",
      params: {},
    })
    expect(mockInsertWhatsApp).not.toHaveBeenCalled()
  })

  it("NOT PRODUCE journey · hook skip", async () => {
    mockChampionLookup.phone = "+593987654321"
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "ACQUIRE",
      stage: "won",
      client_id: "naufrago",
      journey_id: "jid-4",
      params: {},
    })
    expect(mockInsertWhatsApp).not.toHaveBeenCalled()
  })
})

describe("firePostDispatchHooks · Social hook on PRODUCE production/qa_review", () => {
  it("PRODUCE + production + social_caption + network IG · scheduleSocialContent fires pending_approval", async () => {
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "production",
      client_id: "naufrago",
      journey_id: "jid-5",
      params: {
        social_caption: "Lanzamos · surf escape Peniche",
        network: "instagram",
        media_urls: ["https://cdn/x.jpg"],
        created_by_agent: "editor-en-jefe",
      },
    })
    expect(mockInsertSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "instagram",
        status: "pending_approval",
        created_by: "editor-en-jefe",
      }),
    )
  })

  it("PRODUCE + production + NO social_caption · skip", async () => {
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "production",
      client_id: "naufrago",
      journey_id: "jid-6",
      params: { something_else: "x" },
    })
    expect(mockInsertSocial).not.toHaveBeenCalled()
  })

  it("PRODUCE + production + invalid network LinkedIn · skip", async () => {
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    await firePostDispatchHooks({
      journey: "PRODUCE",
      stage: "production",
      client_id: "naufrago",
      journey_id: "jid-7",
      params: {
        social_caption: "LI post",
        network: "linkedin", // NOT supported Sprint 5
      },
    })
    expect(mockInsertSocial).not.toHaveBeenCalled()
  })

  it("Hook NEVER throws (resilient to errors)", async () => {
    const { firePostDispatchHooks } = await import(
      "../src/lib/journey-orchestrator/post-dispatch-hooks"
    )
    // Should not throw even with malformed params
    await expect(
      firePostDispatchHooks({
        journey: "PRODUCE",
        stage: "launch",
        client_id: "naufrago",
        journey_id: "jid-8",
        params: { campaign_name: null, landing_url: undefined } as Record<
          string,
          unknown
        >,
      }),
    ).resolves.not.toThrow()
  })
})
