/**
 * POST /api/notion/create-agent-output-subpage · Sprint 8D Journey B Notion sub-pages
 * + Sprint 9 cleanup A2 · paralelo brain RAG ingest canonical (best-effort)
 *
 * Creates a Notion sub-page nested under a client workspace page · stores the
 * output produced by an agent invocation (Brand Book · ICP · competitive landscape ·
 * kickoff deck · first sprint plan · etc) en formato canonical legible para Emilio.
 *
 * Sprint 9 enhancement canonical · post-Notion-success ADEMÁS persiste el output
 * canonical al Client Brain RAG (Capa 0 transversal) via /api/brain/ingest-source ·
 * arquitectura best-effort (canon §150 G3 idempotency) · si brain RAG falla · sub-page
 * canonical persiste + log error · NO rollback Notion · canon §148 OPERATIVO Y COMPROBADO
 * 100% (sub-page primary deliverable · brain RAG enrichment paralelo).
 *
 * Body · {
 *   workspace_id      string · parent Notion page (canonical workspace per cliente)
 *   agent_slug        string · empleado que produjo el output (canonical reference)
 *   title             string · titulo de la sub-página (canonical)
 *   content_markdown  string · markdown del output (canonical · convert to blocks)
 *   client_id         string · canonical FK (REQUIRED canonical brain RAG ingest)
 *   section_label     string · canonical label opcional para metadata + brain RAG mapping
 * }
 *
 * Returns · {
 *   ok, subpage_id, subpage_url, agent_slug, blocks_count,
 *   brain_rag_paralelo: { attempted, success, source_table?, chunks_upserted?, error? }
 * }
 *
 * Auth · x-api-key canonical INTERNAL_API_KEY.
 *
 * Failure modes (canonical) ·
 *   - 401 unauth
 *   - 400 validation_error
 *   - 502 Notion API rejection (continueOnFail-safe en n8n caller canonical)
 *   - brain_rag_paralelo.success=false (best-effort · NO rollback · sub-page persiste)
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

/**
 * Mapeo canonical section_label → source_table para brain RAG ingest.
 *
 * Spec original (raw/refs/2026-05-25-cc1-brain-rag-subpages-persistence-canonical-all-clients-spec.md
 * líneas 180-188) referenciaba tables que NO existen en `ALLOWED_SOURCE_TABLES` canon
 * (client_brand_book singular · client_icp · client_marketing_collateral · client_sprint_plans ·
 * client_onboarding_notes · client_design_assets · client_misc_outputs · ninguno existe canonical).
 *
 * Reconciliación canonical (canon §148 OPERATIVO Y COMPROBADO 100%) usa
 * `ALLOWED_SOURCE_TABLES` canon como ground truth · 5 tables vigentes ·
 * client_brand_books · client_icp_documents · client_voc_library · client_competitive_landscape ·
 * client_historical_outputs (ver src/app/api/brain/ingest-source/route.ts).
 *
 * Labels sin dedicated table → fallback canonical `client_historical_outputs` (genérico
 * canon · ya usado por intake_form_v0 cumulative pipeline). Sprint 9 candidate · agregar
 * dedicated tables canonical si business case lo justifica (canon canonical evolutivo).
 */
export function mapSectionLabelToBrainTable(label: string | null | undefined): string {
  const normalized = (label ?? "").trim().toLowerCase();
  switch (normalized) {
    case "brand_book_v1":
    case "brand_book_v0":
    case "brand_book":
      return "client_brand_books";
    case "icp_v1":
    case "icp_v0":
    case "icp":
    case "icp_document":
      return "client_icp_documents";
    case "competitive_v2":
    case "competitive_v1":
    case "competitive_v0":
    case "competitive":
    case "competitive_landscape":
      return "client_competitive_landscape";
    // Labels sin dedicated table canonical · fallback generic canonical
    case "kickoff_deck":
    case "first_sprint_plan":
    case "onboarding":
    case "intake_form_v0":
    case "layout":
    default:
      return "client_historical_outputs";
  }
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

    // Sprint 9 cleanup A2 · paralelo brain RAG ingest canonical (best-effort)
    // Notion sub-page primary deliverable canonical (already persisted al success path).
    // Brain RAG ingest paralelo · enrichment Capa 0 transversal · si falla · log + continue ·
    // NO rollback Notion (canon §150 G3 idempotency · §148 OPERATIVO Y COMPROBADO 100%).
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    const brainRagParalelo = await ingestBrainRagParalelo({
      clientId,
      subpageId: page.page_id,
      subpageUrl: page.page_url,
      workspaceId,
      agentSlug,
      sectionLabel: typeof body.section_label === "string" ? body.section_label : null,
      contentMarkdown,
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
        brain_rag_paralelo: brainRagParalelo,
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

/**
 * Paralelo brain RAG ingest canonical · best-effort · NEVER throws.
 *
 * Llama `/api/brain/ingest-source` internamente con canonical body
 * (source_id = subpage_id · idempotency key canon Sprint 9 G3). Si client_id missing
 * OR ingest fails OR timeout · retorna estado degradado en `brain_rag_paralelo` field ·
 * canonical observability sin bloquear sub-page success path.
 *
 * Exported para testing canonical.
 */
export interface BrainRagParaleloInput {
  clientId: string;
  subpageId: string;
  subpageUrl: string;
  workspaceId: string;
  agentSlug: string;
  sectionLabel: string | null;
  contentMarkdown: string;
}

export interface BrainRagParaleloResult {
  attempted: boolean;
  success: boolean;
  source_table?: string;
  chunks_upserted?: number;
  cost_usd?: number;
  skip_reason?: string;
  error?: string;
}

export async function ingestBrainRagParalelo(input: BrainRagParaleloInput): Promise<BrainRagParaleloResult> {
  // Guard canonical · client_id required for brain RAG ingest
  if (!input.clientId) {
    return { attempted: false, success: false, skip_reason: "client_id_missing" };
  }
  // Guard canonical · content too short to embed canonical (endpoint requires text > 10 chars)
  if (input.contentMarkdown.trim().length <= 10) {
    return { attempted: false, success: false, skip_reason: "content_too_short_for_embed" };
  }

  const sourceTable = mapSectionLabelToBrainTable(input.sectionLabel);
  const sectionLabel = input.sectionLabel || `notion_subpage_${input.agentSlug || "unknown"}`;
  const baseUrl = process.env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app";
  const apiKey = process.env.INTERNAL_API_KEY || "";

  try {
    const res = await fetch(`${baseUrl}/api/brain/ingest-source`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        client_id: input.clientId,
        source_table: sourceTable,
        source_id: input.subpageId,
        sections: [{ section_label: sectionLabel, text: input.contentMarkdown }],
        metadata: {
          notion_subpage_id: input.subpageId,
          notion_subpage_url: input.subpageUrl,
          notion_workspace_id: input.workspaceId,
          agent_slug: input.agentSlug,
          canonical_pattern: "notion-subpage-brain-rag-paralelo",
          sprint: "sprint-9-cleanup-a2",
          ingested_at: new Date().toISOString(),
        },
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as { chunks_upserted?: number; cost_usd?: number };
      return {
        attempted: true,
        success: true,
        source_table: sourceTable,
        chunks_upserted: json.chunks_upserted,
        cost_usd: json.cost_usd,
      };
    }
    const errText = await res.text().catch(() => "(no body)");
    console.error(
      `[brain-rag-paralelo] best-effort failed · status ${res.status} · sub-page ${input.subpageId} created Notion · brain RAG pending · ${errText.slice(0, 300)}`,
    );
    return {
      attempted: true,
      success: false,
      source_table: sourceTable,
      error: `http_${res.status}: ${errText.slice(0, 200)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[brain-rag-paralelo] best-effort threw · sub-page ${input.subpageId} created Notion · brain RAG pending · ${msg.slice(0, 300)}`,
    );
    return {
      attempted: true,
      success: false,
      source_table: sourceTable,
      error: `exception: ${msg.slice(0, 200)}`,
    };
  }
}
