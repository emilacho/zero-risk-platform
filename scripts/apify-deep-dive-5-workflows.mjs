#!/usr/bin/env node
/**
 * Sprint 9 · Apify criticality audit · Fase 1 deep dive 5 Apify-consumer workflows.
 *
 * Pull canonical workflow JSON + executions historic per workflow · per node ·
 * dump structured data canonical para análisis nodo-por-nodo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../outputs/apify-criticality-audit");
mkdirSync(OUT, { recursive: true });

const envPath = resolve(__dirname, "../.env.local");
const envText = readFileSync(envPath, "utf8");
const envMap = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const idx = l.indexOf("=");
    return [l.slice(0, idx), l.slice(idx + 1)];
  }),
);

const N8N_BASE_URL = envMap.N8N_BASE_URL || "https://n8n-production-72be.up.railway.app";
const N8N_API_KEY = envMap.N8N_API_KEY;
if (!N8N_API_KEY) {
  console.error("N8N_API_KEY missing");
  process.exit(2);
}

const TARGETS = [
  { id: "Gi2wq9baSRB3jQ0L", name: "Cost Watchdog Multi-Service v2 (Cron Hourly)" },
  { id: "UXbdTjboMIG5MIIC", name: "Competitor Daily Monitor (6am)" },
  { id: "Dz2n5bA3yW89I2Ye", name: "Cliente Nuevo · Landing Cascade Master" },
  { id: "vRSkPFxe5IbdQbz3", name: "Competitive Intelligence 5-Layer Deep Scan" },
  { id: "1N06wMqgFdvL0t2j", name: "Community Health Daily (Daily 8am)" },
];

async function n8n(path) {
  const res = await fetch(`${N8N_BASE_URL}${path}`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" },
  });
  return res.json();
}

function extractNodeSummary(node) {
  const summary = {
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    disabled: node.disabled || false,
    continueOnFail: node.continueOnFail || false,
    retryOnFail: node.retryOnFail || false,
  };

  // Type-specific extraction
  if (node.type === "n8n-nodes-base.httpRequest") {
    summary.method = node.parameters?.method || "GET";
    summary.url = node.parameters?.url || "";
    summary.is_apify = (node.parameters?.url || "").toLowerCase().includes("apify.com");
    summary.body_type = node.parameters?.specifyBody || node.parameters?.bodyParameters?.parameters ? "json/params" : "none";
    summary.send_headers = node.parameters?.sendHeaders || false;
    summary.headers_count = node.parameters?.headerParameters?.parameters?.length || 0;
    summary.timeout = node.parameters?.options?.timeout;
    if (summary.is_apify) {
      summary.apify_actor = (summary.url.match(/acts\/([^/?]+)/) || [])[1];
      summary.apify_body_preview = JSON.stringify(node.parameters?.jsonBody || node.parameters?.bodyParameters || {}).slice(0, 800);
    }
  } else if (node.type === "n8n-nodes-base.code") {
    summary.language = node.parameters?.language || "javaScript";
    summary.code_preview = (node.parameters?.jsCode || node.parameters?.pythonCode || "").slice(0, 400);
  } else if (node.type === "n8n-nodes-base.supabase" || node.type === "@n8n/n8n-nodes-langchain.supabase") {
    summary.operation = node.parameters?.operation;
    summary.table = node.parameters?.tableId || node.parameters?.table;
  } else if (node.type === "n8n-nodes-base.webhook") {
    summary.http_method = node.parameters?.httpMethod;
    summary.path = node.parameters?.path;
    summary.response_mode = node.parameters?.responseMode;
  } else if (node.type === "n8n-nodes-base.cron" || node.type === "n8n-nodes-base.scheduleTrigger") {
    summary.cron_expr = JSON.stringify(node.parameters?.rule || node.parameters?.triggerTimes || {}).slice(0, 200);
  } else if (node.type === "n8n-nodes-base.if" || node.type === "n8n-nodes-base.switch") {
    summary.conditions = JSON.stringify(node.parameters?.conditions || node.parameters?.rules || {}).slice(0, 300);
  } else if (node.type === "n8n-nodes-base.set") {
    summary.fields = JSON.stringify(node.parameters?.values || node.parameters?.assignments || {}).slice(0, 300);
  }

  return summary;
}

const allResults = [];

for (const target of TARGETS) {
  console.log(`\n[deep-dive] ${target.id} · ${target.name}`);

  const wf = await n8n(`/api/v1/workflows/${target.id}`);
  const nodes = wf.nodes || [];
  const conns = wf.connections || {};
  const trigger = nodes.find((n) =>
    n.type.includes("Trigger") ||
    n.type.includes("webhook") ||
    n.type.includes("cron") ||
    n.type.includes("scheduleTrigger"),
  );

  // Executions historic (last 50)
  const execs = await n8n(`/api/v1/executions?workflowId=${target.id}&limit=50`);
  const execList = execs.data || [];
  const successCount = execList.filter((e) => e.finished && e.status !== "error").length;
  const errorCount = execList.filter((e) => e.status === "error").length;
  const lastExec = execList[0];

  const nodeSummaries = nodes.map(extractNodeSummary);
  const apifyNodes = nodeSummaries.filter((n) => n.is_apify);

  // Build execution order via topological-ish trace from trigger
  const execOrder = [];
  if (trigger) {
    const visited = new Set();
    const queue = [trigger.name];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      execOrder.push(cur);
      const nextEdges = conns[cur]?.main?.[0] || [];
      for (const edge of nextEdges) {
        if (edge?.node) queue.push(edge.node);
      }
    }
  }

  const result = {
    workflow_id: target.id,
    workflow_name: wf.name || target.name,
    active: wf.active,
    node_count: nodes.length,
    trigger_node: trigger?.name,
    trigger_type: trigger?.type,
    trigger_params: trigger?.parameters || {},
    apify_node_count: apifyNodes.length,
    apify_actors: apifyNodes.map((n) => n.apify_actor).filter(Boolean),
    apify_nodes_detail: apifyNodes,
    all_nodes: nodeSummaries,
    execution_order: execOrder,
    connections: conns,
    executions_historic_50: {
      total: execList.length,
      success: successCount,
      error: errorCount,
      last_exec: lastExec
        ? {
            id: lastExec.id,
            started: lastExec.startedAt,
            stopped: lastExec.stoppedAt,
            status: lastExec.status,
            mode: lastExec.mode,
          }
        : null,
    },
  };

  console.log(`  · nodes: ${nodes.length} · apify: ${apifyNodes.length} · execs50: ${execList.length} (${successCount}✓/${errorCount}✗)`);
  if (apifyNodes.length > 0) {
    console.log(`  · apify actors: ${result.apify_actors.join(", ")}`);
  }

  allResults.push(result);

  // Write per-workflow detailed JSON
  writeFileSync(resolve(OUT, `wf-${target.id}-detail.json`), JSON.stringify(result, null, 2));
}

writeFileSync(resolve(OUT, "fase1-deep-dive-all.json"), JSON.stringify(allResults, null, 2));

console.log("\n[deep-dive] ✅ all 5 workflows analyzed · outputs/apify-criticality-audit/");
