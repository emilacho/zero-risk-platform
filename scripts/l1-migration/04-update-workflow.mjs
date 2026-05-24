#!/usr/bin/env node
/**
 * Sprint 8C · L1 migration · update existing workflow with PUT.
 * n8n public API supports PUT /workflows/{id} for full replace.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(__dirname, "../../n8n-workflows/sprint8c-l1-master-journey/l1-master-journey-orchestrator.json");
const WF_ID = "U7SzRbYhYAS2IE1h";
const N8N_BASE = process.env.N8N_BASE_URL;
const N8N_KEY = process.env.N8N_API_KEY;

const workflow = JSON.parse(readFileSync(WORKFLOW_PATH, "utf8"));
const payload = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings || { executionOrder: "v1" },
};

const res = await fetch(`${N8N_BASE}/api/v1/workflows/${WF_ID}`, {
  method: "PUT",
  headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(payload),
});
const body = await res.text();
console.log("status:", res.status);
console.log("response (first 500):", body.slice(0, 500));
