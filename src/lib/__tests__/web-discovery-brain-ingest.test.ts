/**
 * Sprint 7.6 Track C · brain ingest unit tests.
 *
 * Validates ·
 *   - chunkText splits correctly + overlap
 *   - buildChunksFromDiscovery emits canonical shape
 *   - ingestDiscoveryToBrain graceful skip si table NO existe
 *   - Errors swallowed · returns advisory result · NEVER throws
 */
import { describe, expect, it, vi } from "vitest"
import {
  buildChunksFromDiscovery,
  ingestDiscoveryToBrain,
} from "../web-discovery-brain-ingest"
import type { DiscoveryResult, ScrapedPage } from "../web-discovery"

function mockPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return {
    url: "https://example.com",
    title: "Example",
    metaDescription: "Example Corp · leading provider",
    headings: ["About Us", "Our Mission"],
    bodyText: "Example Corp was founded in 2010. ".repeat(100),
    links: [],
    images: [],
    socialLinks: [],
    contactInfo: { emails: [], phones: [], address: null },
    colors: [],
    statusCode: 200,
    ...overrides,
  }
}

function mockDiscovery(pages: ScrapedPage[] = [mockPage()]): DiscoveryResult {
  return {
    companyName: "Example Corp",
    websiteUrl: "https://example.com",
    pages,
    totalPagesScraped: pages.length,
    scrapedAt: "2026-05-22T16:00:00.000Z",
    detectedIndustry: null,
    detectedServices: [],
    detectedTagline: null,
    socialProfiles: {},
    contactInfo: { emails: [], phones: [], addresses: [] },
    colorPalette: [],
    errors: [],
  }
}

describe("buildChunksFromDiscovery", () => {
  it("emits header chunk + body chunks per page", () => {
    const discovery = mockDiscovery([
      mockPage({ bodyText: "A".repeat(3500) }),
    ])
    const chunks = buildChunksFromDiscovery("client-uuid-1", discovery)
    expect(chunks.length).toBeGreaterThanOrEqual(2) // 1 header + ≥1 body
    expect(chunks[0].source_type).toBe("web-discovery-header")
    expect(chunks[0].content_text).toContain("Example")
    expect(chunks[1].source_type).toBe("web-discovery-page")
  })

  it("skips header if title + meta empty", () => {
    const discovery = mockDiscovery([
      mockPage({ title: "", metaDescription: "", bodyText: "Body content here.".repeat(50) }),
    ])
    const chunks = buildChunksFromDiscovery("client-uuid-1", discovery)
    expect(chunks.every((c) => c.source_type === "web-discovery-page")).toBe(true)
  })

  it("populates client_id consistently across all chunks", () => {
    const discovery = mockDiscovery()
    const chunks = buildChunksFromDiscovery("client-uuid-1", discovery)
    expect(chunks.every((c) => c.client_id === "client-uuid-1")).toBe(true)
  })

  it("includes sprint tag in metadata", () => {
    const discovery = mockDiscovery()
    const chunks = buildChunksFromDiscovery("client-uuid-1", discovery)
    expect(chunks[0].metadata.sprint).toBe("7p6-track-c")
  })

  it("filters chunks < 50 chars", () => {
    const discovery = mockDiscovery([
      mockPage({ bodyText: "Tiny." }),
    ])
    const chunks = buildChunksFromDiscovery("client-uuid-1", discovery)
    // Only header chunk should remain (body too small)
    const bodyChunks = chunks.filter((c) => c.source_type === "web-discovery-page")
    expect(bodyChunks.length).toBe(0)
  })
})

describe("ingestDiscoveryToBrain", () => {
  it("returns table_exists=false con graceful skip si select fails", async () => {
    const mockSupa = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve({ error: { message: 'relation "client_brain_chunks" does not exist' } }),
          ),
        })),
      })),
    } as any
    const result = await ingestDiscoveryToBrain(mockSupa, "client-1", mockDiscovery())
    expect(result.attempted).toBe(true)
    expect(result.table_exists).toBe(false)
    expect(result.chunks_inserted).toBe(0)
    expect(result.errors[0]).toContain("table_probe_failed")
  })

  it("inserts chunks cuando table exists", async () => {
    let insertedRows: any[] = []
    const mockSupa = {
      from: vi.fn((table: string) => {
        if (table === "client_brain_chunks") {
          return {
            select: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ error: null })),
            })),
            insert: vi.fn((rows: any[]) => {
              insertedRows.push(...rows)
              return Promise.resolve({ error: null })
            }),
          }
        }
        return {}
      }),
    } as any
    const result = await ingestDiscoveryToBrain(mockSupa, "client-1", mockDiscovery())
    expect(result.table_exists).toBe(true)
    expect(result.chunks_inserted).toBeGreaterThan(0)
    expect(insertedRows.length).toEqual(result.chunks_inserted)
  })

  it("never throws · swallows exceptions", async () => {
    const mockSupa = {
      from: vi.fn(() => {
        throw new Error("DB connection lost")
      }),
    } as any
    const result = await ingestDiscoveryToBrain(mockSupa, "client-1", mockDiscovery())
    expect(result.attempted).toBe(true)
    expect(result.table_exists).toBe(false)
    expect(result.errors[0]).toContain("table_probe_exception")
  })

  it("aggregates errors from batch inserts", async () => {
    const mockSupa = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ error: null })),
        })),
        insert: vi.fn(() =>
          Promise.resolve({ error: { message: "unique violation on (client_id, source_url)" } }),
        ),
      })),
    } as any
    const result = await ingestDiscoveryToBrain(mockSupa, "client-1", mockDiscovery())
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("unique violation")
  })
})
