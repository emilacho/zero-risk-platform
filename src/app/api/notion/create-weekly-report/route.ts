/**
 * POST /api/notion/create-weekly-report
 *
 * Weekly client report page. Workflow caller:
 *   `Zero Risk - Weekly Client Report Generator v2 (Mondays 8am)`
 *
 * Sections: highlights · metrics (key/value as bullets · Notion has no
 * native key-value widget that maps cleanly to arbitrary JSON) · next-week
 * focus · blockers.
 *
 * Closes W15-D-23.
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

interface WeeklyReportBody {
  client_id: string;
  week_starting: string;
  title: string;
  highlights?: string[] | null;
  metrics?: Record<string, unknown> | null;
  next_week_focus?: string[] | null;
  blockers?: string[] | null;
  parent_page_id?: string | null;
}

function buildWeeklyBlocks(body: WeeklyReportBody): unknown[] {
  const blocks: unknown[] = [
    heading2(body.title),
    paragraph(`Week starting · ${body.week_starting}`),
    divider(),
    heading2("Highlights"),
    ...bulletList(body.highlights),
    divider(),
    heading2("Metrics"),
  ];
  if (!body.metrics || Object.keys(body.metrics).length === 0) {
    blocks.push(paragraph("(no metrics reported)"));
  } else {
    for (const [k, v] of Object.entries(body.metrics)) {
      blocks.push(bullet(`${k} · ${String(v)}`));
    }
  }
  blocks.push(divider(), heading2("Next week focus"));
  blocks.push(...bulletList(body.next_week_focus));
  blocks.push(divider(), heading2("Blockers"));
  blocks.push(...bulletList(body.blockers));
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

  const v = await validateInput<WeeklyReportBody>(request, "notion-create-weekly-report");
  if (!v.ok) return v.response;
  const body = v.data;

  try {
    const parentPageId = resolveParentPageId(body.parent_page_id);
    const page = await createSubpage({
      parentPageId,
      title: body.title,
      blocks: buildWeeklyBlocks(body),
    });

    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("notion_page_log").insert({
        page_id: page.page_id,
        page_type: "weekly_report",
        client_id: body.client_id,
        week_starting: body.week_starting,
        title: body.title,
        payload: body,
        parent_page_id: parentPageId,
        fallback_mode: false,
        created_at: new Date().toISOString(),
      });
    } catch {
      /* never block */
    }

    return NextResponse.json({
      ok: true,
      page_id: page.page_id,
      page_url: page.page_url,
      created_time: page.created_time,
      week_starting: body.week_starting,
      client_id: body.client_id,
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
