/**
 * POST /api/notion/create-agent-output-subpage · Sprint 8D Journey B Notion sub-pages
 *
 * Creates a Notion sub-page nested under a client workspace page · stores the
 * output produced by an agent invocation (Brand Book · ICP · competitive landscape ·
 * kickoff deck · first sprint plan · etc) en formato canonical legible para Emilio.
 *
 * Body · {
 *   workspace_id      string · parent Notion page (canonical workspace per cliente)
 *   agent_slug        string · empleado que produjo el output (canonical reference)
 *   title             string · titulo de la sub-página (canonical)
 *   content_markdown  string · markdown del output (canonical · convert to blocks)
 *   client_id         string · canonical FK
 *   section_label     string · canonical label opcional para metadata
 * }
 *
 * Returns · { ok, subpage_id, subpage_url, agent_slug, blocks_count }
 *
 * Auth · x-api-key canonical INTERNAL_API_KEY.
 *
 * Failure modes (canonical) ·
 *   - 401 unauth
 *   - 400 validation_error
 *   - 502 Notion API rejection (continueOnFail-safe en n8n caller canonical)
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
import {
  createSubpage,
  paragraph,
  heading2,
  heading3,
  bullet,
  divider,
  NotionConfigError,
} from "@/lib/notion-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  workspace_id?: string;
  agent_slug?: string;
  title?: string;
  content_markdown?: string;
  client_id?: string;
  section_label?: string | null;
}

type NotionBlock = ReturnType<typeof paragraph>;

/**
 * Canonical markdown → Notion blocks conversion. Conservative · solo handles
 * common patterns · cualquier markdown unrecognized renders as paragraph.
 * Splits by lines · detects · headings (## · ###) · bullets (- · *) · blank → divider.
 */
function markdownToBlocks(md: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  const lines = md.split(/\r?\n/);
  let lastWasBlank = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (!lastWasBlank && blocks.length > 0) {
        blocks.push(divider());
      }
      lastWasBlank = true;
      continue;
    }
    lastWasBlank = false;
    if (line.startsWith("### ")) {
      blocks.push(heading3(line.slice(4).trim()));
    } else if (line.startsWith("## ")) {
      blocks.push(heading2(line.slice(3).trim()));
    } else if (line.startsWith("# ")) {
      blocks.push(heading2(line.slice(2).trim()));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(bullet(line.slice(2).trim()));
    } else {
      // Notion paragraph limit 2000 chars per block · split if needed
      const text = line.length > 2000 ? line.slice(0, 1997) + "..." : line;
      blocks.push(paragraph(text));
    }
  }
  if (blocks.length === 0) {
    blocks.push(paragraph("(empty output)"));
  }
  return blocks;
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "E-AUTH-001", detail: auth.reason },
      { status: 401 },
    );
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", code: "E-INPUT-PARSE" },
      { status: 400 },
    );
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Body;

  const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const agentSlug = typeof body.agent_slug === "string" ? body.agent_slug.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const contentMarkdown = typeof body.content_markdown === "string" ? body.content_markdown : "";

  if (!workspaceId || !agentSlug || !title || !contentMarkdown) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_error",
        code: "E-NOTION-AGENT-SUBPAGE-MISSING",
        detail: "workspace_id + agent_slug + title + content_markdown required",
      },
      { status: 400 },
    );
  }

  const blocks = markdownToBlocks(contentMarkdown);
  // Notion API caps · max 100 blocks per page create request canonical
  const cappedBlocks = blocks.slice(0, 100);

  try {
    const page = await createSubpage({
      parentPageId: workspaceId,
      title: title.slice(0, 200),
      blocks: cappedBlocks,
    });

    return NextResponse.json(
      {
        ok: true,
        subpage_id: page.page_id,
        subpage_url: page.page_url,
        created_time: page.created_time,
        agent_slug: agentSlug,
        section_label: body.section_label ?? null,
        blocks_count: cappedBlocks.length,
        blocks_capped: blocks.length > 100,
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof NotionConfigError) {
      return NextResponse.json(
        { ok: false, error: "notion_configuration_error", detail: msg.slice(0, 400) },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "notion_api_failed", detail: msg.slice(0, 600) },
      { status: 502 },
    );
  }
}
