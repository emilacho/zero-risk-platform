#!/usr/bin/env node
/**
 * Sprint 8D Brain RAG Gap 1 wire-in · n8n cron workflow daily reindex-stale.
 *
 * Creates workflow "Zero Risk — Brain Daily Re-index (Cron 3am UTC)" via n8n
 * public API · trigger scheduleTrigger 0 3 * * * (3am UTC daily) · single
 * httpRequest a /api/brain/reindex-stale con max_per_table=10 · respuesta
 * logged but not gated (cron fires regardless).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../outputs/brain-rag-5-gaps");
mkdirSync(OUT, { recursive: true });

const N8N = process.env.N8N_BASE_URL;
const KEY = process.env.N8N_API_KEY;
const ts = new Date().toISOString().replace(/[:.]/g, "-");

const wf = {
  name: "Zero Risk — Brain Daily Re-index (Cron 3am UTC · Sprint 8D)",
  nodes: [
    {
      id: "cron-trigger",
      name: "Daily 3am UTC",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [240, 300],
      parameters: {
        rule: {
          interval: [{ field: "cronExpression", expression: "0 3 * * *" }],
        },
      },
    },
    {
      id: "call-reindex-stale",
      name: "POST /api/brain/reindex-stale",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [480, 300],
      continueOnFail: true,
      parameters: {
        method: "POST",
        url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/brain/reindex-stale",
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
        jsonBody: `={\n  "dry_run": false,\n  "max_per_table": 10\n}`,
        options: { timeout: 60000 },
      },
    },
    {
      id: "log-result",
      name: "Log result (Slack on errors)",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [720, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          combinator: "and",
          conditions: [
            {
              leftValue: "={{ $json.total_errors }}",
              rightValue: 0,
              operator: { type: "number", operation: "gt" },
            },
          ],
        },
      },
    },
    {
      id: "notify-slack",
      name: "Notify Slack on errors",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, 220],
      continueOnFail: true,
      parameters: {
        method: "POST",
        url: "={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}",
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: `={\n  "text": "Brain daily re-index encountered errors · detected={{ $json.total_detected }} reindexed={{ $json.total_reindexed }} errors={{ $json.total_errors }} · review summary"\n}`,
        options: { timeout: 10000 },
      },
    },
    {
      id: "success-end",
      name: "Success path (no-op)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [960, 380],
      parameters: {},
    },
  ],
  connections: {
    "Daily 3am UTC": { main: [[{ node: "POST /api/brain/reindex-stale", type: "main", index: 0 }]] },
    "POST /api/brain/reindex-stale": { main: [[{ node: "Log result (Slack on errors)", type: "main", index: 0 }]] },
    "Log result (Slack on errors)": {
      main: [
        [{ node: "Notify Slack on errors", type: "main", index: 0 }],
        [{ node: "Success path (no-op)", type: "main", index: 0 }],
      ],
    },
  },
  settings: { executionOrder: "v1" },
};

const r = await fetch(`${N8N}/api/v1/workflows`, {
  method: "POST",
  headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(wf),
});
const body = await r.text();
console.log("[cron-create] POST status:", r.status);

if (!r.ok) {
  console.error("FAIL:", body.slice(0, 600));
  process.exit(2);
}

const created = JSON.parse(body);
const id = created.id;
console.log("[cron-create] workflow_id:", id, "· active:", created.active);
writeFileSync(resolve(OUT, `cron-workflow-created-${ts}.json`), JSON.stringify(created, null, 2));

// Activate
const act = await fetch(`${N8N}/api/v1/workflows/${id}/activate`, {
  method: "POST",
  headers: { "X-N8N-API-KEY": KEY, Accept: "application/json" },
});
console.log("[cron-create] activate status:", act.status);

// Verify
const v = await fetch(`${N8N}/api/v1/workflows/${id}`, {
  headers: { "X-N8N-API-KEY": KEY, Accept: "application/json" },
}).then((r) => r.json());
console.log("[cron-create] active post:", v.active);
console.log(v.active ? "\n[cron-create] ✅ SUCCESS · workflow live · fires daily 3am UTC" : "\n[cron-create] ❌ activation failed");
