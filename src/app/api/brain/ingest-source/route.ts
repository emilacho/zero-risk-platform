/**
 * POST /api/brain/ingest-source · Sprint 8D Brain RAG 5-gaps fix · canonical.
 *
 * Single source-of-truth ingest endpoint for Client Brain chunks. Used by ·
 *   - Journey B Step 6 (Gap 4) · post-onboarding ICP + competitive coverage
 *   - Supabase UPDATE triggers (Gap 3) · brand_book mutation propagation
 *   - Daily re-index cron (Gap 1 via /api/brain/reindex-stale) · staleness fix
 *
 * Accepts (client_id, source_table, source_id, sections[]) · for each section ·
 * embeds via OpenAI text-embedding-3-small + UPSERTs row to client_brain_chunks
 * (ON CONFLICT (client_id, source_table, source_id, section_label) DO UPDATE).
 *
 * Graceful · returns 200 con per-section status array · NEVER throws upstream.
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateEmbeddings, EMBEDDING_DIMENSIONS, estimateCost } from "@/lib/brain/embed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_SOURCE_TABLES = new Set([
  "client_brand_books",
  "client_icp_documents",
  "client_voc_library",
  "client_competitive_landscape",
  "client_historical_outputs",
]);

interface IngestSection {
  section_label: string;
  text: string;
}

interface IngestBody {
  client_id?: string;
  source_table?: string;
  source_id?: string;
  sections?: IngestSection[];
  metadata?: Record<string, unknown>;
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
    return NextResponse.json(
      { error: "invalid_json", code: "E-INPUT-PARSE" },
      { status: 400 },
    );
  }

  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as IngestBody;

  // Validate
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const sourceTable = typeof body.source_table === "string" ? body.source_table.trim() : "";
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const sections = Array.isArray(body.sections) ? body.sections : [];

  if (!clientId || !sourceTable || !sourceId) {
    return NextResponse.json(
      {
        error: "validation_error",
        code: "E-BRAIN-INGEST-MISSING",
        detail: "client_id + source_table + source_id required",
      },
      { status: 400 },
    );
  }
  if (!ALLOWED_SOURCE_TABLES.has(sourceTable)) {
    return NextResponse.json(
      {
        error: "validation_error",
        code: "E-BRAIN-INGEST-SOURCE-TABLE",
        detail: `source_table must be one of: ${[...ALLOWED_SOURCE_TABLES].join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (sections.length === 0) {
    return NextResponse.json(
      {
        error: "validation_error",
        code: "E-BRAIN-INGEST-NO-SECTIONS",
        detail: "sections array required · non-empty",
      },
      { status: 400 },
    );
  }

  // Sanitize sections · filter empty texts + cap section_label length
  const valid = sections
    .filter((s) => s && typeof s.section_label === "string" && typeof s.text === "string")
    .map((s) => ({
      section_label: s.section_label.trim().slice(0, 200),
      text: s.text.trim(),
    }))
    .filter((s) => s.section_label.length > 0 && s.text.length > 10);

  if (valid.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        chunks_inserted: 0,
        chunks_updated: 0,
        cost_usd: 0,
        note: "no_valid_sections · all sections had empty label or text <10 chars",
      },
      { status: 200 },
    );
  }

  // Batch embed all section texts (canonical · single OpenAI call)
  const embed = await generateEmbeddings(valid.map((s) => s.text));
  if (!embed.ok) {
    return NextResponse.json(
      {
        ok: false,
        chunks_inserted: 0,
        chunks_updated: 0,
        cost_usd: 0,
        error: "embedding_failed",
        code: embed.code,
        detail: embed.detail,
      },
      { status: 502 },
    );
  }

  // UPSERT rows · ON CONFLICT (client_id, source_table, source_id, section_label) DO UPDATE
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const rows = valid.map((s, i) => ({
    client_id: clientId,
    source_table: sourceTable,
    source_id: sourceId,
    section_label: s.section_label,
    chunk_text: s.text.slice(0, 8000),
    embedding: embed.embeddings[i],
    metadata: {
      ...(body.metadata ?? {}),
      embedding_model: embed.model,
      embedding_dimensions: EMBEDDING_DIMENSIONS,
      ingested_at: nowIso,
      ingest_source: "api/brain/ingest-source",
    },
    updated_at: nowIso,
  }));

  const { data, error } = await supabase
    .from("client_brain_chunks")
    .upsert(rows, {
      onConflict: "client_id,source_table,source_id,section_label",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        chunks_inserted: 0,
        chunks_updated: 0,
        cost_usd: estimateCost(embed.tokens),
        error: "upsert_failed",
        detail: error.message.slice(0, 600),
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      chunks_upserted: (data ?? []).length,
      sections_processed: valid.length,
      cost_usd: estimateCost(embed.tokens),
      tokens_used: embed.tokens,
      embedding_model: embed.model,
    },
    { status: 200 },
  );
}
