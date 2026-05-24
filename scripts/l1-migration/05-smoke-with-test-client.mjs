#!/usr/bin/env node
/**
 * Sprint 8C · L1 migration · Fase 4 step 3 · smoke con test client real.
 *
 * Creates 1 synthetic test client in `clients` table · smokes 4 cases · verifies rows · CLEANUP at end.
 * BACKWARD COMPAT preserved · 28 existing rows untouched · new test client + 4 journey rows removed post-smoke.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "out");
mkdirSync(OUT_DIR, { recursive: true });

const N8N_BASE = process.env.N8N_BASE_URL;
const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK = `${N8N_BASE}/webhook/l1-dispatch`;

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const ts = new Date().toISOString().replace(/[:.]/g, "-");

// Step 1 · create synthetic test client
const TEST_CLIENT_ID = randomUUID();
console.log("[smoke] creating synthetic test client", TEST_CLIENT_ID);
const { error: cliErr } = await supa.from("clients").insert({
  id: TEST_CLIENT_ID,
  name: `L1-MIGRATION-SMOKE-${ts.slice(0, 16)}`,
  slug: `l1-migration-smoke-${ts.slice(0, 16).toLowerCase().replace(/[:t]/g, "-")}`,
  status: "active",
});

if (cliErr) {
  console.error("[smoke] client insert err:", cliErr.message);
  process.exit(2);
}

const cleanup = async () => {
  console.log("\n[smoke] CLEANUP · deleting test client + journey rows...");
  const { error: jErr } = await supa.from("client_journey_state").delete().eq("client_id", TEST_CLIENT_ID);
  if (jErr) console.error("  journey rows cleanup err:", jErr.message);
  const { error: cErr } = await supa.from("clients").delete().eq("id", TEST_CLIENT_ID);
  if (cErr) console.error("  client cleanup err:", cErr.message);
  console.log("  cleanup done");
};

const results = { test_client_id: TEST_CLIENT_ID, smokes: [], rows_created: [] };

try {
  // Step 2 · smoke 4 sequential cases · same client_id, different journey per case (1 row per journey)
  const CASES = [
    { label: "ONBOARD", body: { client_id: TEST_CLIENT_ID, journey: "ONBOARD", trigger_type: "manual", trigger_source: "sprint8c-l1-smoke", params: { smoke: true } } },
    { label: "PRODUCE", body: { client_id: TEST_CLIENT_ID, journey: "PRODUCE", trigger_type: "manual", trigger_source: "sprint8c-l1-smoke", params: { smoke: true, campaign_name: "smoke-camp" } } },
    { label: "ALWAYS_ON", body: { client_id: TEST_CLIENT_ID, journey: "ALWAYS_ON", trigger_type: "cron", trigger_source: "sprint8c-l1-smoke", params: { smoke: true } } },
    { label: "REVIEW", body: { client_id: TEST_CLIENT_ID, journey: "REVIEW", trigger_type: "manual", trigger_source: "sprint8c-l1-smoke", params: { smoke: true } } },
  ];

  for (const c of CASES) {
    console.log(`[smoke] POST · ${c.label}`);
    const t0 = Date.now();
    const r = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
    });
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 500) }; }
    const sr = { case: c.label, ok: r.ok, status: r.status, latency_ms: Date.now() - t0, response: json };
    results.smokes.push(sr);
    console.log(`  → ${r.status} · ${sr.latency_ms}ms · dispatch_status: ${json.dispatch_status ?? "?"} · journey_id: ${json.journey_id ?? "?"}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Step 3 · verify rows
  console.log("\n[smoke] verifying rows for test client...");
  const { data: rows } = await supa
    .from("client_journey_state")
    .select("id, journey, current_stage, status, metadata, trigger_source")
    .eq("client_id", TEST_CLIENT_ID);

  results.rows_created = rows ?? [];
  console.log(`[smoke] rows found: ${(rows ?? []).length}`);
  for (const r of rows ?? []) {
    console.log(`  · ${r.journey} · stage=${r.current_stage} · status=${r.status} · engine=${r.metadata?.engine} · src=${r.trigger_source} · id=${r.id}`);
  }

  // Aggregate
  const dispatched = results.smokes.filter((s) => s.response?.dispatch_status === "dispatched").length;
  const stubbed = results.smokes.filter((s) => s.response?.dispatch_status === "stubbed").length;
  const failed = results.smokes.filter((s) => s.response?.dispatch_status === "failed").length;
  const n8nEngine = (results.rows_created || []).filter((r) => r.metadata?.engine === "n8n-l1").length;

  console.log("\n[smoke] AGGREGATE ·");
  console.log(`  HTTP ok       · ${results.smokes.filter((s) => s.ok).length}/4`);
  console.log(`  dispatched    · ${dispatched}`);
  console.log(`  stubbed       · ${stubbed}`);
  console.log(`  failed        · ${failed}`);
  console.log(`  rows created  · ${(results.rows_created || []).length}/4`);
  console.log(`  engine=n8n-l1 · ${n8nEngine}/4`);

  writeFileSync(resolve(OUT_DIR, `05-smoke-${ts}.json`), JSON.stringify(results, null, 2));
  console.log(`\n[smoke] summary → out/05-smoke-${ts}.json`);
} finally {
  await cleanup();
}
