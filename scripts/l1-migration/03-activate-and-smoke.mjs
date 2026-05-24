#!/usr/bin/env node
/**
 * Sprint 8C · L1 migration · Fase 4 step 2.
 * Activates L1 workflow + smokes 3 journeys (ONBOARD · PRODUCE · ALWAYS_ON) + 1 stub (REVIEW)
 * with FRESH synthetic UUIDs (NOT touching the 28 existing live rows).
 *
 * BACKWARD COMPAT MANDATORY · we only INSERT new rows · we never UPDATE existing.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "out");
mkdirSync(OUT_DIR, { recursive: true });

const WF_ID = "U7SzRbYhYAS2IE1h";
const N8N_BASE = process.env.N8N_BASE_URL;
const N8N_KEY = process.env.N8N_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK = `${N8N_BASE}/webhook/l1-dispatch`;

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const results = { activation: null, smokes: [], rows_created: [] };

// Step 1 · activate workflow
console.log("[L1-smoke] activating workflow", WF_ID);
const actRes = await fetch(`${N8N_BASE}/api/v1/workflows/${WF_ID}/activate`, {
  method: "POST",
  headers: { "X-N8N-API-KEY": N8N_KEY, Accept: "application/json" },
});
const actBody = await actRes.text();
results.activation = { status: actRes.status, body: actBody.slice(0, 300) };
console.log("[L1-smoke] activation status:", actRes.status);

if (!actRes.ok) {
  writeFileSync(resolve(OUT_DIR, `03-smoke-${ts}.json`), JSON.stringify(results, null, 2));
  console.error("[L1-smoke] ABORT · activation failed");
  process.exit(2);
}

// Allow webhook to register
await new Promise((r) => setTimeout(r, 3000));

// Step 2 · smoke 4 cases · 3 live journeys + 1 stub
const CASES = [
  {
    label: "ONBOARD · kickoff (synthetic)",
    body: {
      client_id: randomUUID(),
      journey: "ONBOARD",
      trigger_type: "manual",
      trigger_source: "sprint8c-l1-smoke",
      params: { smoke: true, sprint: "8C", phase: "4" },
    },
  },
  {
    label: "PRODUCE · brief_intake (synthetic)",
    body: {
      client_id: randomUUID(),
      journey: "PRODUCE",
      trigger_type: "manual",
      trigger_source: "sprint8c-l1-smoke",
      params: { smoke: true, sprint: "8C", phase: "4", campaign_name: "smoke-camp" },
    },
  },
  {
    label: "ALWAYS_ON · monitoring (synthetic)",
    body: {
      client_id: randomUUID(),
      journey: "ALWAYS_ON",
      trigger_type: "cron",
      trigger_source: "sprint8c-l1-smoke",
      params: { smoke: true, sprint: "8C", phase: "4" },
    },
  },
  {
    label: "REVIEW · stub (synthetic)",
    body: {
      client_id: randomUUID(),
      journey: "REVIEW",
      trigger_type: "manual",
      trigger_source: "sprint8c-l1-smoke",
      params: { smoke: true, sprint: "8C", phase: "4" },
    },
  },
];

for (const c of CASES) {
  console.log(`[L1-smoke] POST · ${c.label} · client_id=${c.body.client_id}`);
  const t0 = Date.now();
  let smokeResult;
  try {
    const r = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
    });
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 500) }; }
    smokeResult = { ok: r.ok, status: r.status, latency_ms: Date.now() - t0, response: json };
  } catch (e) {
    smokeResult = { ok: false, error: e.message, latency_ms: Date.now() - t0 };
  }
  results.smokes.push({ case: c.label, client_id: c.body.client_id, ...smokeResult });
  console.log(`  → ${smokeResult.status ?? "ERR"} · ${smokeResult.latency_ms}ms · ok=${smokeResult.ok}`);
  if (smokeResult.response) {
    console.log(`  → dispatch_status: ${smokeResult.response.dispatch_status} · journey_id: ${smokeResult.response.journey_id}`);
  }
  // 1s spacing between requests
  await new Promise((r) => setTimeout(r, 1000));
}

// Step 3 · verify rows created in Supabase
console.log("[L1-smoke] verifying rows in client_journey_state...");
const clientIds = results.smokes.map((s) => s.client_id);
const { data: createdRows, error } = await supa
  .from("client_journey_state")
  .select("id, client_id, journey, current_stage, status, metadata, started_at")
  .in("client_id", clientIds);

if (error) {
  results.row_check_error = error.message;
  console.error("[L1-smoke] row check err:", error.message);
} else {
  results.rows_created = createdRows;
  console.log(`[L1-smoke] rows found: ${createdRows.length} (expected ${clientIds.length})`);
  for (const r of createdRows) {
    const engine = r.metadata?.engine ?? "<none>";
    console.log(`  · ${r.journey} · stage=${r.current_stage} · status=${r.status} · engine=${engine} · id=${r.id}`);
  }
}

// Write summary
writeFileSync(resolve(OUT_DIR, `03-smoke-${ts}.json`), JSON.stringify(results, null, 2));
console.log(`[L1-smoke] summary → out/03-smoke-${ts}.json`);

// Aggregate
const ok = results.smokes.filter((s) => s.ok).length;
const dispatched = results.smokes.filter((s) => s.response?.dispatch_status === "dispatched").length;
const stubbed = results.smokes.filter((s) => s.response?.dispatch_status === "stubbed").length;
const failed = results.smokes.filter((s) => s.response?.dispatch_status === "failed").length;
const n8nEngine = (results.rows_created || []).filter((r) => r.metadata?.engine === "n8n-l1").length;

console.log("\n[L1-smoke] AGGREGATE ·");
console.log(`  HTTP ok       · ${ok}/${results.smokes.length}`);
console.log(`  dispatched    · ${dispatched}`);
console.log(`  stubbed       · ${stubbed}`);
console.log(`  failed        · ${failed}`);
console.log(`  rows created  · ${(results.rows_created || []).length}`);
console.log(`  engine=n8n-l1 · ${n8nEngine}`);
