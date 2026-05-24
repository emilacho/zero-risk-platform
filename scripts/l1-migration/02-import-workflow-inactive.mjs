#!/usr/bin/env node
/**
 * Sprint 8C · L1 migration · Fase 4 step 1.
 * Imports L1 Master Journey Orchestrator workflow to n8n live · INACTIVE.
 * Activation deferred to step 2 post smoke planning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(__dirname, "../../n8n-workflows/sprint8c-l1-master-journey/l1-master-journey-orchestrator.json");
const OUT_DIR = resolve(__dirname, "out");

const N8N_BASE = process.env.N8N_BASE_URL;
const N8N_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE || !N8N_KEY) {
  console.error("ERR · N8N_BASE_URL or N8N_API_KEY missing");
  process.exit(1);
}

const workflow = JSON.parse(readFileSync(WORKFLOW_PATH, "utf8"));

// n8n public API requires only · name, nodes, connections, settings
const payload = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings || { executionOrder: "v1" },
};

console.log("[L1-import] POST workflow to n8n...");
const res = await fetch(`${N8N_BASE}/api/v1/workflows`, {
  method: "POST",
  headers: {
    "X-N8N-API-KEY": N8N_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await res.text();
let json;
try { json = JSON.parse(body); } catch { json = { raw: body }; }

console.log("[L1-import] status:", res.status);
console.log("[L1-import] response:", JSON.stringify(json, null, 2).slice(0, 1500));

if (res.ok && json.id) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    resolve(OUT_DIR, `02-import-${ts}.json`),
    JSON.stringify({ status: res.status, workflow_id: json.id, name: json.name, active: json.active, meta: workflow.meta }, null, 2),
  );
  console.log(`[L1-import] SUCCESS · workflow_id ${json.id} · active=${json.active}`);
  console.log(`[L1-import] webhook URL · ${N8N_BASE}/webhook/l1-dispatch`);
} else {
  console.error("[L1-import] FAILED");
  process.exit(2);
}
