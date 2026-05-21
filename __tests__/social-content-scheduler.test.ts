/**
 * social-content-scheduler.test.ts · Sprint 5 wire-in.
 *
 * Validates ·
 *  1. scheduleSocialContent happy IG · row pending_approval inserted
 *  2. scheduleSocialContent happy FB · row pending_approval inserted
 *  3. Invalid network · ok=false IG/FB only
 *  4. media_urls > 10 · ok=false
 *  5. scheduled_at undefined · default now + 1h
 *  6. approveSocialPost · UPDATE status pending_approval → scheduled
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockInsertCapture = vi.fn()
const mockUpdateCapture = vi.fn()
const insertResultRef = {
  data: null as { id: string; status: string; scheduled_at: string } | null,
  error: null as null | { message: string },
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            mockInsertCapture(row)
            return Promise.resolve(insertResultRef)
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => ({
          eq: () => {
            mockUpdateCapture(patch, col, val)
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
    }),
  }),
}))

beforeEach(() => {
  mockInsertCapture.mockReset()
  mockUpdateCapture.mockReset()
  insertResultRef.data = {
    id: "uuid-row-1",
    status: "pending_approval",
    scheduled_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  }
  insertResultRef.error = null
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("scheduleSocialContent", () => {
  it("happy IG · row pending_approval inserted", async () => {
    const { scheduleSocialContent } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const result = await scheduleSocialContent({
      network: "instagram",
      content: "Lanzamos · surf escape Peniche · plazas abiertas",
      media_urls: ["https://cdn/x.jpg"],
      client_id: "peniche-surf-escape",
      created_by_agent: "editor-en-jefe",
      caller_phase: "production",
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe("uuid-row-1")
    expect(result.status).toBe("pending_approval")
    expect(mockInsertCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "instagram",
        status: "pending_approval",
        created_by: "editor-en-jefe",
        caller: "nexus-production-scheduler",
      }),
    )
  })

  it("happy FB · row pending_approval inserted", async () => {
    const { scheduleSocialContent } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const result = await scheduleSocialContent({
      network: "facebook",
      content: "FB post · brand voice cliente",
    })
    expect(result.ok).toBe(true)
    expect(mockInsertCapture).toHaveBeenCalledWith(
      expect.objectContaining({ network: "facebook" }),
    )
  })

  it("invalid network · ok=false IG/FB only", async () => {
    const { scheduleSocialContent } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const result = await scheduleSocialContent({
      network: "linkedin" as "facebook",
      content: "test",
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid network")
  })

  it("media_urls > 10 · ok=false", async () => {
    const { scheduleSocialContent } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const result = await scheduleSocialContent({
      network: "instagram",
      content: "test",
      media_urls: Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("media_urls exceeds")
  })

  it("scheduled_at undefined · default ~ now + 1h", async () => {
    const { scheduleSocialContent } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const before = Date.now()
    await scheduleSocialContent({
      network: "instagram",
      content: "test",
    })
    const inserted = mockInsertCapture.mock.calls[0][0]
    const scheduledMs = new Date(inserted.scheduled_at as string).getTime()
    // Default delay should be ~1h · allow ±10s
    expect(scheduledMs).toBeGreaterThan(before + 60 * 60_000 - 10_000)
    expect(scheduledMs).toBeLessThan(before + 60 * 60_000 + 10_000)
  })
})

describe("approveSocialPost", () => {
  it("UPDATE status pending_approval → scheduled", async () => {
    const { approveSocialPost } = await import(
      "../src/lib/integrations/social-content-scheduler"
    )
    const result = await approveSocialPost("uuid-row-1", "emilio")
    expect(result.ok).toBe(true)
    const [patch, col, val] = mockUpdateCapture.mock.calls[0]
    expect(patch.status).toBe("scheduled")
    expect(col).toBe("id")
    expect(val).toBe("uuid-row-1")
  })
})
