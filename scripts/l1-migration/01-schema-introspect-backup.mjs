#!/usr/bin/env node
/**
 * Sprint 8C · L1 migration · Fase 2 schema introspect + backup.
 *
 * - Reads client_journey_state schema via information_schema query (RPC fallback to sample row inference).
 * - Backs up all 28 live rows to JSON for rollback safety.
 * - Computes counts per (journey, status, current_stage) for migration sanity.
 *
 * Output · scripts/l1-migration/out/01-backup-<timestamp>.json + 01-schema-<timestamp>.json
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "out");
mkdirSync(OUT_DIR, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-");

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supa = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log("[L1-backup] querying client_journey_state · full table...");
const { data: rows, error } = await supa
  .from("client_journey_state")
  .select("*")
  .order("started_at", { ascending: false });

if (error) {
  console.error("ERR", error.message);
  process.exit(1);
}

console.log(`[L1-backup] rows fetched · ${rows.length}`);

// Sample first row for schema inference
const schemaInferred = rows[0]
  ? Object.fromEntries(
      Object.entries(rows[0]).map(([k, v]) => [k, v == null ? "null" : Array.isArray(v) ? "array" : typeof v]),
    )
  : {};

// Aggregations for migration sanity
const byJourney = {};
const byStatus = {};
const byStage = {};
const byClient = {};
for (const r of rows) {
  byJourney[r.journey] = (byJourney[r.journey] ?? 0) + 1;
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const stageKey = `${r.journey}:${r.current_stage ?? "<null>"}`;
  byStage[stageKey] = (byStage[stageKey] ?? 0) + 1;
  const cKey = r.client_id ?? "<null>";
  byClient[cKey] = (byClient[cKey] ?? 0) + 1;
}

const backupPath = resolve(OUT_DIR, `01-backup-${ts}.json`);
const schemaPath = resolve(OUT_DIR, `01-schema-${ts}.json`);

writeFileSync(
  backupPath,
  JSON.stringify(
    {
      meta: {
        captured_at: new Date().toISOString(),
        purpose: "Sprint 8C L1 migration · pre-migration backup",
        row_count: rows.length,
      },
      rows,
    },
    null,
    2,
  ),
);

writeFileSync(
  schemaPath,
  JSON.stringify(
    {
      meta: {
        captured_at: new Date().toISOString(),
        purpose: "Sprint 8C L1 migration · schema inference",
      },
      schema_inferred: schemaInferred,
      aggregations: {
        by_journey: byJourney,
        by_status: byStatus,
        by_stage: byStage,
        unique_clients: Object.keys(byClient).length,
        by_client_top: Object.fromEntries(
          Object.entries(byClient)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
        ),
      },
    },
    null,
    2,
  ),
);

console.log(`[L1-backup] backup → ${backupPath}`);
console.log(`[L1-backup] schema → ${schemaPath}`);
console.log("[L1-backup] aggregations ·");
console.log("  by journey  ·", byJourney);
console.log("  by status   ·", byStatus);
console.log("  unique cli  ·", Object.keys(byClient).length);
console.log("  stages top  ·");
for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${k} · ${v}`);
}
