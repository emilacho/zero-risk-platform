/**
 * POST /api/notion/create-success-plan
 *
 * Client success plan page. Sections: north-star objective · milestones (with
 * ETAs) · risks · accountability owners. Nests under the client workspace
 * page if `parent_page_id` is supplied, else under NOTION_PARENT_PAGE_ID.
 *
 * Body (no Ajv contract today · the workflow caller is stable but the body
 * is loose-shape):
 *   {
 *     client_id: string,
 *     client_name?: string,
 *     plan_period?: string,            // e.g. "Q2 2026 · 90-day plan"
 *     north_star?: string,
 *     milestones?: Array<{ name: string; eta?: string; owner?: string; status?: string }>,
 *     risks?: string[],
 *     owners?: string[],
 *     parent_page_id?: string
 *   }
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
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

interface SuccessPlanBody {
  client_id?: string;
  client_name?: string;
  plan_period?: string;
  north_star?: string;
  milestones?: Array<{ name?: string; eta?: string; owner?: string; status?: string }>;
  risks?: string[];
  owners?: string[];
  parent_page_id?: string | null;
}

function buildPlanBlocks(body: SuccessPlanBody): unknown[] {
  const blocks: unknown[] = [
    heading2(`Success plan · ${body.plan_period ?? "current period"}`),
    paragraph(body.north_star ?? "(north-star objective pending)"),
    divider(),
    heading2("Milestones"),
  ];
  if (!body.milestones?.length) {
    blocks.push(paragraph("(no milestones declared yet)"));
  } else {
    for (const m of body.milestones) {
      const owner = m.owner ? ` · owner ${m.owner}` : "";
      const eta = m.eta ? ` · ETA ${m.eta}` : "";
      const status = m.status ? ` · ${m.status}` : "";
      blocks.push(bullet(`${m.name ?? "unnamed milestone"}${owner}${eta}${status}`));
    }
  }
  blocks.push(divider(), heading2("Risks"));
  blocks.push(...bulletList(body.risks));
  blocks.push(divider(), heading2("Accountability"));
  blocks.push(...bulletList(body.owners));
  return blocks;
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", code: "E-AUTH-001", detail: auth.reason },
      { status: 401 },
    );
  }

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }
  const body: SuccessPlanBody =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as SuccessPlanBody)
      : {};

  const client_id = body.client_id ?? "unknown";
  const client_name = body.client_name ?? "Unknown Client";

  try {
    const parentPageId = resolveParentPageId(body.parent_page_id);
    const page = await createSubpage({
      parentPageId,
      title: `Success plan · ${client_name} · ${body.plan_period ?? "current"}`,
      blocks: buildPlanBlocks(body),
    });

    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("notion_success_plan_log").insert({
        client_id,
        client_name,
        plan_id: page.page_id,
        plan_url: page.page_url,
        request_body: body,
      });
    } catch {
      /* never block */
    }

    return NextResponse.json({
      ok: true,
      client_id,
      plan_id: page.page_id,
      plan_url: page.page_url,
      created_time: page.created_time,
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
