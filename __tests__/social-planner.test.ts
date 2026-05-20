/**
 * social-planner.test.ts · Sprint 4 · Camino B social planner tests.
 *
 * 5+ cases ·
 *   1. POST /schedule · happy path · 200 + row inserted
 *   2. POST /schedule · invalid network · 400
 *   3. POST /schedule · scheduled_at in past · 400
 *   4. POST /schedule · scheduled_at > 30 days future · 400
 *   5. POST /schedule · auth fails · 401
 *   6. GET  /posts · happy list with filters
 *   7. GET  /posts · invalid status filter · 400
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockAuth = vi.fn()
vi.mock("@/lib/internal-auth", () => ({
  checkInternalKey: (req: Request) => mockAuth(req),
}))

const mockInsertSingle = vi.fn()
const mockSelectQuery = {
  rows: [] as Array<Record<string, unknown>>,
  error: null as null | { message: string },
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            return mockInsertSingle(table, row)
          },
        }),
      }),
      select: () => {
        const builder = {
          order: () => builder,
          limit: () => builder,
          eq: () => builder,
          then: (resolve: (v: { data: Array<Record<string, unknown>>; error: null | { message: string } }) => unknown) =>
            resolve({ data: mockSelectQuery.rows, error: mockSelectQuery.error }),
        }
        return builder
      },
    }),
  }),
}))

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockReturnValue({ ok: true })
  mockInsertSingle.mockReset()
  mockSelectQuery.rows = []
  mockSelectQuery.error = null
})

afterEach(() => {
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

const futureIso = (msFromNow: number) =>
  new Date(Date.now() + msFromNow).toISOString()

// ============================================================================
// POST /api/social/schedule
// ============================================================================

describe("POST /api/social/schedule", () => {
  it("happy path · 200 + row inserted", async () => {
    mockInsertSingle.mockResolvedValue({
      data: {
        id: "uuid-row-1",
        network: "instagram",
        scheduled_at: futureIso(60_000),
        status: "scheduled",
      },
      error: null,
    })
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "instagram",
        content: "Lanzamos · surf escape Peniche · plazas abiertas",
        media_urls: ["https://cdn.example.com/peniche-1.jpg"],
        scheduled_at: futureIso(60 * 60_000), // 1h future
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.id).toBe("uuid-row-1")
    expect(json.network).toBe("instagram")
    expect(json.status).toBe("scheduled")
    const [table, inserted] = mockInsertSingle.mock.calls[0]
    expect(table).toBe("social_posts")
    expect(inserted.network).toBe("instagram")
    expect(inserted.status).toBe("scheduled")
  })

  it("invalid network · 400", async () => {
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "linkedin",
        content: "test",
        scheduled_at: futureIso(60_000),
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("E-SOCIAL-NETWORK")
  })

  it("scheduled_at in past · 400", async () => {
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "facebook",
        content: "test",
        scheduled_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("E-SOCIAL-SCHEDULE-PAST")
  })

  it("scheduled_at > 30 days future · 400", async () => {
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "facebook",
        content: "test",
        scheduled_at: futureIso(31 * 24 * 3600 * 1000),
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("E-SOCIAL-SCHEDULE-FAR")
  })

  it("auth fail · 401", async () => {
    mockAuth.mockReturnValue({ ok: false, reason: "missing key" })
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "instagram",
        content: "test",
        scheduled_at: futureIso(60_000),
      }),
    )
    expect(res.status).toBe(401)
  })

  it("media_urls > 10 · 400", async () => {
    const { POST } = await import("../src/app/api/social/schedule/route")
    const res = await POST(
      buildPost("/api/social/schedule", {
        network: "instagram",
        content: "test",
        media_urls: Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`),
        scheduled_at: futureIso(60_000),
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("E-SOCIAL-MEDIA")
  })
})

// ============================================================================
// GET /api/social/posts
// ============================================================================

describe("GET /api/social/posts", () => {
  it("happy list · 200 + rows", async () => {
    mockSelectQuery.rows = [
      {
        id: "p1",
        network: "instagram",
        content: "post 1",
        status: "scheduled",
      },
      {
        id: "p2",
        network: "facebook",
        content: "post 2",
        status: "published",
      },
    ]
    const { GET } = await import("../src/app/api/social/posts/route")
    const res = await GET(buildGet("/api/social/posts?limit=10"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(2)
  })

  it("invalid status filter · 400", async () => {
    const { GET } = await import("../src/app/api/social/posts/route")
    const res = await GET(
      buildGet("/api/social/posts?status=banana"),
    )
    expect(res.status).toBe(400)
  })
})
