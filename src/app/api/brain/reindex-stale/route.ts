/**
 * POST /api/brain/reindex-stale · Sprint 8D Brain RAG Gap 1 fix.
 *
 * Daily cron-callable endpoint que detecta source rows con updates posteriores
 * a sus chunks correspondientes en client_brain_chunks · y re-ingest cada one.
 *
 * Detection query · per source_table · find rows where
 *   source.updated_at > MAX(client_brain_chunks.updated_at WHERE source_id = source.id)
 *   OR client_brain_chunks has no rows for source.id
 *
 * Re-ingest invoca /api/brain/ingest-source canonical inline (server-side fetch).
 *
 * Body · { dry_run?: boolean, max_per_table?: number (default 10) }
 * Returns · per-table summary { detected, reindexed, errors }
 */
import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internal-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCE_TABLES = [
  "client_brand_books",
  "client_icp_documents",
  "client_voc_library",
  "client_competitive_landscape",
] as const;

type SourceTable = (typeof SOURCE_TABLES)[number];

interface SourceRow {
  id: string;
  client_id: string;
  updated_at: string;
  [k: string]: unknown;
}

/**
 * Naive section extractor per source_table · maps row columns to sections array
 * compatible con /api/brain/ingest-source body shape. For sources with
 * structured per-field data (brand_books) one section per field; for
 * unstructured (icp_documents · competitive_landscape) single section with
 * concatenated text.
 */
function extractSections(row: SourceRow, sourceTable: SourceTable): { section_label: string; text: string }[] {
  const sections: { section_label: string; text: string }[] = [];
  if (sourceTable === "client_brand_books") {
    // Brand book has multiple structured fields · one section per
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
    // ICP · concatenated profile + structured if available
    const f = ["profile", "pain_points", "decision_criteria", "budget_range", "goals", "industries", "objections", "jobs_to_be_done"];
    for (const k of f) {
      const v = row[k];
      if (typeof v === "string" && v.trim().length > 10) {
        sections.push({ section_label: k, text: v.trim() });
      } else if (Array.isArray(v) && v.length > 0) {
        sections.push({ section_label: k, text: v.join(", ") });
      }
    }
    // Fallback · whole row as single section if no per-field data
    if (sections.length === 0) {
      const text = JSON.stringify(row).slice(0, 4000);
      sections.push({ section_label: "icp_blob", text });
    }
  } else if (sourceTable === "client_competitive_landscape") {
    // Competitive · one section per competitor:field if structured
    const f = ["positioning", "ad_strategy", "content_strategy", "value_proposition", "weaknesses", "key_differentiators", "target_audience", "tagline", "name"];
    for (const k of f) {
      const v = row[k];
      if (typeof v === "string" && v.trim().length > 10) {
        const compName = (row.competitor_name as string) || (row.name as string) || "competitor";
        sections.push({ section_label: `competitor:${compName}:${k}`, text: v.trim() });
      }
    }
    if (sections.length === 0) {
      const text = JSON.stringify(row).slice(0, 4000);
      sections.push({ section_label: "competitive_blob", text });
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
    raw = {};
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as { dry_run?: boolean; max_per_table?: number };
  const dryRun = body.dry_run === true;
  const maxPerTable = typeof body.max_per_table === "number" && body.max_per_table > 0 ? body.max_per_table : 10;

  const supabase = getSupabaseAdmin();
  const origin = new URL(request.url).origin;
  const internalKey = process.env.INTERNAL_API_KEY || "";

  const summary: Record<string, { detected: number; reindexed: number; errors: string[] }> = {};

  for (const sourceTable of SOURCE_TABLES) {
    const tableSummary = { detected: 0, reindexed: 0, errors: [] as string[] };
    try {
      // Pull source rows updated in last 30 days (limit max_per_table per table to avoid runaway)
      const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sourceRows, error: srcErr } = await supabase
        .from(sourceTable)
        .select("*")
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(maxPerTable * 2);
      if (srcErr) {
        tableSummary.errors.push(`source_query · ${srcErr.message}`);
        summary[sourceTable] = tableSummary;
        continue;
      }
      const rows = (sourceRows ?? []) as SourceRow[];
      if (rows.length === 0) {
        summary[sourceTable] = tableSummary;
        continue;
      }

      // For each row · compare against MAX(client_brain_chunks.updated_at WHERE source_id = row.id)
      const sourceIds = rows.map((r) => r.id);
      const { data: chunkAggRaw } = await supabase
        .from("client_brain_chunks")
        .select("source_id,updated_at")
        .in("source_id", sourceIds);
      const chunkAgg: Record<string, string> = {};
      for (const c of (chunkAggRaw ?? []) as { source_id: string; updated_at: string }[]) {
        if (!chunkAgg[c.source_id] || c.updated_at > chunkAgg[c.source_id]) {
          chunkAgg[c.source_id] = c.updated_at;
        }
      }

      const stale = rows.filter((r) => {
        const lastChunk = chunkAgg[r.id];
        return !lastChunk || r.updated_at > lastChunk;
      });
      tableSummary.detected = stale.length;

      if (dryRun) {
        summary[sourceTable] = tableSummary;
        continue;
      }

      // Re-ingest up to maxPerTable
      const toIngest = stale.slice(0, maxPerTable);
      for (const row of toIngest) {
        const sections = extractSections(row, sourceTable);
        if (sections.length === 0) continue;
        try {
          const r = await fetch(`${origin}/api/brain/ingest-source`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": internalKey },
            body: JSON.stringify({
              client_id: row.client_id,
              source_table: sourceTable,
              source_id: row.id,
              sections,
              metadata: { reindex_source: "reindex-stale-cron", source_updated_at: row.updated_at },
            }),
          });
          if (r.ok) {
            tableSummary.reindexed++;
          } else {
            const txt = await r.text().catch(() => "");
            tableSummary.errors.push(`ingest · row ${row.id.slice(0, 8)} · ${r.status} · ${txt.slice(0, 150)}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          tableSummary.errors.push(`fetch · row ${row.id.slice(0, 8)} · ${msg}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      tableSummary.errors.push(`table_loop · ${msg}`);
    }
    summary[sourceTable] = tableSummary;
  }

  const totalDetected = Object.values(summary).reduce((s, v) => s + v.detected, 0);
  const totalReindexed = Object.values(summary).reduce((s, v) => s + v.reindexed, 0);
  const totalErrors = Object.values(summary).reduce((s, v) => s + v.errors.length, 0);

  return NextResponse.json(
    {
      ok: true,
      dry_run: dryRun,
      max_per_table: maxPerTable,
      total_detected: totalDetected,
      total_reindexed: totalReindexed,
      total_errors: totalErrors,
      summary,
    },
    { status: 200 },
  );
}
