/**
 * POST /api/notion/create-qbr-page
 *
 * Creates a Quarterly Business Review page in Notion. Workflow caller:
 *   `Zero Risk - QBR Generator Quarterly`
 *
 * Body shape is validated by the Ajv schema `notion-create-qbr-page`. The
 * page lands under either the body's `parent_page_id` (typically the
 * client's workspace page from POST /api/notion/create-client-workspace)
 * or the env-level `NOTION_PARENT_PAGE_ID` fallback.
 *
 * Closes W15-D-22.
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
import { validateInput } from "@/lib/input-validator";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createSubpage,
  resolveParentPageId,
  paragraph,
  heading2,
  bullet,
  divider,
  bulletList,
  NotionConfigError,
} from "@/lib/notion-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface QbrPageBody {
  client_id: string;
  quarter: string;
  title?: string | null;
  summary?: string | null;
  kpis?: Array<Record<string, unknown>> | null;
  wins?: string[] | null;
  risks?: string[] | null;
  next_quarter_goals?: string[] | null;
  parent_page_id?: string | null;
}

function buildQbrBlocks(body: QbrPageBody): unknown[] {
  const blocks: unknown[] = [
    heading2(`QBR · ${body.quarter}`),
    paragraph(body.summary ?? "(executive summary pending)"),
    divider(),
    heading2("KPIs"),
  ];
  if (!body.kpis?.length) {
    blocks.push(paragraph("(no KPIs reported)"));
  } else {
    for (const kpi of body.kpis) {
      const name = (kpi.name ?? kpi.label ?? "metric") as string;
      const value = String(kpi.value ?? kpi.actual ?? "—");
      const target = kpi.target != null ? ` / target ${kpi.target}` : "";
      blocks.push(bullet(`${name} · ${value}${target}`));
    }
  }
  blocks.push(divider(), heading2("Wins"));
  blocks.push(...bulletList(body.wins));
  blocks.push(divider(), heading2("Risks"));
  blocks.push(...bulletList(body.risks));
  blocks.push(divider(), heading2(`Goals · ${nextQuarterLabel(body.quarter)}`));
  blocks.push(...bulletList(body.next_quarter_goals));
  return blocks;
}

function nextQuarterLabel(current: string): string {
  const match = current.match(/^Q([1-4])\s+(\d{4})$/i);
  if (!match) return "Next quarter";
  const q = Number(match[1]);
  const y = Number(match[2]);
  if (q === 4) return `Q1 ${y + 1}`;
  return `Q${q + 1} ${y}`;
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", code: "E-AUTH-001", detail: auth.reason },
      { status: 401 },
    );
  }

  const v = await validateInput<QbrPageBody>(request, "notion-create-qbr-page");
  if (!v.ok) return v.response;
  const body = v.data;

  try {
    const parentPageId = resolveParentPageId(body.parent_page_id);
    const page = await createSubpage({
      parentPageId,
      title: body.title ?? `QBR · ${body.client_id} · ${body.quarter}`,
      blocks: buildQbrBlocks(body),
    });

    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("notion_qbr_log").insert({
        client_id: body.client_id,
        quarter: body.quarter,
        page_id: page.page_id,
        page_url: page.page_url,
        used_stub: false,
        request_body: body,
      });
    } catch {
      /* never block */
    }

    return NextResponse.json({
      ok: true,
      page_id: page.page_id,
      page_url: page.page_url,
      created_time: page.created_time,
      client_id: body.client_id,
      quarter: body.quarter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof NotionConfigError) {
      return NextResponse.json(
        { ok: false, error: "Notion configuration error", detail: msg },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Notion API call failed", detail: msg.slice(0, 600) },
      { status: 502 },
    );
  }
}
