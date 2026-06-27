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
import { runIngressFilter, DEFAULT_ROUTE_POLICY, type ProvenanceTag } from "@/lib/ingress-filter";
import { buildBrainProvenanceTag } from "@/lib/client-brain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// FASE C · portero de datos (§144 · shadow primero) ·
// el ingest es la ÚNICA puerta de escritura de evidencia al cerebro · aplica el
// filtro anti-injection (ADR-012 · 5 capas) en modo shadow (audita · NO rechaza)
// + estampa provenance_tag (evidencia · trust por fuente · default untrusted).

// Valores válidos del enum ingress (ProvenanceTag.source). El `source` del body
// es la etiqueta del Brain (taxonomía discovery · libre) · acá lo mapeamos al
// enum estrecho del filtro para la Capa 1 de provenance del filtro.
const INGRESS_SOURCE_ENUM = new Set<ProvenanceTag["source"]>([
  "tally_form", "apify_scrape", "whatsapp_inbound", "review_monitor",
  "dataforseo_scrape", "email_inbound", "onboarding_upload", "notion_comment",
  "webhook_generic", "callback_external", "legacy_pre_adr012", "unknown",
]);

function toIngressSource(source: string): ProvenanceTag["source"] {
  return INGRESS_SOURCE_ENUM.has(source as ProvenanceTag["source"])
    ? (source as ProvenanceTag["source"])
    : "webhook_generic";
}

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
  /** FASE C · etiqueta de fuente para provenance del Brain (taxonomía discovery ·
   *  ej. 'apify_scrape' | 'onboarding_discovery' | 'search'). Default seguro. */
  source?: string;
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
  // FASE C · etiqueta de fuente (Brain provenance) · default discovery.
  const brainSource = typeof body.source === "string" && body.source.trim().length > 0
    ? body.source.trim()
    : "onboarding_discovery";

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

  // FASE C · portero anti-injection (ADR-012 · 5 capas) en modo SHADOW ·
  // audita por sección · NUNCA rechaza (DEFAULT_ROUTE_POLICY.shadow_mode=true ·
  // allow siempre true · shadow_blocks registra qué bloquearía en enforce).
  // Capa 3 (classifier) skip · sin costo LLM · el flip a enforce es §144 aparte.
  const ingressSource = toIngressSource(brainSource);
  const filterDecisions = await Promise.all(
    valid.map((s) =>
      runIngressFilter(
        {
          raw_text: s.text,
          source: ingressSource,
          ingress_route: "/api/brain/ingest-source",
          client_id: clientId,
        },
        { route: DEFAULT_ROUTE_POLICY, skip_classifier: true },
      ),
    ),
  );
  const shadowFlagged = filterDecisions
    .map((d, i) => ({ section_label: valid[i].section_label, shadow_blocks: d.shadow_blocks, severity: d.severity }))
    .filter((d) => d.shadow_blocks.length > 0);
  if (shadowFlagged.length > 0) {
    console.warn(
      `[ingest-source][ingress-filter][shadow] ${shadowFlagged.length}/${valid.length} secciones bloquearían en enforce · client=${clientId} · ` +
        shadowFlagged.map((d) => `${d.section_label}:${d.shadow_blocks.join("+")}(${d.severity})`).join(" · "),
    );
  }
  const ingressFilterAudit = {
    shadow_mode: true as const,
    sections_evaluated: valid.length,
    sections_shadow_flagged: shadowFlagged.length,
    flagged: shadowFlagged,
  };

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
  // FASE C · provenance_tag por fila · evidencia · trust por fuente (default
  // untrusted · mapa fuente→untrusted) · el write-back canon (type=canon) es C2.
  const provenanceTag = buildBrainProvenanceTag({
    source: brainSource,
    type: "evidence",
    trust_level: "untrusted",
    received_at: nowIso,
    ingress_route: "/api/brain/ingest-source",
  });
  const rows = valid.map((s, i) => ({
    client_id: clientId,
    source_table: sourceTable,
    source_id: sourceId,
    section_label: s.section_label,
    chunk_text: s.text.slice(0, 8000),
    embedding: embed.embeddings[i],
    provenance_tag: provenanceTag,
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
      provenance_tag: provenanceTag,
      ingress_filter: ingressFilterAudit,
    },
    { status: 200 },
  );
}
