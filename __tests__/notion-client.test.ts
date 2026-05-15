/**
 * Unit tests for the Notion helper lib + the four /api/notion/* handlers.
 *
 * Strategy: mock `@notionhq/client` at the module boundary so no test reaches
 * the real Notion API. Each handler is exercised through its `POST` export
 * with a hand-rolled `Request`. Auth is stubbed via `checkInternalKey`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mock the Notion SDK ─────────────────────────────────────────────────────
// Use a real class so `new Client(...)` works. `vi.fn(() => ...)` returns a
// callable, not a constructor, and the production code uses `new Client()`.
const { mockPagesCreate } = vi.hoisted(() => ({ mockPagesCreate: vi.fn() }));
vi.mock("@notionhq/client", () => {
  class MockClient {
    pages = { create: mockPagesCreate };
    constructor(_opts?: unknown) {
      /* swallow */
    }
  }
  return { Client: MockClient };
});

// ── Stub auth so handlers reach happy path / fail path predictably ─────────
const checkInternalKeyMock = vi.fn();
vi.mock("@/lib/internal-auth", () => ({
  checkInternalKey: (...args: unknown[]) => checkInternalKeyMock(...args),
}));

// ── Stub supabase-admin · audit logs are best-effort ───────────────────────
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async () => ({ data: null, error: null }),
      select: () => ({ single: async () => ({ data: { id: "log_id" }, error: null }) }),
    }),
  }),
}));

// ── Stub validateInput so we don't need the real Ajv schemas wired ─────────
vi.mock("@/lib/input-validator", () => ({
  validateInput: async <T>(request: Request) => {
    try {
      const body = (await request.json()) as T;
      return { ok: true as const, data: body };
    } catch {
      return { ok: true as const, data: {} as T };
    }
  },
}));

import {
  paragraph,
  heading2,
  heading3,
  bullet,
  divider,
  bulletList,
  resolveParentPageId,
  createSubpage,
  __resetNotionClientForTests,
  NotionConfigError,
} from "../src/lib/notion-client";
import { POST as workspaceHandler } from "../src/app/api/notion/create-client-workspace/route";
import { POST as qbrHandler } from "../src/app/api/notion/create-qbr-page/route";
import { POST as planHandler } from "../src/app/api/notion/create-success-plan/route";
import { POST as weeklyHandler } from "../src/app/api/notion/create-weekly-report/route";

function buildReq(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function happyNotionResponse() {
  return {
    id: "page_abc123",
    url: "https://www.notion.so/Test-Page-abc123",
    created_time: "2026-05-15T09:00:00.000Z",
  };
}

beforeEach(() => {
  mockPagesCreate.mockReset();
  mockPagesCreate.mockResolvedValue(happyNotionResponse());
  checkInternalKeyMock.mockReset();
  checkInternalKeyMock.mockReturnValue({ ok: true });
  __resetNotionClientForTests();
  process.env.NOTION_API_KEY = "test-notion-key";
  process.env.NOTION_PARENT_PAGE_ID = "parent_page_root_id";
});

afterEach(() => {
  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_PARENT_PAGE_ID;
});

// ────────────────────────────────────────────────────────────────────────────
// notion-client helpers
// ────────────────────────────────────────────────────────────────────────────

describe("notion-client · block builders", () => {
  it("paragraph wraps text in a paragraph block (truncated at 2000)", () => {
    const long = "x".repeat(3000);
    const b = paragraph(long) as {
      type: string;
      paragraph: { rich_text: Array<{ text: { content: string } }> };
    };
    expect(b.type).toBe("paragraph");
    expect(b.paragraph.rich_text[0].text.content.length).toBe(2000);
  });

  it("heading2 produces a heading_2 block", () => {
    const b = heading2("hello") as { type: string };
    expect(b.type).toBe("heading_2");
  });

  it("heading3 produces a heading_3 block", () => {
    const b = heading3("h3") as { type: string };
    expect(b.type).toBe("heading_3");
  });

  it("bullet produces a bulleted_list_item block", () => {
    const b = bullet("item") as { type: string };
    expect(b.type).toBe("bulleted_list_item");
  });

  it("divider is a static divider block", () => {
    const b = divider() as { type: string };
    expect(b.type).toBe("divider");
  });

  it("bulletList returns [paragraph('(none)')] when input is empty/nullish", () => {
    const out = bulletList(undefined);
    expect((out[0] as { type: string }).type).toBe("paragraph");
  });

  it("bulletList maps each input string to a bullet block", () => {
    const out = bulletList(["a", "b"]);
    expect(out.length).toBe(2);
    expect((out[0] as { type: string }).type).toBe("bulleted_list_item");
  });
});

describe("notion-client · resolveParentPageId", () => {
  it("returns body override if provided", () => {
    expect(resolveParentPageId("body_override_id")).toBe("body_override_id");
  });

  it("falls back to NOTION_PARENT_PAGE_ID env when no override", () => {
    expect(resolveParentPageId()).toBe("parent_page_root_id");
  });

  it("throws NotionConfigError when neither override nor env is set", () => {
    delete process.env.NOTION_PARENT_PAGE_ID;
    expect(() => resolveParentPageId()).toThrowError(NotionConfigError);
  });
});

describe("notion-client · createSubpage", () => {
  it("calls notion.pages.create with parent + title + children and returns mapped shape", async () => {
    const result = await createSubpage({
      parentPageId: "parent_1",
      title: "My title",
      blocks: [paragraph("hello")],
    });

    expect(mockPagesCreate).toHaveBeenCalledOnce();
    expect(result).toEqual({
      page_id: "page_abc123",
      page_url: "https://www.notion.so/Test-Page-abc123",
      created_time: "2026-05-15T09:00:00.000Z",
    });
  });

  it("throws NotionConfigError when NOTION_API_KEY is missing", async () => {
    delete process.env.NOTION_API_KEY;
    await expect(
      createSubpage({ parentPageId: "p", title: "t", blocks: [] }),
    ).rejects.toThrowError(NotionConfigError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Handler · happy paths
// ────────────────────────────────────────────────────────────────────────────

describe("POST /api/notion/create-client-workspace", () => {
  it("returns 200 with workspace_id + workspace_url on happy path", async () => {
    const res = await workspaceHandler(
      buildReq({ client_id: "c1", client_name: "Acme", brand_voice_summary: "Authoritative" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.workspace_id).toBe("page_abc123");
    expect(body.workspace_url).toBe("https://www.notion.so/Test-Page-abc123");
    expect(mockPagesCreate).toHaveBeenCalledOnce();
  });

  it("returns 401 when auth fails", async () => {
    checkInternalKeyMock.mockReturnValue({ ok: false, reason: "Invalid key" });
    const res = await workspaceHandler(buildReq({ client_id: "c1" }));
    expect(res.status).toBe(401);
    expect(mockPagesCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when NOTION_API_KEY is missing", async () => {
    delete process.env.NOTION_API_KEY;
    const res = await workspaceHandler(buildReq({ client_id: "c1" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Notion configuration");
  });

  it("returns 502 when Notion API rejects", async () => {
    mockPagesCreate.mockRejectedValueOnce(new Error("rate_limited"));
    const res = await workspaceHandler(buildReq({ client_id: "c1" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toContain("rate_limited");
  });
});

describe("POST /api/notion/create-qbr-page", () => {
  it("returns 200 with page_id + page_url on happy path", async () => {
    const res = await qbrHandler(
      buildReq({
        client_id: "c1",
        quarter: "Q2 2026",
        summary: "Big quarter",
        wins: ["closed deal"],
        risks: ["churn risk"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page_id).toBe("page_abc123");
    expect(body.quarter).toBe("Q2 2026");
  });

  it("returns 502 when Notion API rejects", async () => {
    mockPagesCreate.mockRejectedValueOnce(new Error("validation_error"));
    const res = await qbrHandler(buildReq({ client_id: "c1", quarter: "Q1 2026" }));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/notion/create-success-plan", () => {
  it("returns 200 with plan_id + plan_url on happy path", async () => {
    const res = await planHandler(
      buildReq({
        client_id: "c1",
        client_name: "Acme",
        plan_period: "Q2 2026",
        north_star: "Reduce incidents 30%",
        milestones: [{ name: "Audit", eta: "May 30", owner: "Emilio" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan_id).toBe("page_abc123");
  });

  it("returns 500 when NOTION_PARENT_PAGE_ID is missing AND no body override", async () => {
    delete process.env.NOTION_PARENT_PAGE_ID;
    const res = await planHandler(buildReq({ client_id: "c1" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/notion/create-weekly-report", () => {
  it("returns 200 with page_id + page_url on happy path", async () => {
    const res = await weeklyHandler(
      buildReq({
        client_id: "c1",
        week_starting: "2026-05-12",
        title: "Acme · week of May 12",
        highlights: ["Launched campaign A"],
        metrics: { leads: 12, cost_per_lead: "$8.50" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page_id).toBe("page_abc123");
    expect(body.week_starting).toBe("2026-05-12");
  });

  it("uses body parent_page_id when supplied (overrides env default)", async () => {
    await weeklyHandler(
      buildReq({
        client_id: "c1",
        week_starting: "2026-05-12",
        title: "Test",
        parent_page_id: "explicit_client_workspace_id",
      }),
    );
    const callArgs = mockPagesCreate.mock.calls[0][0] as {
      parent: { page_id: string };
    };
    expect(callArgs.parent.page_id).toBe("explicit_client_workspace_id");
  });
});
