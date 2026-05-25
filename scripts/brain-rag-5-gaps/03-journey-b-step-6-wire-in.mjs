#!/usr/bin/env node
/**
 * Sprint 8D Brain RAG Gap 4 wire-in · update Journey B Step 6.
 *
 * Step 6 (currently noOp post Sprint 8D Finding 1) → httpRequest invoking
 * /api/brain/ingest-source canonical. Per-onboarding · brand_book chunks
 * inserted automatically · client_brain_chunks coverage extends a clientes nuevos.
 *
 * Single source ingest (brand_book) en este wire-in · ICP + competitive sources
 * via Step 6b/6c (Sprint 9 candidate enhancement). Reduces complexity para ETA.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../outputs/brain-rag-5-gaps");
mkdirSync(OUT, { recursive: true });

const WF_ID = "RwUo7G2PmZNqyMbe";
const N8N = process.env.N8N_BASE_URL;
const KEY = process.env.N8N_API_KEY;
const ts = new Date().toISOString().replace(/[:.]/g, "-");

const wf = await fetch(`${N8N}/api/v1/workflows/${WF_ID}`, {
  headers: { "X-N8N-API-KEY": KEY, Accept: "application/json" },
}).then((r) => r.json());

writeFileSync(resolve(OUT, `journey-b-pre-step-6-wire-in-${ts}.json`), JSON.stringify(wf, null, 2));
console.log("[wire-in] backup saved · ts:", ts);

const s6Idx = wf.nodes.findIndex((n) => n.id === "step-6-populate-client-brain");
if (s6Idx < 0) {
  console.error("step-6 not found");
  process.exit(2);
}

// Replace Step 6 noOp with httpRequest invoking ingest-source for brand_book
// Step 3 brand-strategist response provides the source text · 1 section (whole brand book as blob)
// Future enhancement Sprint 9 · structured parsing into per-attribute sections + add Step 6b/6c for ICP/competitive
wf.nodes[s6Idx] = {
  id: "step-6-populate-client-brain",
  name: "Step 6 · populate Client Brain (5 tablas)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: wf.nodes[s6Idx].position,
  continueOnFail: true,
  parameters: {
    method: "POST",
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/brain/ingest-source",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "x-api-key", value: "={{ $env.INTERNAL_API_KEY }}" },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    contentType: "json",
    specifyBody: "json",
    jsonBody: `={\n  "client_id": "{{ $json.client_id }}",\n  "source_table": "client_brand_books",\n  "source_id": "{{ $json._journey_id || $json.client_id }}",\n  "sections": [\n    {\n      "section_label": "brand_book_v0",\n      "text": {{ JSON.stringify(($node['Step 3 · brand-strategist auto-generate Brand Book v0'].json && $node['Step 3 · brand-strategist auto-generate Brand Book v0'].json.response) || 'Brand book pending · onboarding-specialist did not return response.') }}\n    }\n  ],\n  "metadata": {\n    "ingested_via": "journey-b-step-6",\n    "journey_id": "{{ $json._journey_id }}",\n    "sprint": "8d-gap-4-wire-in"\n  }\n}`,
    options: { timeout: 30000 },
  },
  notes: "Sprint 8D Gap 4 wire-in · 2026-05-25 CC#3 · was noOp · now invokes /api/brain/ingest-source with Step 3 brand_book response · ICP + competitive ingest pending Sprint 9 enhancement (Step 6b/6c)",
};

const putRes = await fetch(`${N8N}/api/v1/workflows/${WF_ID}`, {
  method: "PUT",
  headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: wf.settings?.executionOrder || "v1" },
  }),
});
console.log("[wire-in] PUT status:", putRes.status);
if (!putRes.ok) { console.error(await putRes.text()); process.exit(3); }

// Verify
const v = await fetch(`${N8N}/api/v1/workflows/${WF_ID}`, {
  headers: { "X-N8N-API-KEY": KEY, Accept: "application/json" },
}).then((r) => r.json());
const vs6 = v.nodes.find((n) => n.id === "step-6-populate-client-brain");
writeFileSync(resolve(OUT, `journey-b-post-step-6-wire-in-${ts}.json`), JSON.stringify(v, null, 2));
console.log("[wire-in] Step 6 type post:", vs6?.type, "· url:", vs6?.parameters?.url?.slice(0, 80));
console.log(vs6?.type === "n8n-nodes-base.httpRequest" && vs6?.parameters?.url?.includes("ingest-source") ? "\n[wire-in] ✅ SUCCESS" : "\n[wire-in] ❌ FAIL");
