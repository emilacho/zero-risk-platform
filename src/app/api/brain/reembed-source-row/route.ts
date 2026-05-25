/**
 * POST /api/brain/reembed-source-row · Sprint 8D Brain RAG Gap 3 fix.
 *
 * Trigger-callable endpoint que recibe (source_table, source_id, client_id) ·
 * fetches the source row · extracts sections via shared extractor · invoca
 * /api/brain/ingest-source canonical. Permite Supabase triggers AFTER UPDATE
 * on brand_books · icp_documents · competitive_landscape to propagate
 * mutations a brain chunks en tiempo real (vs 24h daily cron).
 *
 * Body · { source_table, source_id, client_id, updated_at? }
 * Returns · { ok, chunks_upserted, cost_usd, source_row_age_seconds }
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_SOURCE_TABLES = new Set([
  "client_brand_books",
  "client_icp_documents",
  "client_voc_library",
  "client_competitive_landscape",
]);

type SourceTable =
  | "client_brand_books"
  | "client_icp_documents"
  | "client_voc_library"
  | "client_competitive_landscape";

interface SourceRow {
  id: string;
  client_id: string;
  updated_at: string;
  [k: string]: unknown;
}

/** Same extraction shape as reindex-stale · keep in sync. */
function extractSections(row: SourceRow, sourceTable: SourceTable): { section_label: string; text: string }[] {
  const sections: { section_label: string; text: string }[] = [];
  if (sourceTable === "client_brand_books") {
    const fields = [
      "brand_purpose", "brand_vision", "brand_mission", "brand_values",
      "brand_personality", "tone_guidelines", "voice_description",
      "writing_style", "tagline", "elevator_pitch", "key_messages",
      "value_propositions", "imagery_style", "forbidden_words",
      "required_terminology",
    ];
    for (const f of fields) {
      const v = row[f];
      if (typeof v === "string" && v.trim().length > 10) {
        sections.push({ section_label: f, text: v.trim() });
      } else if (Array.isArray(v) && v.length > 0) {
        sections.push({ section_label: f, text: v.join(", ") });
      }
    }
  } else if (sourceTable === "client_icp_documents") {
    const f = ["profile", "pain_points", "decision_criteria", "budget_range", "goals", "industries", "objections", "jobs_to_be_done"];
    for (const k of f) {
      const v = row[k];
      if (typeof v === "string" && v.trim().length > 10) {
        sections.push({ section_label: k, text: v.trim() });
      } else if (Array.isArray(v) && v.length > 0) {
        sections.push({ section_label: k, text: v.join(", ") });
      }
    }
    if (sections.length === 0) {
      sections.push({ section_label: "icp_blob", text: JSON.stringify(row).slice(0, 4000) });
    }
  } else if (sourceTable === "client_competitive_landscape") {
    const f = ["positioning", "ad_strategy", "content_strategy", "value_proposition", "weaknesses", "key_differentiators", "target_audience", "tagline", "name"];
    for (const k of f) {
      const v = row[k];
      if (typeof v === "string" && v.trim().length > 10) {
        const compName = (row.competitor_name as string) || (row.name as string) || "competitor";
        sections.push({ section_label: `competitor:${compName}:${k}`, text: v.trim() });
      }
    }
    if (sections.length === 0) {
      sections.push({ section_label: "competitive_blob", text: JSON.stringify(row).slice(0, 4000) });
    }
  } else if (sourceTable === "client_voc_library") {
    const v = (row.quote_text as string) || (row.text as string);
    if (typeof v === "string" && v.trim().length > 10) {
      sections.push({ section_label: "voc_quote", text: v.trim() });
    }
  }
  return sections;
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", code: "E-AUTH-001", detail: auth.reason },
      { status: 401 },
    );
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", code: "E-INPUT-PARSE" }, { status: 400 });
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    source_table?: string;
    source_id?: string;
    client_id?: string;
    updated_at?: string;
  };

  const sourceTable = typeof body.source_table === "string" ? body.source_table.trim() : "";
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";

  if (!sourceTable || !sourceId || !clientId) {
    return NextResponse.json(
      {
        error: "validation_error",
        code: "E-BRAIN-REEMBED-MISSING",
        detail: "source_table + source_id + client_id required",
      },
      { status: 400 },
    );
  }
  if (!ALLOWED_SOURCE_TABLES.has(sourceTable)) {
    return NextResponse.json(
      {
        error: "validation_error",
        code: "E-BRAIN-REEMBED-SOURCE-TABLE",
        detail: `source_table must be one of: ${[...ALLOWED_SOURCE_TABLES].join(", ")}`,
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Fetch the source row
  const { data: row, error: fetchErr } = await supabase
    .from(sourceTable)
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "source_fetch_failed", detail: fetchErr.message.slice(0, 300) },
      { status: 502 },
    );
  }
  if (!row) {
    return NextResponse.json(
      { error: "source_row_not_found", source_table: sourceTable, source_id: sourceId },
      { status: 404 },
    );
  }

  const sections = extractSections(row as SourceRow, sourceTable as SourceTable);
  if (sections.length === 0) {
    return NextResponse.json(
      { ok: true, chunks_upserted: 0, note: "no_valid_sections_extracted" },
      { status: 200 },
    );
  }

  // Invoke ingest-source server-side
  const origin = new URL(request.url).origin;
  const internalKey = process.env.INTERNAL_API_KEY || "";
  const ingestRes = await fetch(`${origin}/api/brain/ingest-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": internalKey },
    body: JSON.stringify({
      client_id: clientId,
      source_table: sourceTable,
      source_id: sourceId,
      sections,
      metadata: {
        reembed_source: "reembed-source-row-trigger",
        source_updated_at: (row as SourceRow).updated_at,
      },
    }),
  });
  const ingestBody = await ingestRes.text();
  let ingestJson: Record<string, unknown> = {};
  try { ingestJson = JSON.parse(ingestBody); } catch { ingestJson = { raw: ingestBody.slice(0, 300) }; }

  const ageSec = body.updated_at
    ? Math.round((Date.now() - new Date(body.updated_at).getTime()) / 1000)
    : null;

  return NextResponse.json(
    {
      ok: ingestRes.ok,
      ingest_status: ingestRes.status,
      sections_extracted: sections.length,
      chunks_upserted: ingestJson.chunks_upserted ?? 0,
      cost_usd: ingestJson.cost_usd ?? 0,
      source_row_age_seconds: ageSec,
      source_table: sourceTable,
      source_id: sourceId,
      client_id: clientId,
    },
    { status: ingestRes.ok ? 200 : 502 },
  );
}
