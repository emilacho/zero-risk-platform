/**
 * POST /api/notion/create-client-workspace
 *
 * Creates a fresh Notion page that serves as the client workspace — one page
 * per client, with section sub-blocks for brand snapshot · contacts · quick
 * links · onboarding notes. Downstream handlers (QBR, weekly report, success
 * plan) can be nested under this page by passing its `workspace_id` back as
 * `parent_page_id` on subsequent calls.
 *
 * Auth: `x-api-key` against INTERNAL_API_KEY.
 *
 * Failure modes (NO silent stub anymore · per Cowork directive · we want to
 * surface infra breakage):
 *   - 401 if auth fails
 *   - 500 if NOTION_API_KEY or NOTION_PARENT_PAGE_ID missing
 *   - 502 if Notion API rejects (rate limit, share missing, validation, etc.)
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
  NotionConfigError,
} from "@/lib/notion-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ClientWorkspaceBody {
  client_id?: string;
  client_name?: string;
  industry?: string;
  primary_contact?: string;
  brand_voice_summary?: string;
  forbidden_words?: string[];
  quick_links?: Array<{ label: string; url: string }>;
  onboarding_notes?: string;
  parent_page_id?: string | null;
}

function buildWorkspaceBlocks(body: ClientWorkspaceBody): unknown[] {
  const blocks: unknown[] = [
    heading2("Client overview"),
    paragraph(
      `Industry · ${body.industry ?? "—"}\nPrimary contact · ${
        body.primary_contact ?? "—"
      }\nClient ID · ${body.client_id ?? "—"}`,
    ),
    divider(),
    heading2("Brand snapshot"),
    paragraph(body.brand_voice_summary ?? "(brand voice summary pending · fill in during onboarding)"),
    heading2("Forbidden words"),
    ...(body.forbidden_words?.length
      ? body.forbidden_words.map((w) => bullet(w))
      : [paragraph("(none yet)")]),
    divider(),
    heading2("Quick links"),
    ...(body.quick_links?.length
      ? body.quick_links.map((link) => bullet(`${link.label} — ${link.url}`))
      : [paragraph("(none yet)")]),
    divider(),
    heading2("Onboarding notes"),
    paragraph(body.onboarding_notes ?? "(notes pending)"),
  ];
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
  const body: ClientWorkspaceBody =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as ClientWorkspaceBody)
      : {};

  const client_id = body.client_id ?? "unknown";
  const client_name = body.client_name ?? "Unknown Client";

  try {
    const parentPageId = resolveParentPageId(body.parent_page_id);
    const page = await createSubpage({
      parentPageId,
      title: `Workspace · ${client_name}`,
      blocks: buildWorkspaceBlocks(body),
    });

    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("notion_workspace_log").insert({
        client_id,
        client_name,
        page_id: page.page_id,
        page_url: page.page_url,
        request_body: body,
      });
    } catch {
      /* never block on log */
    }

    return NextResponse.json({
      ok: true,
      client_id,
      client_name,
      workspace_id: page.page_id,
      workspace_url: page.page_url,
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
