#!/usr/bin/env node
/**
 * Sprint 8D Brain RAG · smoke 2 nuevos endpoints post-deploy.
 *
 * 1. POST /api/brain/ingest-source · synthetic 3 sections · verify chunks_upserted=3
 * 2. POST /api/brain/reindex-stale · dry_run=true · verify summary canonical
 * 3. Cleanup synthetic chunks
 */
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../outputs/brain-rag-5-gaps");
mkdirSync(OUT, { recursive: true });

const ZR = process.env.ZERO_RISK_API_URL ?? "https://zero-risk-platform.vercel.app";
const INT = process.env.INTERNAL_API_KEY;
const SUPA = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const TEST_CLIENT_ID = randomUUID();
const TEST_SOURCE_ID = randomUUID();
const TEST_NAME = `BR-INGEST-SMOKE-${ts.slice(0, 16)}`;

// Pre-cleanup helper
const sbDel = async (table, qs) => {
  const r = await fetch(`${SUPA}/rest/v1/${table}?${qs}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.ok;
};
const sbInsert = async (table, row) => {
  const r = await fetch(`${SUPA}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return { ok: r.ok, body: await r.text() };
};

// Create synthetic client to satisfy FK
console.log("[smoke] create synthetic client", TEST_CLIENT_ID);
const cli = await sbInsert("clients", { id: TEST_CLIENT_ID, name: TEST_NAME, slug: `br-ingest-smoke-${ts.slice(0, 13).toLowerCase().replace(/[:t-]/g, "")}`, status: "active" });
if (!cli.ok) { console.error(cli.body.slice(0, 300)); process.exit(2); }

const cleanup = async () => {
  console.log("\n[smoke] CLEANUP");
  await sbDel("client_brain_chunks", `client_id=eq.${TEST_CLIENT_ID}`);
  await sbDel("clients", `id=eq.${TEST_CLIENT_ID}`);
};

const results = { test_client_id: TEST_CLIENT_ID };
try {
  // Smoke 1 · ingest-source
  console.log("[smoke] POST /api/brain/ingest-source");
  const r1 = await fetch(`${ZR}/api/brain/ingest-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": INT },
    body: JSON.stringify({
      client_id: TEST_CLIENT_ID,
      source_table: "client_brand_books",
      source_id: TEST_SOURCE_ID,
      sections: [
        { section_label: "brand_purpose", text: "Sprint 8D smoke · synthetic test for brain ingest endpoint." },
        { section_label: "tone_guidelines", text: "Professional but warm · short sentences · avoid jargon." },
        { section_label: "value_proposition", text: "Marketing automation que ahorra 20 horas semanales a SMBs." },
      ],
    }),
  });
  const j1 = await r1.json();
  results.ingest = { status: r1.status, body: j1 };
  console.log(`  status: ${r1.status} · ok: ${j1.ok} · chunks_upserted: ${j1.chunks_upserted} · cost: $${j1.cost_usd}`);

  // Smoke 2 · reindex-stale dry_run
  console.log("\n[smoke] POST /api/brain/reindex-stale dry_run=true");
  const r2 = await fetch(`${ZR}/api/brain/reindex-stale`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": INT },
    body: JSON.stringify({ dry_run: true, max_per_table: 5 }),
  });
  const j2 = await r2.json();
  results.reindex_stale = { status: r2.status, body: j2 };
  console.log(`  status: ${r2.status} · ok: ${j2.ok} · detected: ${j2.total_detected} · errors: ${j2.total_errors}`);
  if (j2.summary) {
    console.log("  summary per table:");
    Object.entries(j2.summary).forEach(([t, s]) => console.log(`    ${t} · detected=${s.detected} reindexed=${s.reindexed} errors=${s.errors?.length||0}`));
  }

  // Verify chunks inserted con embedding_version
  const v = await fetch(`${SUPA}/rest/v1/client_brain_chunks?select=id,section_label,embedding_version&client_id=eq.${TEST_CLIENT_ID}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const vchunks = await v.json();
  results.chunks_verified = vchunks;
  console.log(`\n[smoke] chunks for test client: ${(vchunks || []).length}`);
  (vchunks || []).forEach(c => console.log(`  · ${c.section_label} · ${c.embedding_version}`));

  console.log("\n[smoke] AGGREGATE");
  console.log(`  Ingest endpoint ok? ${j1.ok}`);
  console.log(`  Chunks expected/actual · 3 / ${vchunks?.length || 0}`);
  console.log(`  embedding_version present? ${vchunks?.[0]?.embedding_version ? "yes · " + vchunks[0].embedding_version : "NO · migration may be unapplied"}`);
  console.log(`  Reindex-stale ok? ${j2.ok}`);
} finally {
  writeFileSync(resolve(OUT, `smoke-${ts}.json`), JSON.stringify(results, null, 2));
  await cleanup();
}
